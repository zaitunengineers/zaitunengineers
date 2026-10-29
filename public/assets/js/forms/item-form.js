// The item form. Used as a full page (items.js) and inside the quick-add sheet (also used by bills in Stage 3).

import { api, ApiError } from '/assets/js/api.js';
import { h, field, setFieldError, sheet, confirmDialog, chips, setButtonLoading } from '/assets/js/ui.js';
import { UOMS, MAIN_GST_BP, MORE_GST_BP, GST_RATES_BP, gstLabel, kindFromCode, parseRupees, rupeesForInput, nameKey } from '/assets/js/rules.js';

let counter = 0;
const OTHER = '__other__';

export function createItemEditor({ item = null, compact = false, prefillName = '', onChange = () => {} } = {}) {
  const n = ++counter;
  const id = (k) => `i${n}-${k}`;
  const data = item || {};

  const mk = (key, label, o = {}) => {
    const input = h('input', { class: `input${o.upper ? ' upper' : ''}`, id: id(key), name: key, type: 'text', maxlength: o.max, inputmode: o.inputmode, autocomplete: 'off', autocapitalize: o.upper ? 'characters' : 'sentences', spellcheck: 'false' });
    return { input, field: field(label, input, { hint: o.hint, required: o.required }) };
  };
  const name = mk('name', 'Item name', { required: true, max: 120, hint: 'The part number can be part of the name.' });
  name.input.value = data.name || prefillName;
  const code = mk('code', 'HSN / SAC code', { max: 8, inputmode: 'numeric', hint: 'HSN (goods) or SAC (services). 4, 6 or 8 digits.' });
  code.input.value = data.code || '';
  const description = mk('description', 'Description', { max: 200, hint: 'Printed under the item name on the bill.' });
  description.input.value = data.description || '';
  const notesEl = h('textarea', { class: 'textarea', id: id('notes'), rows: 3, maxlength: 500 });
  notesEl.value = data.notes || '';
  const notesField = field('Notes', notesEl, { hint: 'For you only. Never printed on a bill.' });

  // type: Goods / Service, set from the code until the owner picks one by hand
  let kindTouched = !!item;
  const kind = chips({ label: 'Type', options: [{ value: 'goods', label: 'Goods' }, { value: 'service', label: 'Service' }], value: data.kind || 'goods', onChange: () => { kindTouched = true; onChange(); } });
  const kindField = h('div', { class: 'field' }, h('label', { text: 'Type' }), kind.el, h('div', { class: 'hint', text: 'Set from the code. Change it if it is wrong.' }));
  code.input.addEventListener('input', () => {
    code.input.value = code.input.value.replace(/[^0-9]/g, '');
    if (!kindTouched) kind.set(kindFromCode(code.input.value));
  });

  // unit
  const uomSelect = h('select', { class: 'select', id: id('uom') }, UOMS.map((u) => h('option', { value: u, text: u })), h('option', { value: OTHER, text: 'Other…' }));
  const uomOther = h('input', { class: 'input upper', id: id('uom-other'), maxlength: 8, placeholder: 'Unit, up to 8 letters', autocapitalize: 'characters', hidden: true });
  const savedUom = data.uom || 'NOS';
  if (UOMS.includes(savedUom)) uomSelect.value = savedUom;
  else { uomSelect.value = OTHER; uomOther.value = savedUom; uomOther.hidden = false; }
  uomSelect.addEventListener('change', () => { uomOther.hidden = uomSelect.value !== OTHER; if (!uomOther.hidden) uomOther.focus(); });
  const uomField = field('Unit', uomSelect, { wrap: h('div', { class: 'stack tight' }, uomSelect, uomOther) });
  uomSelect.setAttribute('aria-describedby', `${id('uom')}-err`);
  const getUom = () => (uomSelect.value === OTHER ? uomOther.value.trim().toUpperCase() : uomSelect.value);

  // rate
  const rate = h('input', { class: 'input', id: id('rate'), type: 'text', inputmode: 'decimal', autocomplete: 'off', maxlength: 14, placeholder: 'No fixed rate' });
  rate.value = rupeesForInput(data.rate_paise ?? null);
  const rateField = field('Default rate (₹)', rate, { wrap: h('div', { class: 'money' }, h('span', { class: 'sym', text: '₹' }), rate), hint: 'Leave empty if the rate changes every time.' });

  // GST %
  const savedBp = data.gst_bp ?? 1800;
  const gst = chips({ label: 'GST %', options: MAIN_GST_BP.map((bp) => ({ value: bp, label: String(bp / 100) })), value: savedBp, onChange });
  const moreBtn = h('button', { type: 'button', class: 'chip more', text: 'More' });
  let moreShown = false;
  const showMore = () => {
    if (moreShown) return;
    moreShown = true;
    moreBtn.remove();
    for (const bp of MORE_GST_BP) {
      if (![...gst.el.children].some((b) => b.dataset.value === String(bp))) gst.add({ value: bp, label: String(bp / 100) });
    }
  };
  if (MORE_GST_BP.includes(savedBp)) { gst.add({ value: savedBp, label: String(savedBp / 100) }); } 
  moreBtn.addEventListener('click', showMore);
  gst.el.append(moreBtn);
  const gstErr = h('div', { class: 'err', role: 'alert', id: `${id('gst')}-err` });
  const gstField = h('div', { class: 'field' }, h('label', { text: 'GST %' }), gst.el, h('div', { class: 'hint', text: '12% and 28% are mostly old rates. Check before using.' }), gstErr);

  const grid = (...kids) => h('div', { class: 'form-grid' }, ...kids);
  const card = (title, ...kids) => h('div', { class: compact ? 'subcard' : 'card' }, h('h2', { text: title }), ...kids);
  const span2 = (e) => h('div', { class: 'span-2' }, e);
  const moreBox = h('div', { class: 'stack', hidden: compact }, notesField);
  const detailsBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'More details');
  detailsBtn.addEventListener('click', () => {
    moreBox.hidden = !moreBox.hidden;
    detailsBtn.textContent = moreBox.hidden ? 'More details' : 'Fewer details';
  });

  const el = h(
    'form',
    { class: 'stack', novalidate: true },
    card('Item', grid(span2(name.field), code.field, kindField)),
    card('Price and tax', grid(uomField, rateField, span2(gstField))),
    card('Print', description.field),
    compact ? h('div', null, detailsBtn) : null,
    compact ? moreBox : card('Notes', notesField)
  );
  el.addEventListener('input', onChange);
  el.addEventListener('change', onChange);

  const errorTargets = { name: name, code, description, uom: { input: uomSelect, field: uomField }, rate: { input: rate, field: rateField }, notes: { input: notesEl, field: notesField } };
  const showErrors = (bad) => {
    let first = null;
    for (const [k, t] of Object.entries(errorTargets)) {
      setFieldError(t.field, bad[k] || '');
      if (bad[k] && !first) first = t.input;
    }
    gstErr.textContent = bad.gst_bp || bad.kind || '';
    if (bad.notes && moreBox.hidden) moreBox.hidden = false;
    if (first) first.focus();
    return !!first || !!gstErr.textContent;
  };

  const read = () => ({
    name: name.input.value.trim(),
    code: code.input.value.trim(),
    kind: kind.get(),
    uom: getUom(),
    rate: rate.value.trim(),
    gst_bp: gst.get(),
    description: description.input.value.trim(),
    notes: notesEl.value.trim(),
  });
  const snap = () => JSON.stringify(read());
  let baseline = snap();

  const validateLocal = () => {
    const v = read();
    const bad = {};
    if (v.name.length < 2 || !nameKey(v.name)) bad.name = 'Enter the item name (2 to 120 characters).';
    if (v.code && !/^([0-9]{4}|[0-9]{6}|[0-9]{8})$/.test(v.code)) bad.code = 'HSN or SAC must be 4, 6 or 8 digits.';
    if (v.uom && !/^[A-Z]{1,8}$/.test(v.uom)) bad.uom = 'Unit can be up to 8 letters.';
    const r = parseRupees(v.rate);
    if (r.error) bad.rate = r.error;
    if (!GST_RATES_BP.includes(v.gst_bp)) bad.gst_bp = 'Pick a GST % from the list.';
    return bad;
  };

  async function save() {
    if (showErrors(validateLocal())) return null;
    const v = read();
    if (!v.code) {
      const go = await confirmDialog({ title: 'No HSN/SAC code', message: 'No HSN/SAC code. GST bills normally need one.', confirmText: 'Save anyway', cancelText: 'Add code' });
      if (!go) { code.input.focus(); return null; }
    }
    try {
      if (!item) return (await api('POST', '/api/items', v)).item;
      return (await api('PUT', `/api/items/${item.id}`, v)).item;
    } catch (err) {
      if (err instanceof ApiError && err.data && err.data.fields) { showErrors(err.data.fields); return null; }
      throw err;
    }
  }

  const setAll = (d) => {
    name.input.value = d.name || '';
    code.input.value = d.code || '';
    description.input.value = d.description || '';
    notesEl.value = d.notes || '';
    kind.set(d.kind || 'goods');
    const u = d.uom || 'NOS';
    if (UOMS.includes(u)) { uomSelect.value = u; uomOther.hidden = true; uomOther.value = ''; } else { uomSelect.value = OTHER; uomOther.value = u; uomOther.hidden = false; }
    rate.value = rupeesForInput(d.rate_paise ?? null);
    const bp = d.gst_bp ?? 1800;
    if (MORE_GST_BP.includes(bp)) { showMore(); }
    gst.set(bp);
  };

  return {
    el,
    isDirty: () => snap() !== baseline,
    markClean() { baseline = snap(); },
    reset() { setAll(data); showErrors({}); baseline = snap(); },
    set(d) { Object.assign(data, d); setAll(d); baseline = snap(); },
    save,
    focusName: () => name.input.focus(),
  };
}

export function openItemSheet({ prefillName = '' } = {}) {
  return new Promise((resolve) => {
    let sh;
    const editor = createItemEditor({ compact: true, prefillName });
    const cancel = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    const saveBtn = h('button', { type: 'button', class: 'btn btn-primary', text: 'Save' });
    const warn = h('div', { class: 'err', role: 'alert' });
    const requestClose = async () => {
      if (!editor.isDirty()) { resolve(null); return true; }
      const leave = await confirmDialog({ title: 'Discard this item?', message: 'What you typed has not been saved.', confirmText: 'Discard', cancelText: 'Keep editing', danger: true });
      if (leave) resolve(null);
      return leave;
    };
    cancel.addEventListener('click', async () => { if (await requestClose()) sh.close(); });
    saveBtn.addEventListener('click', async () => {
      warn.textContent = '';
      setButtonLoading(saveBtn, true, 'Saving');
      try {
        const saved = await editor.save();
        if (saved) { sh.close(); resolve(saved); return; }
      } catch (e) {
        warn.textContent = e instanceof ApiError ? e.message : 'Could not save. Try again.';
      }
      setButtonLoading(saveBtn, false, 'Save');
    });
    sh = sheet({ title: 'Add item', body: editor.el, footer: [warn, h('div', { class: 'btns' }, cancel, saveBtn)], requestClose });
    editor.focusName();
  });
}
