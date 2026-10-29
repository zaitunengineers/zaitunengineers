// Classic Home: modes on the left, the logo in the middle, the Aeon buttons and What's new on the right.

import { api } from '/assets/js/api.js';
import { h } from '/assets/js/ui.js';
import { cbtn, wireHotkeys } from '/assets/js/classic/cui.js';
import { HOME_BUTTONS, whyNot } from '/assets/js/classic/menu.js';
import { WHATS_NEW } from '/assets/js/classic/shell.js';

export default async function render(box, ctx) {
  const firm = ctx.me.firm || {};
  const grey = (label) => cbtn(label, { disabled: true, onClick: () => ctx.toast('Not in this app yet. Tell me if you need it.') });

  const modes = h(
    'div',
    { class: 'ch-modes' },
    cbtn('GST Mode (Ctrl+G)', { onClick: () => ctx.toast('GST Mode is always on.') }),
    cbtn('None Mode (Ctrl+N)', { disabled: true, onClick: () => ctx.toast('Not in this app yet. Tell me if you need it.') }),
    grey('Import Bank Statement'),
    grey('GST Bulk Rate Change')
  );
  modes.firstChild.prepend(h('span', { class: 'tick', text: '✔' }));

  const logo = h('div', { class: 'ch-brand' });
  // The logo is not part of /api/me (it can be large); it is fetched once for this screen.
  api('GET', '/api/firm').then((f) => {
    if (f && f.logo_png) logo.prepend(h('img', { src: f.logo_png, alt: '' }));
  }).catch(() => {});
  logo.append(h('div', { class: 'nm', text: 'Zaitun Billing' }), h('div', { class: 'sub', text: 'GST Ready' }));

  const buttons = HOME_BUTTONS.map((b) => {
    const dim = !!(b.grey || b.stage);
    const btn = cbtn(b.label, {
      hot: b.key,
      disabled: dim,
      onClick: () => { if (dim) ctx.toast(whyNot(b), 'info', 4500); else { ctx.navigate(b.to); if (b.note) ctx.toast(b.note, 'info', 5000); } },
    });
    if (b.sc) btn.append(h('span', { class: 'sc', text: b.sc }));
    return btn;
  });

  const news = h('div', { class: 'ch-new', 'aria-label': "What's new" }, WHATS_NEW.map(([v, t]) => h('p', null, h('b', { text: v }), ` ${t}`)));
  const right = h('div', { class: 'ch-right' }, h('div', { class: 'mob', text: firm.mobile ? `Mobile: ${firm.mobile}` : '' }), buttons, news);

  box.append(h('div', { class: 'chome' }, h('div', { class: 'ch-left' }, modes, logo), right));
  const off = wireHotkeys(box);
  return { destroy: off };
}
