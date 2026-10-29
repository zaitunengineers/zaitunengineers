import { api, ApiError } from '/assets/js/api.js';
import { h, icon, toast, field, setFieldError, setButtonLoading } from '/assets/js/ui.js';
import { STATES, stateName } from '/assets/js/states.js';
import {
  isValidGstin, gstinFormatOk, stateCodeFromGstin, panFromGstin, isValidPan, isValidPincode, isValidIfsc,
  isValidEmail, isValidPhone, isValidBankAccount,
} from '/assets/js/gstin.js';

const IMAGE_MAX = 300 * 1024;
const TEXT_KEYS = [
  'name', 'gstin', 'pan', 'address1', 'address2', 'city', 'pincode', 'state_code', 'phone', 'mobile', 'email',
  'bank_name', 'bank_account', 'bank_ifsc', 'bank_branch', 'terms', 'signatory_name', 'signatory_desig', 'bill_title',
];

// Shrinks a chosen picture to at most 600 px wide and under 300 KB. Returns a data URL.
async function prepareImage(file) {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') throw new Error('Please choose a PNG or JPG image.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That image could not be read. Try another file.');
  }
  const mime = file.type;
  let scale = Math.min(1, 600 / bitmap.width);
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const g = canvas.getContext('2d');
    if (mime === 'image/jpeg') {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL(mime, 0.9);
    if (url.length <= IMAGE_MAX) {
      bitmap.close && bitmap.close();
      return url;
    }
    scale *= 0.8;
  }
  throw new Error('That image is too big even after shrinking. Try a simpler picture.');
}

function imagePicker({ id, label, hint, current, onChange }) {
  let value = current || null;
  const preview = h('div', { class: 'preview' });
  const message = h('div', { class: 'err', role: 'alert' });
  const input = h('input', { type: 'file', id, accept: 'image/png,image/jpeg', class: 'visually-hidden' });
  const remove = h('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('trash'), 'Remove');

  const paint = () => {
    if (value) preview.replaceChildren(h('img', { src: value, alt: `${label} preview` }));
    else preview.replaceChildren(document.createTextNode('No image'));
    remove.hidden = !value;
  };
  paint();

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    message.textContent = '';
    try {
      value = await prepareImage(file);
      paint();
      onChange(value);
    } catch (e) {
      message.textContent = e.message;
    }
  });
  remove.addEventListener('click', () => {
    value = null;
    message.textContent = '';
    paint();
    onChange(null);
  });

  const el = h(
    'div',
    { class: 'field' },
    h('label', { for: id, text: label }),
    h('div', { class: 'imgpick' }, preview, h('div', { class: 'stack' }, h('div', { class: 'btns' }, input, h('label', { class: 'btn btn-secondary btn-sm', for: id }, icon('upload'), 'Choose image'), remove), h('div', { class: 'hint', text: hint }))),
    message
  );
  return {
    el,
    get: () => value,
    set(v) {
      value = v || null;
      message.textContent = '';
      paint();
    },
  };
}

export default async function render(box, ctx) {
  const data = await api('GET', '/api/firm');

  const inputs = {};
  const fields = {};

  const text = (key, label, o = {}) => {
    const input = h('input', {
      class: `input${o.upper ? ' upper' : ''}`, id: `f-${key}`, name: key, type: o.type || 'text', maxlength: o.max,
      inputmode: o.inputmode, autocomplete: o.autocomplete || 'off', autocapitalize: o.upper ? 'characters' : 'none', spellcheck: 'false',
    });
    input.value = data[key] || '';
    inputs[key] = input;
    fields[key] = field(label, input, { hint: o.hint, required: o.required });
    return fields[key];
  };

  const stateSelect = h('select', { class: 'select', id: 'f-state_code', name: 'state_code' }, h('option', { value: '', text: 'Choose state' }), STATES.map(([code, name]) => h('option', { value: code, text: `${name} (${code})` })));
  stateSelect.value = data.state_code || '';
  inputs.state_code = stateSelect;
  fields.state_code = field('State', stateSelect);

  const terms = h('textarea', { class: 'textarea', id: 'f-terms', name: 'terms', maxlength: 2000, rows: 5 });
  terms.value = data.terms || '';
  inputs.terms = terms;
  fields.terms = field('Terms printed on bills', terms, { hint: 'One term per line. For example: Payment within 15 days. Subject to local jurisdiction.' });

  // images: only sent when changed
  const imgState = { logo_png: { changed: false, value: data.logo_png || null }, signature_png: { changed: false, value: data.signature_png || null } };
  const logo = imagePicker({
    id: 'f-logo', label: 'Logo', hint: 'PNG or JPG. Shrunk automatically.', current: data.logo_png,
    onChange: (v) => { imgState.logo_png = { changed: true, value: v }; refresh(); },
  });
  const sign = imagePicker({
    id: 'f-signature', label: 'E-signature', hint: 'PNG with a clear background looks best.', current: data.signature_png,
    onChange: (v) => { imgState.signature_png = { changed: true, value: v }; refresh(); },
  });

  // GSTIN helper
  const gstinStatus = h('div', { class: 'ok', hidden: true });
  const gstinField = text('gstin', 'GSTIN', { upper: true, max: 15, hint: '15 characters. State and PAN fill in by themselves.' });
  gstinField.insertBefore(gstinStatus, gstinField.querySelector('.err'));

  text('name', 'Firm name', { required: true, max: 120, autocomplete: 'organization' });
  text('pan', 'PAN', { upper: true, max: 10 });
  text('address1', 'Address line 1', { max: 120, autocomplete: 'address-line1' });
  text('address2', 'Address line 2', { max: 120, autocomplete: 'address-line2' });
  text('city', 'City', { max: 60, autocomplete: 'address-level2' });
  text('pincode', 'Pincode', { max: 6, inputmode: 'numeric', autocomplete: 'postal-code' });
  text('phone', 'Phone', { max: 20, inputmode: 'tel', type: 'tel' });
  text('mobile', 'Mobile', { max: 20, inputmode: 'tel', type: 'tel' });
  text('email', 'Email', { max: 120, type: 'email', inputmode: 'email' });
  text('bank_name', 'Bank name', { max: 80 });
  text('bank_account', 'Account number', { max: 24, inputmode: 'numeric' });
  text('bank_ifsc', 'IFSC', { upper: true, max: 11 });
  text('bank_branch', 'Branch', { max: 80 });
  text('signatory_name', 'Signatory name', { max: 80, hint: 'Printed under For ZAITUN ENGINEERS.' });
  text('signatory_desig', 'Designation', { max: 60, hint: 'For example PROPRIETOR.' });
  text('bill_title', 'Bill title', { max: 40, hint: 'Printed at the top of every bill. Aeon: TAX INVOICE.' });

  function showGstin(finalCheck) {
    const g = inputs.gstin.value;
    gstinStatus.hidden = true;
    if (!g) return setFieldError(fields.gstin, '');
    if (g.length < 15) {
      return setFieldError(fields.gstin, finalCheck ? 'A GSTIN has 15 characters.' : '');
    }
    if (!gstinFormatOk(g)) return setFieldError(fields.gstin, 'GSTIN format is wrong. It looks like 23ABCDE1234F1Z5.');
    if (!isValidGstin(g)) return setFieldError(fields.gstin, 'This GSTIN is not valid. Check every character.');
    setFieldError(fields.gstin, '');
    const code = stateCodeFromGstin(g);
    if (stateName(code)) stateSelect.value = code;
    inputs.pan.value = panFromGstin(g);
    setFieldError(fields.pan, '');
    setFieldError(fields.state_code, '');
    gstinStatus.replaceChildren(icon('check'), document.createTextNode(`Valid GSTIN${stateName(code) ? ' · ' + stateName(code) : ''}`));
    gstinStatus.hidden = false;
  }

  inputs.gstin.addEventListener('input', () => {
    const pos = inputs.gstin.selectionStart;
    inputs.gstin.value = inputs.gstin.value.toUpperCase().replace(/\s/g, '');
    try { inputs.gstin.setSelectionRange(pos, pos); } catch { /* not supported on this field */ }
    showGstin(false);
  });
  inputs.gstin.addEventListener('blur', () => showGstin(true));
  for (const k of ['pan', 'bank_ifsc']) {
    inputs[k].addEventListener('input', () => { inputs[k].value = inputs[k].value.toUpperCase().replace(/\s/g, ''); });
  }

  // dirty tracking
  const snapshot = () => JSON.stringify(TEXT_KEYS.map((k) => inputs[k].value)) + (imgState.logo_png.changed ? 'L' : '') + (imgState.signature_png.changed ? 'S' : '');
  let baseline = snapshot();
  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save changes');
  const discardBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Discard');
  const bar = h('div', { class: 'savebar', hidden: true }, h('div', { class: 'msg', text: 'You have unsaved changes.' }), h('div', { class: 'btns' }, discardBtn, saveBtn));
  const isDirty = () => snapshot() !== baseline;
  function refresh() { bar.hidden = !isDirty(); }

  const card = (title, sub, ...children) => h('div', { class: 'card' }, h('h2', { text: title }), h('p', { class: 'card-sub', text: sub }), ...children);
  const grid = (...kids) => h('div', { class: 'form-grid' }, ...kids);

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    card('Business', 'Printed at the top of every bill.', grid(h('div', { class: 'span-2' }, fields.name), fields.gstin, fields.pan, h('div', { class: 'span-2' }, fields.address1), h('div', { class: 'span-2' }, fields.address2), fields.city, fields.pincode, h('div', { class: 'span-2' }, fields.state_code))),
    card('Contact', 'So clients can reach you.', grid(fields.phone, fields.mobile, h('div', { class: 'span-2' }, fields.email))),
    card('Bank', 'Shown on bills for payment.', grid(h('div', { class: 'span-2' }, fields.bank_name), fields.bank_account, fields.bank_ifsc, h('div', { class: 'span-2' }, fields.bank_branch))),
    card('Bill extras', 'Title, signatory, terms, logo and signature.', h('div', { class: 'stack' }, grid(h('div', { class: 'span-2' }, fields.bill_title), fields.signatory_name, fields.signatory_desig), fields.terms, logo.el, sign.el)),
    bar
  );
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);

  discardBtn.addEventListener('click', () => {
    for (const k of TEXT_KEYS) inputs[k].value = data[k] || '';
    imgState.logo_png = { changed: false, value: data.logo_png || null };
    imgState.signature_png = { changed: false, value: data.signature_png || null };
    logo.set(data.logo_png);
    sign.set(data.signature_png);
    showErrors({});
    showGstin(false);
    refresh();
  });

  function validateLocal() {
    const bad = {};
    const v = (k) => inputs[k].value.trim();
    if (!v('name')) bad.name = 'Enter the firm name.';
    if (v('gstin')) {
      if (!isValidGstin(v('gstin').toUpperCase())) bad.gstin = 'This GSTIN is not valid. Check every character.';
      else {
        if (!v('state_code')) bad.state_code = 'Choose the state that matches the GSTIN.';
        else if (v('gstin').slice(0, 2) !== v('state_code')) bad.state_code = 'State does not match the first 2 digits of the GSTIN.';
        if (v('pan') && v('pan').toUpperCase() !== panFromGstin(v('gstin').toUpperCase())) bad.pan = 'PAN does not match the GSTIN.';
      }
    }
    if (v('pan') && !isValidPan(v('pan').toUpperCase())) bad.pan = 'PAN looks like ABCDE1234F.';
    if (v('pincode') && !isValidPincode(v('pincode'))) bad.pincode = 'Pincode must be 6 digits.';
    if (v('bank_ifsc') && !isValidIfsc(v('bank_ifsc').toUpperCase())) bad.bank_ifsc = 'IFSC looks like HDFC0001234.';
    if (v('bank_account') && !isValidBankAccount(v('bank_account'))) bad.bank_account = 'Account number must be 6 to 24 digits.';
    if (v('email') && !isValidEmail(v('email'))) bad.email = 'Enter a valid email address.';
    if (v('phone') && !isValidPhone(v('phone'))) bad.phone = 'Use digits, spaces, + and - only.';
    if (v('mobile') && !isValidPhone(v('mobile'))) bad.mobile = 'Use digits, spaces, + and - only.';
    return bad;
  }

  function showErrors(bad) {
    let first = null;
    for (const k of Object.keys(fields)) {
      setFieldError(fields[k], bad[k] || '');
      if (bad[k] && !first) first = inputs[k];
    }
    if (bad.logo_png) toast(bad.logo_png, 'danger');
    if (bad.signature_png) toast(bad.signature_png, 'danger');
    if (first) first.focus();
    return !!first;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (showErrors(validateLocal())) return;
    const payload = {};
    for (const k of TEXT_KEYS) payload[k] = inputs[k].value.trim();
    for (const k of ['logo_png', 'signature_png']) if (imgState[k].changed) payload[k] = imgState[k].value;
    setButtonLoading(saveBtn, true, 'Saving');
    try {
      const res = await api('PUT', '/api/firm', payload);
      Object.assign(data, res.firm);
      // show what the server stored (it fixes capitals and fills PAN)
      for (const k of TEXT_KEYS) inputs[k].value = data[k] || '';
      imgState.logo_png = { changed: false, value: data.logo_png || null };
      imgState.signature_png = { changed: false, value: data.signature_png || null };
      logo.set(data.logo_png);
      sign.set(data.signature_png);
      baseline = snapshot();
      refresh();
      ctx.setFirmName(data.name);
      if (ctx.refreshMe) ctx.refreshMe();
      toast('Saved', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.data && err.data.fields) showErrors(err.data.fields);
      else toast(err instanceof ApiError ? err.message : 'Could not save. Try again.', 'danger');
    }
    setButtonLoading(saveBtn, false, 'Save changes');
  });

  box.append(
    h('a', { class: 'crumb', href: '#/settings' }, icon('back'), 'Settings'),
    h('div', { class: 'page-head' }, h('div', null, h('h1', { text: 'Firm details' }), h('p', { class: 'sub', text: 'These print on every bill.' }))),
    form
  );
  showGstin(false);

  return { canLeave: () => !isDirty() };
}
