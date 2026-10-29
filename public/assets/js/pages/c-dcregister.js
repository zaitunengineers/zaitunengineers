// Delivery Challan Pending / Over / All Register (jobwork goods sent out against goods that came back).

import { api, ApiError } from '/assets/js/api.js';
import { h, toast } from '/assets/js/ui.js';
import { cwin, cbtn, cgrid, combo, wireHotkeys } from '/assets/js/classic/cui.js';
import { todayIST, ddmmyyyy } from '/assets/js/classic/fy.js';
import { exportSheet } from '/assets/js/classic/xl.js';

const qty = (m) => (m / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') || '0';

export default async function render(box, ctx) {
  const st = { seq: 0, rows: [], summary: [], client: null, item: null, to: todayIST() };
  const mode = h('select', { class: 'ci', 'aria-label': 'Show' }, [['pending', 'Pending'], ['over', 'Over'], ['all', 'All']].map(([v, t]) => h('option', { value: v, text: t })));
  const view = h('select', { class: 'ci', 'aria-label': 'View' }, [['detail', 'Challan-wise'], ['summary', 'Party and item totals']].map(([v, t]) => h('option', { value: v, text: t })));
  const from = h('input', { class: 'ci', type: 'date', 'aria-label': 'From date' });
  const to = h('input', { class: 'ci', type: 'date', 'aria-label': 'Up to date', value: st.to });
  const count = h('span', { class: 'cnote' });
  const partyBox = combo({
    placeholder: 'All parties', search: async (q) => (await api('GET', `/api/clients?show=active&limit=20${q ? `&q=${encodeURIComponent(q)}` : ''}`)).rows,
    label: (c) => c.name, render: (c) => h('span', null, c.name, c.city ? h('small', { text: `  ${c.city}` }) : null),
    onPick: (c) => { st.client = c; load(); }, minWidth: 260,
  });
  const itemBox = combo({
    placeholder: 'All items', search: async (q) => (await api('GET', `/api/items?show=active&limit=20${q ? `&q=${encodeURIComponent(q)}` : ''}`)).rows,
    label: (it) => it.name, render: (it) => h('span', null, it.name), onPick: (it) => { st.item = it; load(); }, minWidth: 260,
  });
  for (const [b, key] of [[partyBox, 'client'], [itemBox, 'item']]) {
    const inp = b.el.querySelector('input');
    inp.addEventListener('input', () => { if (!inp.value.trim() && st[key]) { st[key] = null; load(); } });
  }

  const detailCols = [
    { key: 'party_name', label: 'Party Name' }, { key: 'dc_no', label: 'DC No.' }, { key: 'date', label: 'DC Date' }, { key: 'item_name', label: 'Item' }, { key: 'uom', label: 'Unit' },
    { key: 'issued_t', label: 'Issued', num: true }, { key: 'received_t', label: 'Received', num: true }, { key: 'balance_t', label: 'Balance', num: true }, { key: 'days', label: 'Days Out', num: true },
  ];
  const sumCols = [
    { key: 'party_name', label: 'Party Name' }, { key: 'item_name', label: 'Item' }, { key: 'uom', label: 'Unit' },
    { key: 'issued_t', label: 'Issued', num: true }, { key: 'received_t', label: 'Received', num: true }, { key: 'balance_t', label: 'Balance', num: true },
  ];
  const holder = h('div');
  let grid = null;
  function mount() {
    const cols = view.value === 'summary' ? sumCols : detailCols;
    grid = cgrid({ columns: cols, rowClass: (r) => (r.balance < 0 ? 'cancelled' : ''), emptyText: 'Nothing to show.' });
    holder.replaceChildren(grid.el);
    paint();
  }
  function shown() {
    if (view.value === 'summary') return st.summary.map((r, i) => ({ ...r, id: i, issued_t: qty(r.issued), received_t: qty(r.received), balance_t: qty(r.balance) }));
    return st.rows.map((r, i) => ({ ...r, id: i, date: ddmmyyyy(r.dc_date), issued_t: r.issued ? qty(r.issued) : '', received_t: qty(r.received), balance_t: qty(r.balance), days: r.balance > 0 ? String(r.days_out) : '' }));
  }
  function paint() {
    if (!grid) return;
    const rows = shown();
    grid.setRows(rows);
    const n = rows.length;
    count.textContent = `${n} line${n === 1 ? '' : 's'}`;
  }
  async function load() {
    const my = ++st.seq;
    const q = new URLSearchParams({ mode: mode.value, to: to.value || todayIST() });
    if (from.value) q.set('from', from.value);
    if (st.client) q.set('client_id', String(st.client.id));
    if (st.item) q.set('item_id', String(st.item.id));
    try {
      const d = await api('GET', `/api/challans/register?${q}`);
      if (my !== st.seq) return;
      st.rows = d.rows; st.summary = d.summary;
      paint();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not load the register.', 'danger');
    }
  }
  async function exportNow() {
    const rows = shown();
    const cols = view.value === 'summary' ? sumCols : detailCols;
    try {
      await exportSheet('DC-Register.xlsx', cols.map((c) => c.label), rows.map((r) => cols.map((c) => r[c.key] ?? '')), 'Register');
      toast('Excel file downloaded', 'success');
    } catch { toast('Could not make the Excel file.', 'danger'); }
  }
  function printNow() {
    const cols = view.value === 'summary' ? sumCols : detailCols;
    const rows = shown();
    const frame = h('iframe', { class: 'printframe', title: 'Print', tabindex: '-1', 'aria-hidden': 'true' });
    document.body.append(frame);
    const doc = frame.contentDocument;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/print.css';
    doc.head.append(link);
    doc.body.className = 'regdoc';
    const el = (tag, text, cls) => { const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
    doc.body.append(el('h1', `Delivery Challan ${{ pending: 'Pending', over: 'Over', all: 'All' }[mode.value]} Register`));
    doc.body.append(el('p', `Up to ${ddmmyyyy(to.value)}${st.client ? `   Party: ${st.client.name}` : ''}${st.item ? `   Item: ${st.item.name}` : ''}`));
    const table = el('table');
    const tr0 = el('tr');
    cols.forEach((c) => tr0.append(el('th', c.label, c.num ? 'num' : '')));
    table.append(tr0);
    rows.forEach((r) => { const tr = el('tr'); cols.forEach((c) => tr.append(el('td', String(r[c.key] ?? ''), c.num ? 'num' : ''))); table.append(tr); });
    doc.body.append(table);
    const go = () => { const cleanup = () => frame.remove(); frame.contentWindow.addEventListener('afterprint', () => setTimeout(cleanup, 500)); setTimeout(cleanup, 600000); frame.contentWindow.focus(); frame.contentWindow.print(); };
    if (link.sheet) go(); else { link.onload = go; link.onerror = go; setTimeout(go, 1500); }
  }

  mode.addEventListener('change', load);
  view.addEventListener('change', mount);
  from.addEventListener('change', load);
  to.addEventListener('change', load);
  const side = h('div', { class: 'cside' },
    cbtn('Print', { hot: 'P', primary: true, onClick: printNow }),
    cbtn('Export', { hot: 'x', onClick: exportNow }),
    cbtn('Issue', { hot: 'I', onClick: () => ctx.navigate('#/dc/issue') }),
    cbtn('Receive', { hot: 'R', onClick: () => ctx.navigate('#/dc/receive') }),
    cbtn('Back', { hot: 'B', onClick: () => ctx.navigate('#/home') }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));
  const win = cwin({ title: 'Delivery Challan Pending/Over/All Register', onClose: () => ctx.close(), className: 'wide' },
    h('div', { class: 'ctools' }, h('span', { text: 'Show' }), mode, view, h('span', { text: 'From' }), from, h('span', { text: 'Up to' }), to, count),
    h('div', { class: 'ctools' }, h('span', { text: 'Party' }), partyBox.el, h('span', { text: 'Item' }), itemBox.el),
    h('div', { class: 'clist' }, h('div', null, holder, h('div', { class: 'chintline', text: 'Goods sent for jobwork against goods that came back. "Over" means more came back than was sent.' })), side));
  box.append(win.el);
  const offKeys = wireHotkeys(box);
  mount();
  await load();
  return { destroy: () => { offKeys(); st.seq++; }, back: () => '#/home' };
}
