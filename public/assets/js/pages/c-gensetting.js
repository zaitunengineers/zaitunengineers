// General Setting: switches, headings, copy names and the look of the app.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast } from '/assets/js/ui.js';
import { cwin, cbtn, csec, crow, cinput, wireHotkeys } from '/assets/js/classic/cui.js';
import { wireEnter } from '/assets/js/classic/nav.js';

const CHARGES = [['sw_disc', 'lbl_disc', 'Discount on each item'], ['sw_a1', 'lbl_a1', 'Extra charge 1'], ['sw_a2', 'lbl_a2', 'Extra charge 2'], ['sw_a3', 'lbl_a3', 'Extra charge 3'], ['sw_a4', 'lbl_a4', 'Extra charge 4'], ['sw_a5', 'lbl_a5', 'Extra charge 5'], ['sw_a6', 'lbl_a6', 'Extra charge 6'], ['sw_l2', 'lbl_l2', 'Less (deduction)']];
const HEADS = [['lbl_x1', 'Bill box 1 heading'], ['lbl_x2', 'Bill box 2 heading'], ['lbl_x3', 'Bill box 3 heading'], ['lbl_x4', 'Bill box 4 heading'], ['lbl_po_date', 'Date box heading']];
const COPIES = [['copy1', 'Copy 1 name'], ['copy2', 'Copy 2 name'], ['copy3', 'Copy 3 name'], ['copy4', 'Copy 4 name']];

export default async function render(box, ctx) {
  const s = (await api('GET', '/api/settings')).settings || ctx.settings();
  const I = {};
  const R = {};
  const tick = (key) => { I[key] = h('input', { type: 'checkbox', 'data-nav': '' }); I[key].checked = s[key] === '1'; return I[key]; };
  const text = (key, label) => { I[key] = cinput({ maxlength: 40, 'data-nav': '' }); I[key].value = s[key] || ''; R[key] = crow(label, I[key]); return R[key]; };

  const chargeRows = CHARGES.map(([sw, lbl, name]) => {
    const t = tick(sw);
    I[lbl] = cinput({ maxlength: 40, 'data-nav': '' });
    I[lbl].value = s[lbl] || '';
    R[lbl] = crow(name, h('span', { class: 'cinline' }, t, I[lbl]));
    return R[lbl];
  });
  const hsn = crow('Allow changing HSN/SAC on a bill', tick('hsn_edit'));
  const dc = crow('Print a double colon (::) after headings', tick('print_double_colon'));
  const theme = h('select', { class: 'ci', 'data-nav': '' }, h('option', { value: 'classic', text: 'Classic (like Aeon)' }), h('option', { value: 'modern', text: 'Modern' }));
  theme.value = s.ui_theme === 'modern' ? 'modern' : 'classic';
  const themeRow = crow('Look of the app', theme);
  const sig = crow('Print the signature on every bill', tick('print_signature'));
  const logo = crow('Print the logo on every bill', tick('print_logo'));
  I.print_wrap = h('select', { class: 'ci', 'data-nav': '' }, h('option', { value: 'char', text: 'Like Aeon (breaks after 23 letters)' }), h('option', { value: 'word', text: 'At word ends (neater)' }));
  I.print_wrap.value = s.print_wrap === 'word' ? 'word' : 'char';
  const wrap = crow('Long item names on the bill', I.print_wrap);

  const keys = () => [...CHARGES.flatMap(([a, b]) => [a, b]), ...HEADS.map((x) => x[0]), ...COPIES.map((x) => x[0]), 'hsn_edit', 'print_double_colon', 'print_signature', 'print_logo', 'print_wrap'];
  const val = (k) => (I[k].type === 'checkbox' ? (I[k].checked ? '1' : '0') : I[k].value);
  const snapshot = () => JSON.stringify([...keys().map(val), theme.value]);
  let baseline = null;

  let saving = false;
  async function save() {
    if (saving) return;
    saving = true;
    const body = {};
    for (const k of keys()) if (val(k) !== (s[k] ?? '')) body[k] = I[k].type === 'checkbox' ? I[k].checked : val(k);
    const themeChanged = theme.value !== (s.ui_theme === 'modern' ? 'modern' : 'classic');
    try {
      for (const k of Object.keys(R)) R[k].setError('');
      if (themeChanged) body.ui_theme = theme.value;
      if (Object.keys(body).length) await api('PUT', '/api/settings', body);
      for (const k of Object.keys(body)) s[k] = typeof body[k] === 'boolean' ? (body[k] ? '1' : '0') : body[k];
      baseline = snapshot();
      await ctx.refreshMe();
      toast('Saved', 'success');
      if (themeChanged) {
        try { localStorage.setItem('zb_ui', theme.value); } catch { /* storage blocked */ }
        location.reload();
        return;
      }
      ctx.navigate('#/home');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save. Try again.', 'danger');
    }
    saving = false;
  }

  const bar = h('div', { class: 'cbar' },
    cbtn('Save', { hot: 'S', primary: true, onClick: save }),
    cbtn('Back', { hot: 'B', onClick: () => ctx.navigate('#/home') }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));
  const frm = h('div', { class: 'cform' },
    csec('Sale Bill Extras (tick to show on the bill screen)'),
    ...chargeRows,
    csec('Headings on the bill screen and print'),
    ...HEADS.map(([k, l]) => text(k, l)),
    csec('Copy names for printing'),
    ...COPIES.map(([k, l]) => text(k, l)),
    csec('Other'),
    hsn, dc, themeRow,
    csec('Printing'),
    sig, logo, wrap);
  wireEnter(frm);
  baseline = snapshot();
  box.append(cwin({ title: 'General Setting', onClose: () => ctx.navigate('#/home'), className: 'mid' }, bar, frm).el);
  const off = wireHotkeys(box);
  return { destroy: off, canLeave: () => snapshot() === baseline, back: () => '#/home' };
}
