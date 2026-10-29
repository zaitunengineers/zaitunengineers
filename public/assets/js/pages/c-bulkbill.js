// Bulk Bill: print or save many bills together. Pick the dates, untick any bill you do not want.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast } from '/assets/js/ui.js';
import { fmtMoney } from '/assets/js/gst.js';
import { cwin, cbtn, wireHotkeys } from '/assets/js/classic/cui.js';
import { getFy, onFyChange, fyStart, fyEnd, fyLabel, ddmmyyyy, todayIST, currentFy } from '/assets/js/classic/fy.js';
import { loadPrintData, optionsFrom, getPrefs, savePrefs, copyNames, printNow, savePdf, logPrint } from '/assets/js/print/service.js';
import { openPreview } from '/assets/js/print/preview.js';
import { isPhoneLike } from '/assets/js/print/dialog.js';
import { KINDS } from '/assets/js/pages/challan-kinds.js';

const MAX = 100;

export default async function render(box, ctx, kindKey) {
  const K = kindKey ? KINDS[kindKey] : null; // a challan kind, or null for bills
  const doc = K ? 'challan' : 'bill';
  const back = K ? K.route : '#/sales';
  const word = K ? K.single : 'bill';
  const noOf = (r) => (K ? r.no_text : r.bill_no);
  const dateOf = (r) => (K ? r.challan_date : r.bill_date);
  const st = { fy: getFy(), rows: [], checked: new Set(), seq: 0 };
  const from = h('input', { class: 'ci', type: 'date', 'aria-label': 'From date' });
  const to = h('input', { class: 'ci', type: 'date', 'aria-label': 'To date' });
  const count = h('span', { class: 'cnote' });
  const settings = (await api('GET', '/api/settings')).settings || ctx.settings();
  const prefs = getPrefs();
  const phone = isPhoneLike();

  function defaultRange() {
    if (st.fy === currentFy()) {
      const t = todayIST();
      from.value = `${t.slice(0, 8)}01` < fyStart(st.fy) ? fyStart(st.fy) : `${t.slice(0, 8)}01`;
      to.value = t;
    } else {
      from.value = fyStart(st.fy);
      to.value = fyEnd(st.fy);
    }
  }
  defaultRange();

  const all = h('input', { type: 'checkbox', 'aria-label': 'Tick all' });
  const tbody = h('tbody');
  const table = h('table', { class: 'cgrid' }, h('thead', null, h('tr', null, h('th', null, all), h('th', { class: 'num', text: K ? K.noLabel : 'Bill No.' }), h('th', { text: K ? 'Date' : 'Bill Date' }), h('th', { text: 'Party Name' }), h('th', { class: 'num', text: 'Net' }))), tbody);
  const empty = h('div', { class: 'cgrid-empty', text: `No ${word}s in these dates.`, hidden: true });
  const wrap = h('div', { class: 'cgrid-wrap' }, table, empty);

  function refreshCount() {
    const n = st.checked.size;
    count.textContent = `${n} of ${st.rows.length} ${word}${st.rows.length === 1 ? '' : 's'} ticked${n > MAX ? ` (only ${MAX} at a time)` : ''}`;
    all.checked = st.rows.length > 0 && n === st.rows.length;
  }
  function paint() {
    tbody.replaceChildren(...st.rows.map((r) => {
      const t = h('input', { type: 'checkbox', checked: st.checked.has(r.id), 'aria-label': `${word} ${noOf(r)}` });
      t.addEventListener('change', () => { if (t.checked) st.checked.add(r.id); else st.checked.delete(r.id); refreshCount(); });
      return h('tr', { class: r.status === 'cancelled' ? 'cancelled' : '' }, h('td', null, t), h('td', { class: 'num', text: String(noOf(r)) }), h('td', { text: ddmmyyyy(dateOf(r)) }), h('td', { text: r.party_name }), h('td', { class: 'num', text: fmtMoney(r.net_paise, true) }));
    }));
    empty.hidden = st.rows.length > 0;
    refreshCount();
  }
  all.addEventListener('change', () => {
    st.checked = all.checked ? new Set(st.rows.map((r) => r.id)) : new Set();
    paint();
  });

  async function load() {
    const my = ++st.seq;
    const base = new URLSearchParams({ ...(K ? { kind: K.kind } : {}), fy: String(st.fy), from: from.value || fyStart(st.fy), to: to.value || fyEnd(st.fy), status: 'all' });
    let rows = [];
    try {
      for (;;) {
        base.set('offset', String(rows.length));
        const data = await api('GET', K ? `/api/challans?${base}` : `/api/bills?${base}`);
        if (my !== st.seq) return;
        rows = rows.concat(data.rows);
        if (!data.more || rows.length > 5000) break;
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : `Could not load the ${word}s.`, 'danger');
      return;
    }
    st.rows = rows;
    st.checked = new Set(rows.filter((r) => r.status !== 'cancelled').map((r) => r.id));
    paint();
  }

  const ids = () => st.rows.filter((r) => st.checked.has(r.id)).map((r) => r.id);
  function pick() {
    const list = ids();
    if (!list.length) { toast(`Tick at least one ${word}.`, 'warning'); return null; }
    if (list.length > MAX) { toast(`That is ${list.length} ${word}s. Pick a shorter date range or untick some (${MAX} at a time).`, 'warning', 6000); return null; }
    return list;
  }
  const copyTicks = copyNames(settings).map((n, i) => {
    const t = h('input', { type: 'checkbox', checked: !!prefs.copies[i], 'aria-label': n });
    t.addEventListener('change', () => {
      prefs.copies[i] = t.checked;
      if (!prefs.copies.some(Boolean)) { prefs.copies[i] = true; t.checked = true; }
      savePrefs(prefs);
    });
    return h('label', { class: 'cinline' }, t, n);
  });

  async function make(kind) {
    const list = pick();
    if (!list) return;
    const t = toast(`Making ${list.length} ${word}${list.length === 1 ? '' : 's'}…`, 'info', 0);
    try {
      const data = await loadPrintData({ ids: list, doc });
      const opts = optionsFrom(data, getPrefs());
      if (kind === 'print') { await printNow(data, opts); logPrint(list, 'bulk', doc); }
      else { const r = await savePdf(data, opts); if (r !== 'cancelled') logPrint(list, 'bulk', doc); }
    } catch (e) {
      toast((e && e.message) || 'Could not make the bills.', 'danger');
    } finally {
      t.remove();
    }
  }

  const side = h('div', { class: 'cside' },
    cbtn('Preview', { hot: 'v', primary: true, onClick: () => { const list = pick(); if (list) openPreview({ query: { ids: list, doc } }); } }),
    phone ? null : cbtn('Print', { hot: 'P', onClick: () => make('print') }),
    cbtn(phone ? 'PDF / Share' : 'PDF', { hot: 'D', onClick: () => make('pdf') }),
    cbtn('Tick All', { hot: 'T', onClick: () => { st.checked = new Set(st.rows.map((r) => r.id)); paint(); } }),
    cbtn('Untick All', { hot: 'U', onClick: () => { st.checked = new Set(); paint(); } }),
    cbtn('Back', { hot: 'B', onClick: () => ctx.navigate(back) }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));

  from.addEventListener('change', load);
  to.addEventListener('change', load);
  const offFy = onFyChange((fy) => { st.fy = fy; defaultRange(); load(); });
  const win = cwin({ title: `${K ? 'Bulk Print' : 'Bulk Bill'}  [${fyLabel(st.fy)}]`, onClose: () => ctx.navigate(back), className: 'wide' },
    h('div', { class: 'ctools' }, h('span', { text: 'From' }), from, h('span', { text: 'To' }), to, count),
    h('div', { class: 'ctools' }, h('span', { text: 'Copies:' }), ...copyTicks),
    h('div', { class: 'clist' }, h('div', null, wrap, h('div', { class: 'chintline', text: `Cancelled ${word}s start unticked. ${MAX} at a time. All ticked ${word}s come out as one PDF.` })), side));
  box.append(win.el);
  const offKeys = wireHotkeys(box);
  await load();
  return { destroy: () => { offKeys(); offFy(); st.seq++; }, back: () => back };
}
