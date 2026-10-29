// Aeon's "Bill Printing" box: Format, Top Margin, Output, No of Copy(s), Digital Signature, then Process and Close.

import { h } from '/assets/js/ui.js';
import { cwin, cbtn, crow } from '/assets/js/classic/cui.js';
import { copyNames, getPrefs, savePrefs, optionsFrom } from './service.js';
import { AEON_TOP_MARGIN } from './layout.js';

export const isPhoneLike = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

// Returns { copies:[names], output:'screen'|'printer'|'pdf', topMargin, signature } or null when closed.
export function askBillPrinting({ settings, title = 'Bill Printing' }) {
  return new Promise((resolve) => {
    const prefs = getPrefs();
    const names = copyNames(settings);
    const before = document.activeElement;
    const sel = (cls, ...opts) => h('select', { class: `ci ${cls || ''}`.trim() }, opts.map(([v, t]) => h('option', { value: v, text: t })));

    const format = sel('', ['1', 'Format-1 (General)']);
    const margin = h('input', { class: 'ci num', type: 'number', step: '0.01', min: '0', max: '60', value: String(prefs.topMargin ?? AEON_TOP_MARGIN), 'aria-label': 'Top Margin' });
    const outputs = [['screen', 'Screen'], ...(isPhoneLike() ? [] : [['printer', 'Printer']]), ['pdf', isPhoneLike() ? 'PDF / Share' : 'PDF file']];
    const output = sel('', ...outputs);
    output.value = outputs.some((o) => o[0] === prefs.output) ? prefs.output : 'screen';
    const count = sel('', ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']);
    const ticks = names.map((n, i) => h('input', { type: 'checkbox', checked: !!prefs.copies[i], 'aria-label': n }));
    const syncCount = () => { count.value = String(Math.max(1, ticks.filter((t) => t.checked).length)); };
    syncCount();
    count.addEventListener('change', () => ticks.forEach((t, i) => { t.checked = i < Number(count.value); }));
    ticks.forEach((t) => t.addEventListener('change', syncCount));
    const defaultSign = optionsFrom({ settings }, prefs).signature;
    const sign = sel('', ['No', 'No'], ['Yes', 'Yes']);
    sign.value = defaultSign ? 'Yes' : 'No';

    const copyRow = h('div', { class: 'cprint-copies' }, names.map((n, i) => h('label', { class: 'cinline' }, ticks[i], n)));
    const finish = (v) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); if (before && before.focus) before.focus(); resolve(v); };
    const process = () => {
      let copies = names.filter((_, i) => ticks[i].checked);
      if (!copies.length) copies = [names[0]];
      const top = Number(margin.value);
      const v = { copies, output: output.value, topMargin: Number.isFinite(top) && top >= 0 && top <= 60 ? top : AEON_TOP_MARGIN, signature: sign.value === 'Yes' };
      savePrefs({ ...prefs, copies: names.map((n) => copies.includes(n)), output: v.output, topMargin: v.topMargin, signature: v.signature });
      finish(v);
    };
    const go = cbtn('Process', { hot: 'P', primary: true, onClick: process });
    const close = cbtn('Close', { hot: 'C', onClick: () => finish(null) });
    const win = cwin({ title, onClose: () => finish(null), className: 'cprint' },
      crow('Format', format), crow('Top Margin', margin), crow('Output', output), crow('No of Copy(s)', count), crow('', copyRow), crow('Digital Signature', sign),
      h('div', { class: 'cprint-foot' }, go, close));
    const overlay = h('div', { class: 'overlay' }, win.el);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); return; }
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); process(); return; }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
        const k = e.key.toLowerCase();
        if (k === 'p') { e.preventDefault(); process(); } else if (k === 'c') { e.preventDefault(); finish(null); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) finish(null); });
    document.body.append(overlay);
    output.focus();
  });
}
