// Transport Master: Aeon-style list and form.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast } from '/assets/js/ui.js';
import { cwin, cbtn, csec, crow, cinput, wireHotkeys } from '/assets/js/classic/cui.js';
import { wireEnter } from '/assets/js/classic/nav.js';
import { masterList } from '/assets/js/classic/masterlist.js';

export default async function render(box, ctx, parts) {
  const id = parts[1];
  if (id) return form(box, ctx, id);
  return masterList(box, ctx, {
    title: 'Transport Master',
    endpoint: '/api/transporters',
    noun: 'transporter',
    canHide: true,
    placeholder: 'Search',
    onAdd: () => ctx.navigate('#/transport/new'),
    onEdit: (r) => (r.id === 1 ? toast('SELF DELIVERY is fixed and cannot be changed.') : ctx.navigate(`#/transport/${r.id}`)),
    columns: [
      { key: 'name', label: 'Transporter Name' },
      { key: 'tr_id', label: 'Transporter ID' },
      { key: 'gstin', label: 'GSTIN' },
      { key: 'person', label: 'Contact Person' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'phone', label: 'Phone' },
    ],
    exportName: 'Transport-Master.xlsx',
    exportHeaders: ['Transporter Name', 'Transporter ID', 'GSTIN', 'Contact Person', 'Mobile', 'Phone'],
    exportRow: (r) => [r.name, r.tr_id || '', r.gstin || '', r.person || '', r.mobile || '', r.phone || ''],
  });
}

const FIELDS = [
  ['name', 'Transporter Name', 60], ['tr_id', 'Transporter ID', 20], ['gstin', 'GSTIN', 15], ['address1', 'Address', 80], ['address2', ' ', 80],
  ['person', 'Contact Person', 60], ['phone', 'Phone', 20], ['mobile', 'Mobile', 20], ['email', 'Email ID', 120],
];

async function form(box, ctx, id) {
  const isNew = id === 'new';
  let rec = {};
  if (!isNew) {
    try {
      rec = (await api('GET', '/api/transporters?show=all')).rows.find((r) => String(r.id) === id) || null;
    } catch { rec = null; }
    if (!rec || rec.id === 1) {
      box.append(cwin({ title: 'Transport Master', onClose: () => ctx.navigate('#/transport') }, h('p', { text: rec ? 'SELF DELIVERY is fixed and cannot be changed.' : 'This transporter was not found.' }), cbtn('Back', { onClick: () => ctx.navigate('#/transport') })).el);
      return {};
    }
  }
  const I = {};
  const R = {};
  for (const [k, label, max] of FIELDS) {
    I[k] = cinput({ maxlength: max, 'data-nav': '', class: `ci${k === 'gstin' || k === 'name' ? ' upper' : ''}` });
    R[k] = crow(label, I[k]);
  }
  const setAll = (r) => { for (const [k] of FIELDS) I[k].value = r[k] || ''; };
  setAll(rec);
  const snapshot = () => JSON.stringify(FIELDS.map(([k]) => I[k].value));
  let baseline = snapshot();
  const showErrors = (bad) => {
    let first = null;
    for (const k of Object.keys(R)) {
      R[k].setError(bad[k] || '');
      if (bad[k] && !first) first = I[k];
    }
    if (first) first.focus();
    return !!first;
  };
  let saving = false;
  async function save() {
    if (saving) return;
    const body = {};
    for (const [k] of FIELDS) body[k] = I[k].value;
    if (body.name.trim().length < 2) { showErrors({ name: 'Enter the transporter name.' }); return; }
    saving = true;
    try {
      const res = isNew ? await api('POST', '/api/transporters', body) : await api('PUT', `/api/transporters/${rec.id}`, body);
      rec = res.transporter;
      baseline = snapshot();
      toast('Saved', 'success');
      ctx.navigate('#/transport');
    } catch (e) {
      if (e instanceof ApiError && e.data && e.data.fields) {
        showErrors(e.data.fields);
        if (!Object.keys(e.data.fields).some((k) => R[k])) toast(e.message, 'danger');
      } else toast(e instanceof ApiError ? e.message : 'Could not save. Try again.', 'danger');
    }
    saving = false;
  }
  const bar = h('div', { class: 'cbar' },
    cbtn('Save', { hot: 'S', primary: true, onClick: save }),
    cbtn('Cancel', { hot: 'n', onClick: () => { setAll(rec); showErrors({}); } }),
    cbtn('Back', { hot: 'B', onClick: () => ctx.navigate('#/transport') }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));
  const frm = h('div', { class: 'cform' },
    csec('Transporter Information'),
    h('div', { class: 'cgrid2' }, h('div', null, R.name, R.tr_id, R.gstin), h('div', null, R.address1, R.address2)),
    csec('Contact Information'),
    h('div', { class: 'cgrid2' }, h('div', null, R.person, R.phone), h('div', null, R.mobile, R.email)));
  wireEnter(frm);
  box.append(cwin({ title: 'Transport Master', onClose: () => ctx.navigate('#/transport'), className: 'mid' }, bar, frm).el);
  const off = wireHotkeys(box);
  setTimeout(() => I.name.focus(), 0);
  return { destroy: off, canLeave: () => snapshot() === baseline, back: () => '#/transport' };
}
