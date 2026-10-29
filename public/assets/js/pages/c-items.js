// Item/Service Master: Aeon-style list and form. Same records as the Stage 2 items.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast } from '/assets/js/ui.js';
import { cwin, cbtn, csec, crow, cinput, wireHotkeys } from '/assets/js/classic/cui.js';
import { wireEnter } from '/assets/js/classic/nav.js';
import { masterList } from '/assets/js/classic/masterlist.js';

const GST = [[0, '0%'], [25, '0.25%'], [300, '3%'], [500, '5%'], [1200, '12%'], [1800, '18%'], [2800, '28%'], [4000, '40%']];
const UQC = ['NOS', 'PCS', 'SET', 'KGS', 'MTR', 'LTR', 'BOX', 'PRS', 'GMS', 'SQM', 'CTN', 'BAG', 'BTL', 'DOZ', 'TON', 'UNT', 'OTH'];
const KINDS = [['goods', 'Goods'], ['service', 'Service'], ['service_goods', 'Service with Goods']];
const rs = (p) => (p === null || p === undefined ? '' : (p / 100).toFixed(2));
const kindText = (k) => (KINDS.find((x) => x[0] === k) || KINDS[0])[1];

export default async function render(box, ctx, parts) {
  const id = parts[1];
  if (id) return form(box, ctx, id);
  let groups = [];
  try { groups = (await api('GET', '/api/item-groups')).rows; } catch { groups = []; }
  const gname = (gid) => (groups.find((g) => g.id === gid) || {}).name || '';
  return masterList(box, ctx, {
    title: 'Item/Service Master',
    endpoint: '/api/items',
    noun: 'item',
    canHide: true,
    placeholder: 'Search name, code or HSN',
    importHref: '#/settings/import',
    onAdd: () => ctx.navigate('#/itemmaster/new'),
    onEdit: (r) => ctx.navigate(`#/itemmaster/${r.id}`),
    columns: [
      { key: 'name', label: 'Item Name' },
      { key: 'item_code', label: 'Item Code' },
      { key: 'kindText', label: 'Type' },
      { key: 'group', label: 'Group' },
      { key: 'code', label: 'HSN/SAC' },
      { key: 'gst', label: 'GST %', num: true },
      { key: 'uom', label: 'Unit' },
      { key: 'rate', label: 'Sale Rate', num: true },
    ],
    prepare: (rows) => rows.map((r) => ({ ...r, kindText: kindText(r.kind), group: gname(r.item_group_id), gst: `${(r.gst_bp / 100).toString()}`, rate: rs(r.rate_paise) })),
    exportName: 'Item-Service-Master.xlsx',
    exportHeaders: ['Item Name', 'Item Code', 'Type', 'Group', 'HSN/SAC', 'GST %', 'Unit', 'Sale Rate'],
    exportRow: (r) => [r.name, r.item_code || '', r.kindText, r.group, r.code || '', r.gst, r.uom, r.rate],
  });
}

async function form(box, ctx, id) {
  const isNew = id === 'new';
  let rec = {};
  let groups = [];
  try { groups = (await api('GET', '/api/item-groups')).rows; } catch { groups = []; }
  if (!isNew) {
    try {
      rec = (await api('GET', `/api/items/${encodeURIComponent(id)}`)).item;
    } catch (e) {
      box.append(cwin({ title: 'Item/Service Master', onClose: () => ctx.navigate('#/itemmaster') }, h('p', { text: e instanceof ApiError && e.status === 404 ? 'This item was not found. It may have been deleted.' : 'Could not load this item.' }), cbtn('Back', { onClick: () => ctx.navigate('#/itemmaster') })).el);
      return {};
    }
  }
  const I = {};
  const R = {};
  const mk = (key, label, o = {}) => {
    const input = o.select ? h('select', { class: 'ci', 'data-nav': '' }, o.select) : cinput({ maxlength: o.max, inputmode: o.inputmode, 'data-nav': '' });
    I[key] = input;
    R[key] = crow(label, input, { hint: o.hint });
    return R[key];
  };
  mk('name', 'Item Name', { max: 120 });
  mk('item_code', 'Item Code', { max: 30 });
  mk('alias', 'Item Alias', { max: 60 });
  mk('kind', 'Item Type', { select: KINDS.map(([v, t]) => h('option', { value: v, text: t })) });
  mk('item_group_id', 'Item Group', { select: [h('option', { value: '', text: '(none)' }), ...groups.map((g) => h('option', { value: String(g.id), text: g.name }))] });
  mk('brand', 'Brand', { max: 60 });
  mk('code', 'HSN/SAC Code', { max: 8, inputmode: 'numeric', hint: '4, 6 or 8 digits' });
  mk('gst_bp', 'GST %', { select: GST.map(([v, t]) => h('option', { value: String(v), text: t })) });
  mk('uom', 'Sale Unit', { max: 10 });
  mk('uqc', 'UQC', { select: [h('option', { value: '', text: '(none)' }), ...UQC.map((u) => h('option', { value: u, text: u }))] });
  mk('rate', 'Sale Rate', { max: 14, inputmode: 'decimal' });
  mk('purchase_rate', 'Purchase Rate', { max: 14, inputmode: 'decimal' });
  mk('mrp', 'MRP', { max: 14, inputmode: 'decimal' });
  mk('qty_decimals', 'Qty Decimals', { select: [0, 1, 2, 3].map((n) => h('option', { value: String(n), text: String(n) })) });
  mk('description', 'Description', { max: 200 });
  const req = h('input', { type: 'checkbox', 'data-nav': '' });
  R.desc_required = crow('Description required on bill', req);
  const notes = h('textarea', { class: 'ci', rows: 3, maxlength: 500, 'data-nav': '' });
  I.notes = notes;
  R.notes = crow('Notes', notes, { hint: 'For you only. Never printed.' });

  const setAll = (r) => {
    I.name.value = r.name || '';
    I.item_code.value = r.item_code || '';
    I.alias.value = r.alias || '';
    I.kind.value = r.kind || 'goods';
    I.item_group_id.value = r.item_group_id ? String(r.item_group_id) : '';
    I.brand.value = r.brand || '';
    I.code.value = r.code || '';
    I.gst_bp.value = String(r.gst_bp ?? 1800);
    I.uom.value = r.uom || 'NOS';
    I.uqc.value = r.uqc || '';
    I.rate.value = rs(r.rate_paise);
    I.purchase_rate.value = rs(r.purchase_rate_paise);
    I.mrp.value = rs(r.mrp_paise);
    I.qty_decimals.value = String(r.qty_decimals ?? 0);
    I.description.value = r.description || '';
    req.checked = !!r.desc_required;
    notes.value = r.notes || '';
  };
  setAll(rec);
  const snapshot = () => JSON.stringify([...Object.keys(I).map((k) => I[k].value), req.checked]);
  let baseline = snapshot();

  const payload = () => ({
    name: I.name.value, item_code: I.item_code.value, alias: I.alias.value, kind: I.kind.value, item_group_id: I.item_group_id.value,
    brand: I.brand.value, code: I.code.value, gst_bp: I.gst_bp.value, uom: I.uom.value, uqc: I.uqc.value, rate: I.rate.value,
    purchase_rate: I.purchase_rate.value, mrp: I.mrp.value, qty_decimals: I.qty_decimals.value, description: I.description.value,
    desc_required: req.checked ? 1 : 0, notes: I.notes.value,
  });
  const showErrors = (bad) => {
    let first = null;
    for (const k of Object.keys(R)) {
      R[k].setError(bad[k] || '');
      if (bad[k] && !first && I[k]) first = I[k];
    }
    if (first) first.focus();
    return !!first;
  };

  let saving = false;
  async function save() {
    if (saving) return;
    if (I.name.value.trim().length < 2) { showErrors({ name: 'Enter the item name.' }); return; }
    saving = true;
    try {
      const res = isNew ? await api('POST', '/api/items', payload()) : await api('PUT', `/api/items/${rec.id}`, payload());
      rec = res.item;
      baseline = snapshot();
      toast('Saved', 'success');
      ctx.navigate('#/itemmaster');
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
    cbtn('Back', { hot: 'B', onClick: () => ctx.navigate('#/itemmaster') }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));
  const frm = h('div', { class: 'cform' },
    csec('Basic Information'),
    h('div', { class: 'cgrid2' }, h('div', null, R.name, R.item_code, R.alias, R.kind), h('div', null, R.item_group_id, R.brand, R.code, R.gst_bp)),
    csec('Unit and Rates'),
    h('div', { class: 'cgrid2' }, h('div', null, R.uom, R.uqc, R.qty_decimals), h('div', null, R.rate, R.purchase_rate, R.mrp)),
    csec('Other Details'),
    h('div', { class: 'cgrid2' }, h('div', null, R.description, R.desc_required), h('div', null, R.notes)));
  wireEnter(frm);
  box.append(cwin({ title: 'Item/Service Master', onClose: () => ctx.navigate('#/itemmaster'), className: 'mid' }, bar, frm).el);
  const off = wireHotkeys(box);
  setTimeout(() => I.name.focus(), 0);
  return { destroy: off, canLeave: () => snapshot() === baseline, back: () => '#/itemmaster' };
}
