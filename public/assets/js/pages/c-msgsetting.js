// Email/WhatsApp/ftp Settings: the words used when a bill is sent by WhatsApp or email.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast } from '/assets/js/ui.js';
import { cwin, cbtn, csec, crow, cinput, wireHotkeys } from '/assets/js/classic/cui.js';

const DEFAULTS = {
  wa_msg: 'Dear Sir/Madam, please find attached our Tax Invoice No. {billno} dated {date} for Rs. {amount}. Regards, {firm}',
  mail_subject: 'Tax Invoice No. {billno} dated {date} - {firm}',
  mail_body: 'Dear Sir/Madam,\n\nPlease find attached our Tax Invoice No. {billno} dated {date} for Rs. {amount}.\n\nRegards,\n{firm}',
};

export default async function render(box, ctx) {
  const s = (await api('GET', '/api/settings')).settings || ctx.settings();
  const wa = h('textarea', { class: 'ci', rows: '4', maxlength: '500', 'aria-label': 'WhatsApp message' });
  const subject = cinput({ maxlength: 150 });
  const body = h('textarea', { class: 'ci', rows: '7', maxlength: '500', 'aria-label': 'Email message' });
  wa.value = s.wa_msg || DEFAULTS.wa_msg;
  subject.value = s.mail_subject || DEFAULTS.mail_subject;
  body.value = s.mail_body || DEFAULTS.mail_body;
  const rows = { wa_msg: crow('WhatsApp message', wa), mail_subject: crow('Email subject', subject), mail_body: crow('Email message', body) };
  const I = { wa_msg: wa, mail_subject: subject, mail_body: body };
  const snapshot = () => JSON.stringify([wa.value, subject.value, body.value]);
  let baseline = snapshot();
  let saving = false;

  async function save() {
    if (saving) return;
    saving = true;
    const out = {};
    for (const k of Object.keys(I)) { rows[k].setError(''); if (I[k].value !== (s[k] ?? '')) out[k] = I[k].value; }
    try {
      if (Object.keys(out).length) {
        const res = await api('PUT', '/api/settings', out);
        Object.assign(s, res.settings);
      }
      baseline = snapshot();
      await ctx.refreshMe();
      toast('Saved', 'success');
      ctx.navigate('#/home');
    } catch (e) {
      if (e instanceof ApiError && e.data && e.data.fields) for (const [k, m] of Object.entries(e.data.fields)) rows[k] && rows[k].setError(m);
      toast(e instanceof ApiError ? e.message : 'Could not save. Try again.', 'danger');
    }
    saving = false;
  }
  function standard() {
    wa.value = DEFAULTS.wa_msg;
    subject.value = DEFAULTS.mail_subject;
    body.value = DEFAULTS.mail_body;
  }

  const bar = h('div', { class: 'cbar' },
    cbtn('Save', { hot: 'S', primary: true, onClick: save }),
    cbtn('Standard Words', { hot: 'W', onClick: standard }),
    cbtn('Back', { hot: 'B', onClick: () => ctx.navigate('#/home') }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));
  const frm = h('div', { class: 'cform' },
    csec('WhatsApp and Email'),
    rows.wa_msg, rows.mail_subject, rows.mail_body,
    h('p', { class: 'cnote', text: 'You can use these words and they fill in by themselves: {billno} bill number, {date} bill date, {amount} net amount, {party} party name, {firm} your firm name.' }),
    csec('ftp'),
    h('p', { class: 'cnote', text: 'ftp upload is not used by your firm.' }));
  box.append(cwin({ title: 'Email/WhatsApp/ftp Settings', onClose: () => ctx.navigate('#/home'), className: 'mid' }, bar, frm).el);
  const off = wireHotkeys(box);
  return { destroy: off, canLeave: () => snapshot() === baseline, back: () => '#/home' };
}
