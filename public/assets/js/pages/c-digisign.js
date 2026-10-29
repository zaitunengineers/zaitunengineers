// Digital Signature: the signature picture that prints on every bill, like bill 308.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast } from '/assets/js/ui.js';
import { cwin, cbtn, csec, crow, wireHotkeys } from '/assets/js/classic/cui.js';

export default async function render(box, ctx) {
  const s = (await api('GET', '/api/settings')).settings || ctx.settings();
  let firm = {};
  try { firm = await api('GET', '/api/firm'); } catch { firm = {}; }
  const sign = h('input', { type: 'checkbox' });
  sign.checked = s.print_signature !== '0';
  const logo = h('input', { type: 'checkbox' });
  logo.checked = s.print_logo !== '0';
  const pic = firm.signature_png
    ? h('img', { class: 'digi-img', src: firm.signature_png, alt: 'Your signature' })
    : h('p', { class: 'cnote', text: 'No signature picture is uploaded yet. Add it in Firm Master (F2).' });
  const snapshot = () => JSON.stringify([sign.checked, logo.checked]);
  let baseline = snapshot();
  let saving = false;
  async function save() {
    if (saving) return;
    saving = true;
    try {
      await api('PUT', '/api/settings', { print_signature: sign.checked, print_logo: logo.checked });
      baseline = snapshot();
      await ctx.refreshMe();
      toast('Saved', 'success');
      ctx.navigate('#/sales');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save. Try again.', 'danger');
    }
    saving = false;
  }
  const bar = h('div', { class: 'cbar' },
    cbtn('Save', { hot: 'S', primary: true, onClick: save }),
    cbtn('Change Picture', { hot: 'P', onClick: () => ctx.navigate('#/settings/firm') }),
    cbtn('Back', { hot: 'B', onClick: () => ctx.navigate('#/sales') }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));
  const frm = h('div', { class: 'cform' },
    csec('Signature on the bill'),
    crow('Your signature', pic),
    crow('Print it on every bill', sign, { hint: 'Yes, like bill 308. You can still switch it off for one print in the Bill Printing box.' }),
    crow('Print the logo', logo));
  box.append(cwin({ title: 'Digital Signature', onClose: () => ctx.navigate('#/sales'), className: 'narrow' }, bar, frm).el);
  const off = wireHotkeys(box);
  return { destroy: off, canLeave: () => snapshot() === baseline, back: () => '#/sales' };
}
