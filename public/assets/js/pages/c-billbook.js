// Bill Book Master: one book, Sales Book. Shows the next number for the chosen year.

import { api } from '/assets/js/api.js';
import { h } from '/assets/js/ui.js';
import { cwin, cbtn, cgrid, wireHotkeys } from '/assets/js/classic/cui.js';
import { getFy, fyLabel } from '/assets/js/classic/fy.js';

export default async function render(box, ctx) {
  const fy = getFy();
  let next = '';
  try { next = String((await api('GET', `/api/bills/next?fy=${fy}`)).next); } catch { next = ''; }
  const grid = cgrid({
    columns: [{ key: 'book', label: 'Bill Book Name' }, { key: 'type', label: 'Type' }, { key: 'year', label: 'Year' }, { key: 'next', label: 'Next Bill No.', num: true }],
    emptyText: '',
  });
  grid.setRows([{ id: 1, book: 'Sales Book', type: 'Debit', year: fyLabel(fy), next }]);
  const win = cwin({ title: 'Bill Book Master', onClose: () => ctx.close(), className: 'mid' },
    h('div', { class: 'cbar' }, cbtn('Close', { hot: 'C', onClick: () => ctx.close() })),
    grid.el,
    h('p', { class: 'chintline', text: 'Bill numbers run 1, 2, 3 and so on, and start again from 1 on every 1 April. The next number is chosen for you on a new bill.' }));
  box.append(win.el);
  return { destroy: wireHotkeys(box) };
}
