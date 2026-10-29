// Sale list (and Sale (Cancel) list): Aeon layout.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast, confirmDialog } from '/assets/js/ui.js';
import { fmtMoney } from '/assets/js/gst.js';
import { cwin, cbtn, cgrid, wireHotkeys } from '/assets/js/classic/cui.js';
import { getFy, onFyChange, fyStart, fyEnd, fyLabel, ddmmyyyy } from '/assets/js/classic/fy.js';
import { exportSheet } from '/assets/js/classic/xl.js';
import { openPreview } from '/assets/js/print/preview.js';
import { quickAction } from '/assets/js/print/service.js';

const money = (p) => fmtMoney(p, true);

export default async function render(box, ctx, opts = {}) {
  const cancelledView = !!opts.cancelled;
  const st = { fy: getFy(), q: '', seq: 0, rows: [], kind: 'all' };
  const from = h('input', { class: 'ci', type: 'date', 'aria-label': 'From date' });
  const to = h('input', { class: 'ci', type: 'date', 'aria-label': 'To date' });
  const search = h('input', { class: 'ci search', type: 'search', placeholder: 'Search party, bill no. or GSTIN', 'aria-label': 'Search', autocomplete: 'off', maxlength: 60 });
  const kindSel = h('select', { class: 'ci', 'aria-label': 'Type' }, [['all', 'All'], ['sale', 'Sale'], ['jobwork', 'Jobwork']].map(([v, t]) => h('option', { value: v, text: t })));
  const count = h('span', { class: 'cnote' });
  const resetDates = () => { from.value = fyStart(st.fy); to.value = fyEnd(st.fy); };
  resetDates();

  const grid = cgrid({
    columns: [
      { key: 'dr', label: 'DrCr' },
      { key: 'inv_type', label: 'Type' },
      { key: 'bill_no', label: 'Bill No.', num: true, render: (r) => (r.bill_kind === 'jobwork' ? `${r.bill_no} J` : String(r.bill_no)) },
      { key: 'date', label: 'Bill Date' },
      { key: 'party_name', label: 'Party Name' },
      { key: 'amount', label: 'Amount', num: true },
      { key: 'gross', label: 'Gross', num: true },
      { key: 'cgst', label: 'CGST', num: true },
      { key: 'sgst', label: 'SGST', num: true },
      { key: 'igst', label: 'IGST', num: true },
      { key: 'net', label: 'Net', num: true },
    ],
    rowClass: (r) => (r.status === 'cancelled' ? 'cancelled' : ''),
    emptyText: cancelledView ? 'No cancelled bills in this period.' : 'No bills in this period.',
    onOpen: (r) => open(r),
  });

  const open = (r) => r && ctx.navigate(`#/sales/${r.id}`);

  async function load(keepId) {
    const my = ++st.seq;
    const base = new URLSearchParams({ fy: String(st.fy), from: from.value || fyStart(st.fy), to: to.value || fyEnd(st.fy), status: cancelledView ? 'cancelled' : 'all' });
    if (st.q) base.set('q', st.q);
    if (st.kind !== 'all') base.set('kind', st.kind);
    let rows = [];
    let totals = null;
    try {
      for (;;) {
        base.set('offset', String(rows.length));
        const data = await api('GET', `/api/bills?${base}`);
        if (my !== st.seq) return;
        rows = rows.concat(data.rows);
        totals = data.totals;
        if (!data.more || rows.length > 20000) break;
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not load the bills.', 'danger');
      return;
    }
    st.rows = rows.map((r) => ({ ...r, dr: 'Dr', date: ddmmyyyy(r.bill_date), amount: money(r.amount_paise), gross: money(r.taxable_paise), cgst: money(r.cgst_paise), sgst: money(r.sgst_paise), igst: money(r.igst_paise), net: money(r.net_paise) }));
    grid.setRows(st.rows, { keep: !!keepId });
    if (keepId) { const i = st.rows.findIndex((r) => r.id === keepId); if (i >= 0) grid.select(i); }
    grid.setFooter(totals ? { party_name: `Total (${totals.n} bill${totals.n === 1 ? "" : "s"})`, amount: money(totals.amount_paise), gross: money(totals.taxable_paise), cgst: money(totals.cgst_paise), sgst: money(totals.sgst_paise), igst: money(totals.igst_paise), net: money(totals.net_paise) } : null);
    count.textContent = `${rows.length} bill${rows.length === 1 ? '' : 's'}`;
  }

  async function del() {
    const r = grid.selected;
    if (!r) return;
    const sure = await confirmDialog({ title: 'Delete Bill', message: `Are you sure? Bill no. ${r.bill_no} of ${r.party_name} will be deleted. The number stays empty. A full copy is kept in the Activity Log.`, confirmText: 'Yes, delete', cancelText: 'No', danger: true });
    if (!sure) return;
    try {
      await api('DELETE', `/api/bills/${r.id}`);
      toast('Bill deleted', 'success');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not delete the bill.', 'danger');
    }
  }

  async function cancelBill() {
    const r = grid.selected;
    if (!r) return;
    if (r.status === 'cancelled') { toast('This bill is already cancelled.'); return; }
    const sure = await confirmDialog({ title: 'Cancel Bill', message: `Are you sure? Bill no. ${r.bill_no} of ${r.party_name} will be cancelled. The number stays, all amounts become zero.`, confirmText: 'Yes, cancel it', cancelText: 'No', danger: true });
    if (!sure) return;
    try {
      await api('POST', `/api/bills/${r.id}/cancel`, {});
      toast('Bill cancelled', 'success');
      await load(r.id);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not cancel the bill.', 'danger');
    }
  }

  async function exportNow() {
    try {
      await exportSheet(`Sale-${fyLabel(st.fy)}.xlsx`, ['DrCr', 'Type', 'Bill No.', 'Bill Date', 'Party Name', 'Amount', 'Gross', 'CGST', 'SGST', 'IGST', 'Net'],
        st.rows.map((r) => [r.dr, r.inv_type, r.bill_no, r.date, r.party_name, r.amount_paise / 100, r.taxable_paise / 100, r.cgst_paise / 100, r.sgst_paise / 100, r.igst_paise / 100, r.net_paise / 100]), 'Sale');
      toast('Excel file downloaded', 'success');
    } catch {
      toast('Could not make the Excel file.', 'danger');
    }
  }

  const later = (label, note) => cbtn(label, { disabled: true, onClick: () => toast(note) });
  const onSelected = (fn) => () => { const r = grid.selected; if (!r) { toast('Select a bill first.'); return; } fn(r); };
  const side = h('div', { class: 'cside' },
    cancelledView ? null : cbtn('Add', { hot: 'A', onClick: () => ctx.navigate('#/sales/new') }),
    cbtn('Edit', { hot: 'E', onClick: () => open(grid.selected) }),
    cbtn('Delete', { hot: 'D', onClick: del }),
    cancelledView ? null : cbtn('Cancel Bill', { hot: 'l', onClick: cancelBill }),
    cbtn('Preview', { hot: 'v', onClick: onSelected((r) => openPreview({ query: { ids: [r.id] } })) }),
    cbtn('Email', { hot: 'm', onClick: onSelected((r) => quickAction('email', r.id)) }),
    cbtn('Bulk Bill', { hot: 'k', onClick: () => ctx.navigate('#/sales/bulk') }),
    later('Cover', 'Envelope covers are not used by your firm.'),
    cbtn('Digital Sign', { hot: 'g', onClick: () => ctx.navigate('#/digisign') }),
    cbtn('WhatsApp', { hot: 'W', onClick: onSelected((r) => quickAction('whatsapp', r.id)) }),
    later('Import', 'Old Aeon bills come in Stage 6.'), later('e-Invoice', 'Not planned.'), later('eWay', 'Not planned.'),
    cbtn('Export', { hot: 'x', onClick: exportNow }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));

  let timer = null;
  const reloadSoon = () => { clearTimeout(timer); timer = setTimeout(() => load(), 250); };
  search.addEventListener('input', () => { st.q = search.value.trim(); reloadSoon(); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); grid.focus(); }
    else if (e.key === 'Enter' && grid.selected) { e.preventDefault(); open(grid.selected); }
  });
  kindSel.addEventListener('change', () => { st.kind = kindSel.value; load(); });
  from.addEventListener('change', () => load());
  to.addEventListener('change', () => load());
  ctx.setF2(() => { from.focus(); });

  const offFy = onFyChange((fy) => { st.fy = fy; resetDates(); load(); });
  const win = cwin({ title: cancelledView ? 'Sale (Cancel)' : `Sale  [${fyLabel(st.fy)}]`, onClose: () => ctx.close(), className: 'wide' },
    h('div', { class: 'ctools' }, h('span', { text: 'Search :' }), search, h('span', { text: 'From' }), from, h('span', { text: 'To' }), to, h('span', { text: 'Type' }), kindSel, count),
    h('div', { class: 'clist' }, h('div', null, grid.el, h('div', { class: 'chintline red', text: "Press 'INSERT' for add new record. F2 for the date filter." })), side));
  box.append(win.el);
  const offKeys = wireHotkeys(box);
  const onKey = (e) => {
    if (e.key === 'Insert' && !cancelledView && !document.querySelector('.overlay')) { e.preventDefault(); ctx.navigate('#/sales/new'); }
  };
  document.addEventListener('keydown', onKey);
  await load();
  setTimeout(() => (document.activeElement === document.body ? grid.focus() : null), 0);
  return { destroy: () => { offKeys(); offFy(); document.removeEventListener('keydown', onKey); clearTimeout(timer); st.seq++; } };
}
