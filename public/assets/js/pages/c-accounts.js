// Account Master: Aeon-style list and form. Same records as the Stage 2 clients.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast, choiceDialog } from '/assets/js/ui.js';
import { STATES, stateName } from '/assets/js/states.js';
import { isValidGstin, stateCodeFromGstin, panFromGstin, isValidPan, isValidPincode, isValidEmail, isValidPhone } from '/assets/js/gstin.js';
import { cwin, cbtn, csec, crow, cinput, wireHotkeys } from '/assets/js/classic/cui.js';
import { wireEnter } from '/assets/js/classic/nav.js';
import { masterList } from '/assets/js/classic/masterlist.js';

const REG = ['Register-Regular', 'Register-Composition', 'Unregister-Enduser'];
export const regOf = (r) => r.reg_type || (r.gstin ? 'Register-Regular' : 'Unregister-Enduser');

export default async function render(box, ctx, parts) {
  const id = parts[1];
  if (id) return form(box, ctx, id);
  return masterList(box, ctx, {
    title: 'Account Master',
    endpoint: '/api/clients',
    noun: 'account',
    canHide: true,
    placeholder: 'Search name, GSTIN, city or phone',
    importHref: '#/settings/import',
    onAdd: () => ctx.navigate('#/accounts/new'),
    onEdit: (r) => ctx.navigate(`#/accounts/${r.id}`),
    columns: [
      { key: 'name', label: 'Account Name' },
      { key: 'group', label: 'GroupName' },
      { key: 'reg', label: 'Reg.Type' },
      { key: 'city', label: 'CityName' },
      { key: 'pincode', label: 'PinCode' },
      { key: 'pan', label: 'PAN' },
      { key: 'gstin', label: 'GSTIN' },
      { key: 'phone', label: 'Phone' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'email', label: 'Email' },
    ],
    prepare: (rows) => rows.map((r) => ({ ...r, group: 'Sundry Debtors', reg: regOf(r) })),
    exportName: 'Account-Master.xlsx',
    exportHeaders: ['Account Name', 'GroupName', 'Reg.Type', 'CityName', 'PinCode', 'PAN', 'GSTIN', 'Phone', 'Mobile', 'Email'],
    exportRow: (r) => [r.name, r.group, r.reg, r.city || '', r.pincode || '', r.pan || '', r.gstin || '', r.phone || '', r.mobile || '', r.email || ''],
  });
}

async function form(box, ctx, id) {
  const isNew = id === 'new';
  let rec = {};
  if (!isNew) {
    try {
      rec = (await api('GET', `/api/clients/${encodeURIComponent(id)}`)).client;
    } catch (e) {
      box.append(cwin({ title: 'Account Master', onClose: () => ctx.navigate('#/accounts') }, h('p', { text: e instanceof ApiError && e.status === 404 ? 'This account was not found. It may have been deleted.' : 'Could not load this account.' }), cbtn('Back', { onClick: () => ctx.navigate('#/accounts') })).el);
      return {};
    }
  }
  const lines = (rec.address || '').split('\n');
  const I = {};
  const R = {};
  const mk = (key, label, o = {}) => {
    const input = o.select
      ? h('select', { class: 'ci', 'data-nav': '' }, o.select)
      : cinput({ maxlength: o.max, inputmode: o.inputmode, 'data-nav': '', class: `ci${o.upper ? ' upper' : ''}` });
    I[key] = input;
    R[key] = crow(label, input, { cls: o.cls });
    return R[key];
  };
  mk('name', 'Account Name', { max: 100 });
  mk('alias', 'Account Alias', { max: 60 });
  const grp = cinput({ value: 'Sundry Debtors', readonly: true, class: 'ci ro' });
  const grpRow = crow('Group', grp);
  mk('reg_type', 'Registration Type', { select: REG.map((r) => h('option', { value: r, text: r })) });
  mk('gstin', 'GSTIN', { max: 15, upper: true });
  mk('pan', 'PAN', { max: 10, upper: true });
  mk('a1', 'Address', { max: 60 });
  mk('a2', ' ', { max: 60 });
  mk('a3', ' ', { max: 60 });
  mk('a4', ' ', { max: 60 });
  const area = crow('Area Name', cinput({ disabled: true }), { cls: 'greyed' });
  mk('city', 'City Name', { max: 40 });
  mk('pincode', 'Pincode', { max: 6, inputmode: 'numeric' });
  mk('state_code', 'State Name', { select: [h('option', { value: '', text: 'Choose state' }), ...STATES.map(([c, n]) => h('option', { value: c, text: `${n} (${c})` }))] });
  const country = crow('Country', cinput({ value: 'India', readonly: true, class: 'ci ro' }));
  mk('distance_km', 'Distance (Kms.)', { max: 4, inputmode: 'numeric' });
  mk('phone', 'Phone', { max: 20, inputmode: 'tel' });
  mk('mobile', 'Mobile', { max: 20, inputmode: 'tel' });
  mk('email', 'Email ID', { max: 120, inputmode: 'email' });
  const notes = h('textarea', { class: 'ci', rows: 3, maxlength: 500, 'data-nav': '' });
  I.notes = notes;
  R.notes = crow('Notes', notes, { hint: 'For you only. Never printed on a bill.' });
  const greyRows = ['GST Information (HSN/SAC, rate history)', 'Opening Balance', 'Credit Limit'].map((l) => crow(l, cinput({ disabled: true }), { cls: 'greyed' }));

  const setAll = (r) => {
    I.name.value = r.name || '';
    I.alias.value = r.alias || '';
    I.gstin.value = r.gstin || '';
    I.pan.value = r.pan || '';
    I.reg_type.value = r.reg_type || (r.gstin ? 'Register-Regular' : 'Unregister-Enduser');
    const ls = (r.address || '').split('\n');
    I.a1.value = ls[0] || ''; I.a2.value = ls[1] || ''; I.a3.value = ls[2] || ''; I.a4.value = ls[3] || '';
    I.city.value = r.city || '';
    I.pincode.value = r.pincode || '';
    I.state_code.value = r.state_code || '';
    I.distance_km.value = r.distance_km ?? '';
    I.phone.value = r.phone || '';
    I.mobile.value = r.mobile || '';
    I.email.value = r.email || '';
    I.notes.value = r.notes || '';
  };
  setAll(rec);
  if (isNew) I.reg_type.value = 'Unregister-Enduser';
  const snapshot = () => JSON.stringify(Object.keys(I).map((k) => I[k].value));
  let baseline = snapshot();
  let regTouched = !isNew && !!rec.reg_type;
  I.reg_type.addEventListener('change', () => { regTouched = true; });

  for (const k of ['gstin', 'pan']) I[k].addEventListener('input', () => { I[k].value = I[k].value.toUpperCase().replace(/\s/g, ''); });
  I.gstin.addEventListener('input', () => {
    const g = I.gstin.value;
    if (g.length === 15 && isValidGstin(g)) {
      I.state_code.value = stateCodeFromGstin(g);
      I.pan.value = panFromGstin(g);
      if (!regTouched) I.reg_type.value = 'Register-Regular';
      R.gstin.setError('');
    } else if (!g && !regTouched) I.reg_type.value = 'Unregister-Enduser';
  });

  function payload() {
    const address = [I.a1.value, I.a2.value, I.a3.value, I.a4.value].map((s) => s.trim()).filter(Boolean).join('\n');
    return {
      name: I.name.value, alias: I.alias.value, gstin: I.gstin.value, pan: I.pan.value, reg_type: I.reg_type.value,
      address, city: I.city.value, pincode: I.pincode.value, state_code: I.state_code.value, distance_km: I.distance_km.value,
      phone: I.phone.value, mobile: I.mobile.value, email: I.email.value, notes: I.notes.value,
    };
  }

  function localErrors() {
    const bad = {};
    const v = (k) => I[k].value.trim();
    if (v('name').length < 2) bad.name = "Enter the account's name.";
    const g = v('gstin').toUpperCase();
    if (g && !isValidGstin(g)) bad.gstin = 'This GSTIN is not valid. Check every character.';
    if (v('pan') && !isValidPan(v('pan').toUpperCase())) bad.pan = 'PAN looks like ABCDE1234F.';
    if (!v('state_code')) bad.state_code = 'Pick the state.';
    if (v('pincode') && !isValidPincode(v('pincode'))) bad.pincode = 'Pincode must be 6 digits.';
    if (v('email') && !isValidEmail(v('email').toLowerCase())) bad.email = 'Email looks wrong.';
    if (v('phone') && !isValidPhone(v('phone'))) bad.phone = 'Phone number looks wrong.';
    return bad;
  }
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
    if (showErrors(localErrors())) return;
    saving = true;
    try {
      const res = isNew ? await api('POST', '/api/clients', payload()) : await api('PUT', `/api/clients/${rec.id}`, payload());
      rec = res.client;
      baseline = snapshot();
      toast('Saved', 'success');
      ctx.navigate('#/accounts');
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
    cbtn('Back', { hot: 'B', onClick: () => ctx.navigate('#/accounts') }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));
  const frm = h('div', { class: 'cform' },
    csec('Basic Information'),
    h('div', { class: 'cgrid2' }, h('div', null, R.name, R.alias, grpRow), h('div', null, R.reg_type, R.gstin, R.pan)),
    csec('Communication Information'),
    h('div', { class: 'cgrid2' }, h('div', null, R.a1, R.a2, R.a3, R.a4), h('div', null, area, R.city, R.pincode, R.state_code, country, R.distance_km)),
    csec('Contact Information'),
    h('div', { class: 'cgrid2' }, h('div', null, R.phone, R.mobile), h('div', null, R.email)),
    csec('Other Details'),
    h('div', { class: 'cgrid2' }, h('div', null, R.notes), h('div', null, greyRows)));
  wireEnter(frm);
  const win = cwin({ title: 'Account Master', onClose: () => ctx.navigate('#/accounts'), className: 'mid' }, bar, frm);
  box.append(win.el);
  const off = wireHotkeys(box);
  setTimeout(() => I.name.focus(), 0);
  return {
    destroy: off,
    canLeave: () => snapshot() === baseline,
    back: () => '#/accounts',
  };
}
