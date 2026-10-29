// Challan lists: Delivery Challan (General), Opening / Issue / Receive (Jobwork) and Proforma Invoice (Sales). Aeon layout.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast, confirmDialog } from '/assets/js/ui.js';
import { fmtMoney } from '/assets/js/gst.js';
import { cwin, cbtn, cgrid, wireHotkeys } from '/assets/js/classic/cui.js';
import { getFy, onFyChange, fyStart, fyEnd, fyLabel, ddmmyyyy } from '/assets/js/classic/fy.js';
import { exportSheet } from '/assets/js/classic/xl.js';
import { openPreview } from '/assets/js/print/preview.js';
import { quickAction } from '/assets/js/print/service.js';
import { KINDS } from '/assets/js/pages/challan-kinds.js';

const money = (p) => fmtMoney(p, true);
const qty = (m) => { const s = (m / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, ''); return s; };

export default async function render(box, ctx, kindKey) {
  const K = KINDS[kindKey];
  const st = { fy: getFy(), q: '', seq: 0, rows: [] };
  const from = h('input', { class: 'ci', type: 'date', 'aria-label': 'From date' });
  const to = h('input', { class: 'ci', type: 'date', 'aria-label': 'To date' });
  const search = h('input', { class: 'ci search', type: 'search', placeholder: 'Search party, number or remark', 'aria-label': 'Search', autocomplete: 'off', maxlength: 60 });
  const count = h('span', { class: 'cnote' });
  const resetDates = () => { from.value = fyStart(st.fy); to.value = fyEnd(st.fy); };
  resetDates();

  const cols = [
    { key: 'no_text', label: K.noLabel },
    { key: 'date', label: K.kind === 'jw_opening' ? 'Original Date' : 'Date' },
    { key: 'party_name', label: 'Party Name' },
    { key: 'qty', label: 'Qty', num: true },
  ];
  if (K.tax) cols.push({ key: 'inv_type', label: 'Type' }, { key: 'net', label: 'Net', num: true });
  cols.push({ key: 'remark1', label: 'Remark' });
  const grid = cgrid({
    columns: cols,
    rowClass: (r) => (r.status === 'cancelled' ? 'cancelled' : ''),
    emptyText: `No ${K.plural} in this period.`,
    onOpen: (r) => open(r),
  });
  const open = (r) => r && ctx.navigate(`${K.route}/${r.id}`);

  async function load(keepId) {
    const my = ++st.seq;
    const base = new URLSearchParams({ kind: K.kind, fy: String(st.fy), from: from.value || fyStart(st.fy), to: to.value || fyEnd(st.fy), status: 'all' });
    if (st.q) base.set('q', st.q);
    let rows = [];
    let totals = null;
    try {
      for (;;) {
        base.set('offset', String(rows.length));
        const data = await api('GET', `/api/challans?${base}`);
        if (my !== st.seq) return;
        rows = rows.concat(data.rows);
        totals = data.totals;
        if (!data.more || rows.length > 20000) break;
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not load the list.', 'danger');
      return;
    }
    st.rows = rows.map((r) => ({
      ...r, date: ddmmyyyy(K.kind === 'jw_opening' && r.orig_date ? r.orig_date : r.challan_date), qty: qty(r.qty_milli), net: money(r.net_paise), remark1: String(r.remark || '').split('\n')[0],
    }));
    grid.setRows(st.rows, { keep: !!keepId });
    if (keepId) { const i = st.rows.findIndex((r) => r.id === keepId); if (i >= 0) grid.select(i); }
    grid.setFooter(totals ? { party_name: `Total (${totals.n} ${totals.n === 1 ? K.single : K.plural})`, net: money(totals.net_paise) } : null);
    count.textContent = `${rows.length} ${rows.length === 1 ? K.single : K.plural}`;
  }

  async function del() {
    const r = grid.selected;
    if (!r) return;
    const sure = await confirmDialog({ title: `Delete ${K.single}`, message: `Are you sure? ${K.single} no. ${r.no_text} of ${r.party_name} will be deleted. A full copy is kept in the Activity Log.`, confirmText: 'Yes, delete', cancelText: 'No', danger: true });
    if (!sure) return;
    try {
      await api('DELETE', `/api/challans/${r.id}`);
      toast(`${K.single[0].toUpperCase()}${K.single.slice(1)} deleted`, 'success');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not delete.', 'danger');
    }
  }
  async function cancelIt() {
    const r = grid.selected;
    if (!r) return;
    if (r.status === 'cancelled') { toast(`This ${K.single} is already cancelled.`); return; }
    const sure = await confirmDialog({ title: `Cancel ${K.single}`, message: `Are you sure? ${K.single} no. ${r.no_text} of ${r.party_name} will be cancelled. The number stays, all amounts become zero.`, confirmText: 'Yes, cancel it', cancelText: 'No', danger: true });
    if (!sure) return;
    try {
      await api('POST', `/api/challans/${r.id}/cancel`, {});
      toast(`${K.single[0].toUpperCase()}${K.single.slice(1)} cancelled`, 'success');
      await load(r.id);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not cancel.', 'danger');
    }
  }
  async function exportNow() {
    try {
      await exportSheet(`${K.file}-${fyLabel(st.fy)}.xlsx`, [K.noLabel, 'Date', 'Party Name', 'Qty', 'Net', 'Status', 'Remark'],
        st.rows.map((r) => [r.no_text, r.date, r.party_name, r.qty_milli / 1000, r.net_paise / 100, r.status, String(r.remark || '').replace(/\n/g, ' ')]), K.file);
      toast('Excel file downloaded', 'success');
    } catch {
      toast('Could not make the Excel file.', 'danger');
    }
  }

  const onSelected = (fn) => () => { const r = grid.selected; if (!r) { toast(`Select a ${K.single} first.`); return; } fn(r); };
  const side = h('div', { class: 'cside' },
    cbtn('Add', { hot: 'A', onClick: () => ctx.navigate(`${K.route}/new`) }),
    cbtn('Edit', { hot: 'E', onClick: () => open(grid.selected) }),
    cbtn('Delete', { hot: 'D', onClick: del }),
    cbtn(`Cancel ${K.cap}`, { hot: 'l', onClick: cancelIt }),
    cbtn('Preview', { hot: 'v', onClick: onSelected((r) => openPreview({ query: { ids: [r.id], doc: 'challan' } })) }),
    cbtn('Email', { hot: 'm', onClick: onSelected((r) => quickAction('email', r.id, 'challan')) }),
    cbtn('Bulk Print', { hot: 'k', onClick: () => ctx.navigate(`#/bulkchallan/${kindKey}`) }),
    cbtn('WhatsApp', { hot: 'W', onClick: onSelected((r) => quickAction('whatsapp', r.id, 'challan')) }),
    K.register ? cbtn('Register', { hot: 'R', onClick: () => ctx.navigate('#/dc/register') }) : null,
    cbtn('Export', { hot: 'x', onClick: exportNow }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));

  let timer = null;
  search.addEventListener('input', () => { st.q = search.value.trim(); clearTimeout(timer); timer = setTimeout(() => load(), 250); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); grid.focus(); }
    else if (e.key === 'Enter' && grid.selected) { e.preventDefault(); open(grid.selected); }
  });
  from.addEventListener('change', () => load());
  to.addEventListener('change', () => load());
  ctx.setF2(() => { from.focus(); });

  const offFy = onFyChange((fy) => { st.fy = fy; resetDates(); load(); });
  const win = cwin({ title: `${K.title}  [${fyLabel(st.fy)}]`, onClose: () => ctx.close(), className: 'wide' },
    h('div', { class: 'ctools' }, h('span', { text: 'Search :' }), search, h('span', { text: 'From' }), from, h('span', { text: 'To' }), to, count),
    h('div', { class: 'clist' }, h('div', null, grid.el, h('div', { class: 'chintline red', text: "Press 'INSERT' for add new record. F2 for the date filter." })), side));
  box.append(win.el);
  const offKeys = wireHotkeys(box);
  const onKey = (e) => {
    if (e.key === 'Insert' && !document.querySelector('.overlay')) { e.preventDefault(); ctx.navigate(`${K.route}/new`); }
  };
  document.addEventListener('keydown', onKey);
  await load();
  setTimeout(() => (document.activeElement === document.body ? grid.focus() : null), 0);
  return { destroy: () => { offKeys(); offFy(); document.removeEventListener('keydown', onKey); clearTimeout(timer); st.seq++; } };
}
