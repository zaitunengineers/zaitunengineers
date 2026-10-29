// The client form. Used as a full page (clients.js) and inside the quick-add sheet (also used by bills in Stage 3).

import { api, ApiError } from '/assets/js/api.js';
import { h, icon, field, setFieldError, sheet, choiceDialog, confirmDialog, setButtonLoading } from '/assets/js/ui.js';
import { STATES, stateName } from '/assets/js/states.js';
import { isValidGstin, gstinFormatOk, stateCodeFromGstin, panFromGstin, isValidPan, isValidPincode, isValidEmail, isValidPhone } from '/assets/js/gstin.js';
import { nameKey, tenDigits } from '/assets/js/rules.js';

let counter = 0;
const KEYS = ['name', 'gstin', 'pan', 'address', 'city', 'pincode', 'state_code', 'phone', 'mobile', 'email', 'notes'];

// client: a saved client to edit, or null for a new one. compact: hide the notes box behind "More details".
export function createClientEditor({ client = null, compact = false, prefillName = '', onChange = () => {}, onOpenExisting } = {}) {
  const n = ++counter;
  const id = (k) => `c${n}-${k}`;
  const data = client || {};
  const inputs = {};
  const fields = {};

  const text = (key, label, o = {}) => {
    const input = h('input', {
      class: `input${o.upper ? ' upper' : ''}`, id: id(key), name: key, type: o.type || 'text', maxlength: o.max,
      inputmode: o.inputmode, autocomplete: 'off', autocapitalize: o.upper ? 'characters' : 'words', spellcheck: 'false',
    });
    input.value = data[key] || (key === 'name' ? prefillName : '');
    inputs[key] = input;
    fields[key] = field(label, input, { hint: o.hint, required: o.required });
    return fields[key];
  };

  text('name', "Client's name", { required: true, max: 100 });
  const gstinField = text('gstin', 'GSTIN', { upper: true, max: 15, hint: 'Leave empty for an unregistered client.' });
  const gstinStatus = h('div', { class: 'ok', hidden: true });
  gstinField.insertBefore(gstinStatus, gstinField.querySelector('.err'));
  text('pan', 'PAN', { upper: true, max: 10 });
  const address = h('textarea', { class: 'textarea', id: id('address'), name: 'address', rows: 3, maxlength: 260 });
  address.value = data.address || '';
  inputs.address = address;
  fields.address = field('Address', address, { hint: 'Up to 4 lines.' });
  text('city', 'City', { max: 40 });
  text('pincode', 'Pincode', { max: 6, inputmode: 'numeric' });
  const stateSelect = h('select', { class: 'select', id: id('state_code'), name: 'state_code' }, h('option', { value: '', text: 'Choose state' }), STATES.map(([code, nm]) => h('option', { value: code, text: `${nm} (${code})` })));
  stateSelect.value = data.state_code || '';
  inputs.state_code = stateSelect;
  fields.state_code = field('State', stateSelect, { required: true });
  text('phone', 'Phone', { max: 20, inputmode: 'tel', type: 'tel' });
  text('mobile', 'Mobile (WhatsApp)', { max: 20, inputmode: 'tel', type: 'tel' });
  text('email', 'Email', { max: 120, type: 'email', inputmode: 'email' });
  const notes = h('textarea', { class: 'textarea', id: id('notes'), name: 'notes', rows: 3, maxlength: 500 });
  notes.value = data.notes || '';
  inputs.notes = notes;
  fields.notes = field('Notes', notes, { hint: 'For you only. Never printed on a bill.' });

  const grid = (...kids) => h('div', { class: 'form-grid' }, ...kids);
  const card = (title, ...kids) => h('div', { class: compact ? 'subcard' : 'card' }, h('h2', { text: title }), ...kids);
  const span2 = (el) => h('div', { class: 'span-2' }, el);

  const moreBox = h('div', { class: 'stack', hidden: compact }, fields.notes);
  const moreBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'More details');
  moreBtn.addEventListener('click', () => {
    moreBox.hidden = !moreBox.hidden;
    moreBtn.textContent = moreBox.hidden ? 'More details' : 'Fewer details';
  });

  const el = h(
    'form',
    { class: 'stack', novalidate: true },
    card('Business', grid(span2(fields.name), fields.gstin, fields.pan)),
    card('Address', grid(span2(fields.address), fields.city, fields.pincode, span2(fields.state_code))),
    card('Contact', grid(fields.phone, fields.mobile, span2(fields.email))),
    compact ? h('div', null, moreBtn) : null,
    compact ? moreBox : card('Notes', fields.notes)
  );

  // GSTIN fills and locks the state, fills PAN
  const showGstin = (finalCheck) => {
    const g = inputs.gstin.value;
    gstinStatus.hidden = true;
    stateSelect.disabled = false;
    if (!g) return setFieldError(fields.gstin, '');
    if (g.length < 15) return setFieldError(fields.gstin, finalCheck ? 'A GSTIN has 15 characters.' : '');
    if (!gstinFormatOk(g)) return setFieldError(fields.gstin, 'GSTIN format is wrong. It looks like 23ABCDE1234F1Z5.');
    if (!isValidGstin(g)) return setFieldError(fields.gstin, 'This GSTIN is not valid. Check every character.');
    setFieldError(fields.gstin, '');
    const code = stateCodeFromGstin(g);
    if (stateName(code)) stateSelect.value = code;
    stateSelect.disabled = true;
    inputs.pan.value = panFromGstin(g);
    setFieldError(fields.pan, '');
    setFieldError(fields.state_code, '');
    gstinStatus.replaceChildren(icon('check'), document.createTextNode(`Valid GSTIN${stateName(code) ? ' · ' + stateName(code) : ''}`));
    gstinStatus.hidden = false;
  };
  inputs.gstin.addEventListener('input', () => {
    const pos = inputs.gstin.selectionStart;
    inputs.gstin.value = inputs.gstin.value.toUpperCase().replace(/\s/g, '');
    try { inputs.gstin.setSelectionRange(pos, pos); } catch { /* not supported */ }
    showGstin(false);
  });
  inputs.gstin.addEventListener('blur', () => showGstin(true));
  inputs.pan.addEventListener('input', () => { inputs.pan.value = inputs.pan.value.toUpperCase().replace(/\s/g, ''); });
  showGstin(false);

  const read = () => {
    const v = {};
    for (const k of KEYS) v[k] = inputs[k].value.trim();
    // the select is disabled while a GSTIN fixes it, but its value still counts
    v.state_code = stateSelect.value;
    return v;
  };
  const snap = () => JSON.stringify(KEYS.map((k) => (inputs[k].value || '').trim()));
  let baseline = snap();
  el.addEventListener('input', onChange);
  el.addEventListener('change', onChange);

  const showErrors = (bad) => {
    let first = null;
    for (const k of KEYS) {
      setFieldError(fields[k], bad[k] || '');
      if (bad[k] && !first) first = inputs[k];
    }
    if (bad.notes && moreBox.hidden) moreBox.hidden = false;
    if (first) first.focus();
    return !!first;
  };

  const validateLocal = () => {
    const v = read();
    const bad = {};
    if (v.name.length < 2 || !nameKey(v.name)) bad.name = "Enter the client's name.";
    if (v.gstin && !isValidGstin(v.gstin)) bad.gstin = 'This GSTIN is not valid. Check every character.';
    if (v.pan && !isValidPan(v.pan)) bad.pan = 'PAN looks like ABCDE1234F.';
    if (v.gstin && !bad.gstin && v.pan && v.pan !== panFromGstin(v.gstin)) bad.pan = 'PAN does not match the GSTIN.';
    if (!v.state_code) bad.state_code = 'Pick the state.';
    if (v.pincode && !isValidPincode(v.pincode)) bad.pincode = 'Pincode must be 6 digits.';
    if (v.phone && !isValidPhone(v.phone)) bad.phone = 'Phone number looks wrong.';
    if (v.mobile && !tenDigits(v.mobile)) bad.mobile = 'Enter a 10-digit mobile number.';
    if (v.email && !isValidEmail(v.email.toLowerCase())) bad.email = 'Email looks wrong.';
    if (v.address.split('\n').filter((l) => l.trim()).length > 4) bad.address = 'Address is too long.';
    return bad;
  };

  // Saves. Returns the saved client, or null when it was not saved (errors are shown on the form).
  async function save() {
    if (showErrors(validateLocal())) return null;
    const v = read();
    try {
      if (!client) {
        // warn about a second client with the same name
        try {
          const found = await api('GET', `/api/clients?show=all&q=${encodeURIComponent(v.name)}`);
          const same = found.rows.find((r) => nameKey(r.name) === nameKey(v.name));
          if (same) {
            const where = same.city ? ` in ${same.city}` : '';
            const choice = await choiceDialog({
              title: 'This name is already saved',
              message: `A client named ${same.name}${where} already exists. Save another one?`,
              actions: [
                { label: 'Open existing', value: 'open', kind: 'secondary' },
                { label: 'Save anyway', value: 'save', kind: 'primary' },
              ],
            });
            if (choice === 'open') {
              if (onOpenExisting) onOpenExisting(same);
              else location.hash = `#/clients/${same.id}`;
              return null;
            }
            if (choice !== 'save') return null;
          }
        } catch { /* the check is only a warning; carry on */ }
        const res = await api('POST', '/api/clients', v);
        return res.client;
      }
      const res = await api('PUT', `/api/clients/${client.id}`, v);
      return res.client;
    } catch (err) {
      if (err instanceof ApiError && err.data && err.data.fields) showErrors(err.data.fields);
      else throw err;
      return null;
    }
  }

  return {
    el,
    isDirty: () => snap() !== baseline,
    markClean() { baseline = snap(); },
    reset(c) {
      const d = c || data;
      for (const k of KEYS) inputs[k].value = d[k] || '';
      showErrors({});
      showGstin(false);
      baseline = snap();
    },
    set(c) {
      Object.assign(data, c);
      for (const k of KEYS) inputs[k].value = c[k] || '';
      showGstin(false);
      baseline = snap();
    },
    save,
    focusName: () => inputs.name.focus(),
  };
}

// Quick add. Resolves with the saved client, or null when cancelled.
export function openClientSheet({ prefillName = '', onOpenExisting } = {}) {
  return new Promise((resolve) => {
    let sh;
    let editor;
    const cancel = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    const saveBtn = h('button', { type: 'button', class: 'btn btn-primary', text: 'Save' });
    const warn = h('div', { class: 'err', role: 'alert' });
    editor = createClientEditor({ compact: true, prefillName, onOpenExisting: (row) => { sh.close(); resolve(null); (onOpenExisting || ((r) => { location.hash = `#/clients/${r.id}`; }))(row); } });
    const finish = (v) => { sh.close(); resolve(v); };
    const requestClose = async () => {
      if (!editor.isDirty()) { resolve(null); return true; }
      const leave = await confirmDialog({ title: 'Discard this client?', message: 'What you typed has not been saved.', confirmText: 'Discard', cancelText: 'Keep editing', danger: true });
      if (leave) resolve(null);
      return leave;
    };
    cancel.addEventListener('click', async () => { if (await requestClose()) sh.close(); });
    saveBtn.addEventListener('click', async () => {
      warn.textContent = '';
      setButtonLoading(saveBtn, true, 'Saving');
      try {
        const saved = await editor.save();
        if (saved) return finish(saved);
      } catch (e) {
        warn.textContent = e instanceof ApiError ? e.message : 'Could not save. Try again.';
      }
      setButtonLoading(saveBtn, false, 'Save');
    });
    sh = sheet({ title: 'Add client', body: editor.el, footer: [warn, h('div', { class: 'btns' }, cancel, saveBtn)], requestClose });
    editor.focusName();
  });
}
