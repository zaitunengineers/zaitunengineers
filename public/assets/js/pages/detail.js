// The full page for one client or item: form, save bar, hide / delete menu.

import { api, ApiError } from '/assets/js/api.js';
import { h, icon, toast, confirmDialog, setButtonLoading } from '/assets/js/ui.js';

// cfg: {noun, listLabel, listHref, endpoint, recordKey, makeEditor(record, onChange), after: node|null}
export default async function detailPage(box, ctx, id, cfg) {
  const isNew = id === 'new';
  ctx.setFab(false);
  let record = null;
  if (!isNew) {
    try {
      record = (await api('GET', `${cfg.endpoint}/${encodeURIComponent(id)}`))[cfg.recordKey];
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        box.append(
          h('a', { class: 'crumb', href: cfg.listHref }, icon('back'), cfg.listLabel),
          h('div', { class: 'card empty' }, h('div', { class: 'ico' }, icon('alert')), h('h2', { text: `This ${cfg.noun} was not found` }), h('p', { text: 'It may have been deleted.' }), h('a', { class: 'btn btn-primary', href: cfg.listHref }, `Back to ${cfg.listLabel}`))
        );
        return null;
      }
      throw e;
    }
  }

  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save changes');
  const discardBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Discard');
  const bar = h('div', { class: 'savebar', hidden: true }, h('div', { class: 'msg', text: 'You have unsaved changes.' }), h('div', { class: 'btns' }, discardBtn, saveBtn));
  let editor;
  const refresh = () => { bar.hidden = !editor.isDirty(); };
  editor = cfg.makeEditor(record, refresh);
  const title = h('h1', { text: isNew ? `Add ${cfg.noun}` : record.name });
  const subtitle = h('p', { class: 'sub', text: isNew ? '' : cfg.subtitle ? cfg.subtitle(record) : '' });

  // More menu (edit only)
  let menuWrap = null;
  if (!isNew) {
    const hideItem = h('button', { type: 'button', role: 'menuitem' }, record.active ? 'Hide' : 'Show again');
    const delItem = h('button', { type: 'button', role: 'menuitem', class: 'danger' }, icon('trash'), 'Delete');
    const menu = h('div', { class: 'menu dropdown', role: 'menu', hidden: true }, hideItem, delItem);
    const btn = h('button', { type: 'button', class: 'btn btn-secondary', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, 'More', icon('down'));
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
    const outside = (e) => { if (!menuWrap.contains(e.target)) close(); };
    document.addEventListener('click', outside);
    menuWrap = h('div', { class: 'menu-wrap' }, btn, menu);
    menuWrap.destroy = () => document.removeEventListener('click', outside);

    hideItem.addEventListener('click', async () => {
      close();
      try {
        const res = await api('PUT', `${cfg.endpoint}/${record.id}`, { active: record.active ? 0 : 1 });
        record = res[cfg.recordKey];
        hideItem.textContent = record.active ? 'Hide' : 'Show again';
        toast(record.active ? `${cap(cfg.noun)} shown again` : `${cap(cfg.noun)} hidden. It stays on old bills.`, 'success');
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Could not change it.', 'danger');
      }
    });
    delItem.addEventListener('click', async () => {
      close();
      const ok = await confirmDialog({ title: `Delete ${record.name}?`, message: 'This cannot be undone. If you only want it out of the way, use Hide instead.', confirmText: 'Delete', cancelText: 'Keep it', danger: true });
      if (!ok) return;
      try {
        await api('DELETE', `${cfg.endpoint}/${record.id}`);
        editor.markClean();
        toast(`${cap(cfg.noun)} deleted`, 'success');
        location.hash = cfg.listHref;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Could not delete it.', 'danger');
      }
    });
  }

  const form = editor.el;
  form.append(bar);
  discardBtn.addEventListener('click', () => { editor.reset(record); refresh(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setButtonLoading(saveBtn, true, 'Saving');
    try {
      const saved = await editor.save();
      if (saved) {
        if (isNew) {
          editor.markClean();
          toast(`${cap(cfg.noun)} added`, 'success');
          location.replace(`${cfg.listHref}/${saved.id}`);
          return;
        }
        record = saved;
        editor.set(saved);
        title.textContent = saved.name;
        if (cfg.subtitle) subtitle.textContent = cfg.subtitle(saved);
        refresh();
        toast('Saved', 'success');
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save. Try again.', 'danger');
    }
    setButtonLoading(saveBtn, false, isNew ? 'Save' : 'Save changes');
  });
  if (isNew) { saveBtn.textContent = 'Save'; bar.hidden = false; bar.querySelector('.msg').textContent = ' '; discardBtn.hidden = true; }

  box.append(
    h('a', { class: 'crumb', href: cfg.listHref }, icon('back'), cfg.listLabel),
    h('div', { class: 'page-head' }, h('div', null, title, subtitle), menuWrap),
    form,
    cfg.after || null
  );
  return { canLeave: () => !editor.isDirty(), destroy: () => menuWrap && menuWrap.destroy() };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
