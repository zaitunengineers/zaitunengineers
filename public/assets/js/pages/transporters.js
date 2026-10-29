// Settings > Transporters: the names offered in the bill's Transporter box.

import { api, ApiError } from '/assets/js/api.js';
import { h, icon, toast, confirmDialog, field, setFieldError, setButtonLoading, badge } from '/assets/js/ui.js';

export default async function render(box, ctx) {
  ctx.setFab(false);
  let rows = [];
  const list = h('div', { class: 'card tlist' });
  const note = h('p', { class: 'hint', text: 'SELF DELIVERY is always first and cannot be changed. Use the arrows to change the order of the others.' });

  async function load() {
    rows = (await api('GET', '/api/transporters?show=all')).rows;
    paint();
  }

  const fail = (e) => toast(e instanceof ApiError ? e.message : 'Something went wrong. Try again.', 'danger');

  async function move(i, dir) {
    const fixed = rows.filter((r) => r.id !== 1);
    const j = fixed.findIndex((r) => r.id === rows[i].id) + dir;
    const k = fixed.findIndex((r) => r.id === rows[i].id);
    if (j < 0 || j >= fixed.length) return;
    [fixed[k], fixed[j]] = [fixed[j], fixed[k]];
    try {
      for (let n = 0; n < fixed.length; n++) {
        const want = 100 + n * 10;
        if (fixed[n].sort !== want) await api('PUT', `/api/transporters/${fixed[n].id}`, { sort: want });
      }
      await load();
    } catch (e) { fail(e); }
  }

  function rowEl(r, i) {
    const locked = r.id === 1;
    const name = h('div', { class: 't-name' }, locked ? icon('lock') : null, h('span', { text: r.name }), r.active ? null : badge('Hidden', 'muted'));
    const btn = (label, ic, fn, cls = '') => h('button', { type: 'button', class: `btn btn-secondary btn-sm icon-btn ${cls}`, 'aria-label': label, title: label, onclick: fn }, ic);
    const actions = locked
      ? h('div', { class: 't-actions' })
      : h(
          'div',
          { class: 't-actions' },
          btn('Move up', icon('up'), () => move(i, -1)),
          btn('Move down', icon('down'), () => move(i, 1)),
          h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => rename(r, name) }, 'Rename'),
          h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => toggle(r) }, r.active ? 'Hide' : 'Show'),
          btn('Delete', icon('trash'), () => remove(r), 'danger-text')
        );
    return h('div', { class: `trow${r.active ? '' : ' dim'}` }, name, actions);
  }

  function paint() {
    list.replaceChildren(...rows.map(rowEl));
  }

  function rename(r, nameEl) {
    const input = h('input', { class: 'input', maxlength: 60, value: r.name, 'aria-label': 'Transporter name' });
    const save = h('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Save' });
    const cancel = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Cancel' });
    const err = h('div', { class: 'err', role: 'alert' });
    nameEl.replaceChildren(h('div', { class: 'stack tight' }, input, h('div', { class: 'btns' }, cancel, save), err));
    input.focus();
    cancel.addEventListener('click', paint);
    const go = async () => {
      err.textContent = '';
      setButtonLoading(save, true, 'Saving');
      try {
        await api('PUT', `/api/transporters/${r.id}`, { name: input.value });
        await load();
        toast('Saved', 'success');
      } catch (e) {
        err.textContent = e instanceof ApiError ? (e.data && e.data.fields && e.data.fields.name) || e.message : 'Could not save.';
        setButtonLoading(save, false, 'Save');
      }
    };
    save.addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } if (e.key === 'Escape') paint(); });
  }

  async function toggle(r) {
    try {
      await api('PUT', `/api/transporters/${r.id}`, { active: r.active ? 0 : 1 });
      await load();
    } catch (e) { fail(e); }
  }

  async function remove(r) {
    const ok = await confirmDialog({ title: `Delete ${r.name}?`, message: 'This cannot be undone.', confirmText: 'Delete', cancelText: 'Keep it', danger: true });
    if (!ok) return;
    try {
      await api('DELETE', `/api/transporters/${r.id}`);
      await load();
      toast('Deleted', 'success');
    } catch (e) { fail(e); }
  }

  // add box
  const input = h('input', { class: 'input', id: 'new-transporter', maxlength: 60, autocomplete: 'off', placeholder: 'For example: VRL Logistics' });
  const addField = field('Add a transporter', input);
  const addBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus'), 'Add transporter');
  const form = h('form', { class: 'card stack', novalidate: true }, addField, h('div', null, addBtn));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFieldError(addField, '');
    setButtonLoading(addBtn, true, 'Adding');
    try {
      await api('POST', '/api/transporters', { name: input.value });
      input.value = '';
      await load();
      toast('Transporter added', 'success');
    } catch (err) {
      setFieldError(addField, err instanceof ApiError ? (err.data && err.data.fields && err.data.fields.name) || err.message : 'Could not add it.');
    }
    setButtonLoading(addBtn, false, h('span', null, icon('plus'), 'Add transporter'));
  });

  await load();
  box.append(
    h('a', { class: 'crumb', href: '#/settings' }, icon('back'), 'Settings'),
    h('div', { class: 'page-head' }, h('div', null, h('h1', { text: 'Transporters' }), h('p', { class: 'sub', text: "Names shown in the bill's Transporter box." }))),
    h('div', { class: 'stack' }, list, note, form)
  );
}
