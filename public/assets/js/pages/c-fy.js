// Change Firm/Year (F4): pick a financial year. The strip, the Sales list and new bill numbers follow it.

import { h } from '/assets/js/ui.js';
import { cwin, cgrid, cbtn } from '/assets/js/classic/cui.js';
import { FIRST_FY, currentFy, fyLabel, getFy, setFy } from '/assets/js/classic/fy.js';

export default async function render(box, ctx) {
  const firm = ctx.me.firm || {};
  const years = [];
  for (let fy = currentFy(); fy >= FIRST_FY; fy--) years.push({ id: fy, fy, label: fyLabel(fy) });

  const pick = (row) => {
    if (!row) return;
    setFy(row.fy);
    ctx.toast(`Now working in F.Y. ${row.label}`, 'success');
    ctx.navigate('#/home');
  };

  const firmGrid = cgrid({ columns: [{ key: 'name', label: 'Firm Name' }, { key: 'gstin', label: 'GSTIN' }], onOpen: () => {} });
  firmGrid.setRows([{ id: 1, name: ctx.me.firmName || 'Zaitun Engineers', gstin: firm.gstin || '' }]);
  const grid = cgrid({ columns: [{ key: 'label', label: 'Financial Year' }, { key: 'cur', label: '' }], onOpen: pick });
  grid.setRows(years.map((y) => ({ ...y, cur: y.fy === currentFy() ? 'Current year' : '' })));
  grid.select(years.findIndex((y) => y.fy === getFy()));

  const ok = cbtn('Select', { hot: 'S', primary: true, onClick: () => pick(grid.selected) });
  const close = cbtn('Close', { hot: 'C', onClick: () => ctx.close() });
  const win = cwin({ title: 'Change Firm/Year', onClose: () => ctx.close(), className: 'narrow' },
    h('div', { class: 'cstack' }, firmGrid.el, grid.el, h('div', { class: 'cbar' }, ok, close),
      h('p', { class: 'chintline', text: "Press 'ENTER' to select the year. Old years are for looking at; bills can be made in any year." })));
  box.append(win.el);
  setTimeout(() => grid.focus(), 0);
  return {};
}
