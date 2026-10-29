// Sale entry (Aeon layout). Debit bills only. Opens as #/sales/new or #/sales/<id>.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast, confirmDialog, sheet } from '/assets/js/ui.js';
import { lineMaths, sumLines, fmtMoney, amountInWords, CHARGE_KEYS, fyLabel } from '/assets/js/gst.js';
import { getFy, defaultBillDate, ddmmyyyy, weekday, fyStart, fyEnd } from '/assets/js/classic/fy.js';
import { cwin, cbtn, crow, cinput, combo, wireHotkeys } from '/assets/js/classic/cui.js';
import { wireEnter, focusNext } from '/assets/js/classic/nav.js';
import { openClientSheet } from '/assets/js/forms/client-form.js';
import { openItemSheet } from '/assets/js/forms/item-form.js';
import { printFlow } from '/assets/js/print/flow.js';
import { openPreview } from '/assets/js/print/preview.js';
import { quickAction } from '/assets/js/print/service.js';

const MAX_LINES = 30;
let pendingAction = null; // 'preview' | 'whatsapp': carried over when a new bill is saved first and its own page opens
const money = (p) => fmtMoney(p, true);

// ---- exact decimal reading (no floating point) ----
function scaled(v, dec) {
  const s = String(v ?? '').replace(/[\s,]/g, '');
  if (s === '') return { empty: true };
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return { error: true };
  const [w, f0 = ''] = s.split('.');
  if (f0.length > dec && f0.slice(dec).replace(/0+$/, '')) return { error: true };
  const f = (f0 + '0'.repeat(dec)).slice(0, dec);
  return { n: Number(w || '0') * 10 ** dec + Number(f || '0') };
}
function fromScaled(n, dec, minDec) {
  if (n === null || n === undefined) return '';
  const s = (n / 10 ** dec).toFixed(dec);
  if (!s.includes('.')) return s;
  let [w, f] = s.split('.');
  while (f.length > minDec && f.endsWith('0')) f = f.slice(0, -1);
  return f ? `${w}.${f}` : w;
}

export default async function render(box, ctx, id) {
  const isNew = id === 'new' || id === 'newjw';
  const cfg = ctx.settings() || {};
  const on = (k) => cfg[k] === '1';
  const firmState = (ctx.me && ctx.me.firm && ctx.me.firm.state_code) || '24';
  const fy = getFy();
  const lblX = [cfg.lbl_x1 || 'PO NO 1', cfg.lbl_x2 || 'SUPPLIER CODE', cfg.lbl_x3 || 'PO NO 2', cfg.lbl_x4 || 'PO NO 3'];

  let saved = null;
  if (!isNew) {
    try {
      saved = (await api('GET', `/api/bills/${encodeURIComponent(id)}`)).bill;
    } catch (e) {
      box.append(cwin({ title: 'Sale', onClose: () => ctx.navigate('#/sales') }, h('p', { text: e instanceof ApiError && e.status === 404 ? 'This bill was not found. It may have been deleted.' : 'Could not load this bill.' }), cbtn('Back', { onClick: () => ctx.navigate('#/sales') })).el);
      return {};
    }
  }
  const billFy = saved ? saved.fy : fy;
  const readOnly = !!saved && saved.status === 'cancelled';
  const jobwork = id === 'newjw' || (!!saved && saved.bill_kind === 'jobwork');
  const heading = jobwork ? 'Jobwork/Service with Goods' : 'Sale';

  let transporters = [];
  try { transporters = (await api('GET', '/api/transporters?show=active')).rows; } catch { transporters = []; }
  let nextNo = '';
  if (isNew) {
    try { nextNo = String((await api('GET', `/api/bills/next?fy=${billFy}`)).next); } catch { nextNo = ''; }
  }

  // ---------------- state ----------------
  const S = {
    client: null, inv_type: 'GST', reverse_charge: 0, transporter_id: 1, lines: [],
  };
  const emptyLine = () => ({ item: null, description: '', hsn: '', qty: '', rate: '', disc_pct: '', a1: '', a2: '', a3: '', a4: '', a5: '', a6: '', l2: '', gst_bp: 1800, rateTouched: false, last: '' });

  // ---------------- header controls ----------------
  const I = {};
  const R = {};
  const txt = (key, label, o = {}) => {
    I[key] = cinput({ maxlength: o.max, 'data-nav': '', class: `ci${o.upper ? ' upper' : ''}` });
    R[key] = crow(label, I[key]);
    return R[key];
  };
  const ro = (key, label) => {
    I[key] = cinput({ readonly: true, tabindex: '-1', class: 'ci ro' });
    R[key] = crow(label, I[key]);
    return R[key];
  };

  const partyBox = combo({
    id: 'party', placeholder: 'Type to search the party',
    search: async (q) => (await api('GET', `/api/clients?show=active&limit=20${q ? `&q=${encodeURIComponent(q)}` : ''}`)).rows,
    label: (c) => c.name,
    render: (c) => h('span', null, c.name, c.city ? h('small', { text: `  ${c.city}` }) : null, c.gstin ? h('small', { text: `  ${c.gstin}` }) : null),
    onAdd: async (text) => {
      const c = await openClientSheet({ prefillName: text });
      return c || null;
    },
    onPick: (c) => setParty(c),
    minWidth: 340,
  });
  R.party = crow('Party Name', partyBox.el);
  ro('gstin', 'GSTIN'); I.gstin.classList.add('gstin');
  ro('reg', 'Reg. Type'); ro('city', 'City'); ro('state', 'State');
  const addr = h('textarea', { class: 'ci ro', rows: 3, readonly: true, tabindex: '-1' });
  I.addr = addr;
  R.addr = crow('Address', addr);

  const bookBox = cinput({ value: 'Sales Book', readonly: true, tabindex: '-1', class: 'ci ro' });
  R.book = crow('Bill Book', bookBox);
  const dr = cinput({ value: 'Debit', readonly: true, tabindex: '-1', class: 'ci ro' });
  R.dr = crow('Type', dr);
  I.inv_type = h('select', { class: 'ci', 'data-nav': '' }, h('option', { value: 'GST', text: 'GST (CGST + SGST)' }), h('option', { value: 'IGST', text: 'IGST' }));
  const warn = h('div', { class: 'se-warn' });
  R.inv_type = crow('Invoice Type', h('span', { class: 'cinline' }, I.inv_type));
  R.inv_type.querySelector('.cc').append(warn);
  I.bill_no = cinput({ maxlength: 7, inputmode: 'numeric', 'data-nav': '', class: 'ci' });
  const noNote = h('div', { class: 'se-warn' });
  R.bill_no = crow('Bill No.', I.bill_no);
  R.bill_no.querySelector('.cc').append(noNote);
  I.bill_date = h('input', { class: 'ci', type: 'date', 'data-nav': '', min: fyStart(billFy), max: fyEnd(billFy), 'aria-label': 'Bill date' });
  const wd = h('span', { class: 'wd' });
  R.bill_date = crow('Bill Date', h('span', { class: 'cinline' }, I.bill_date, wd));
  I.transporter = h('select', { class: 'ci', 'data-nav': '' });
  R.transporter = crow('Transporter', I.transporter);
  txt('lr_no', 'LR/RR No.', { max: 30 });
  I.lr_date = h('input', { class: 'ci', type: 'date', 'data-nav': '', 'aria-label': 'LR date' });
  R.lr_date = crow('LR/RR Date', I.lr_date);
  txt('vehicle_no', 'Vehicle No.', { max: 20, upper: true });
  for (let i = 1; i <= 4; i++) txt(`x${i}`, lblX[i - 1], { max: 60 });
  I.po_date = h('input', { class: 'ci', type: 'date', 'data-nav': '', 'aria-label': cfg.lbl_po_date || 'PO DATE' });
  R.po_date = crow(cfg.lbl_po_date || 'PO DATE', I.po_date);
  I.reverse_charge = h('select', { class: 'ci', 'data-nav': '' }, h('option', { value: '0', text: 'No' }), h('option', { value: '1', text: 'Yes' }));
  R.reverse_charge = crow('Reverse Charge', I.reverse_charge);

  const fillTransporters = (selected) => {
    const opts = transporters.map((t) => h('option', { value: String(t.id), text: t.name }));
    if (selected && !transporters.some((t) => t.id === selected.id)) opts.push(h('option', { value: String(selected.id), text: selected.name }));
    opts.push(h('option', { value: '__new', text: '+ Add new transporter…' }));
    I.transporter.replaceChildren(...opts);
  };

  // ---------------- remarks and totals ----------------
  for (let i = 1; i <= 3; i++) txt(`remark${i}`, i === 1 ? 'Remarks' : ' ', { max: 150 });
  const netBig = h('div', { class: 'big', text: '0.00' });
  const words = h('div', { class: 'words' });
  const roundBox = cinput({ value: '0.00', readonly: true, tabindex: '-1', class: 'ci ro num' });
  const netBox = h('div', { class: 'se-net' }, h('div', { class: 'lab', text: 'Round Off' }), roundBox, h('div', { class: 'lab', text: 'Net Amount' }), netBig, words);
  const lastLine = h('div', { class: 'se-last' });

  // ---------------- lines table ----------------
  const thead = h('thead');
  const tbody = h('tbody');
  const tfoot = h('tfoot');
  const table = h('table', null, thead, tbody, tfoot);
  const linesWrap = h('div', { class: 'se-lines' }, table);
  const rowEls = [];

  function columns() {
    const c = [];
    c.push({ k: 'sr', label: '#', ro: true });
    c.push({ k: 'name', label: 'Goods / Service' });
    c.push({ k: 'hsn', label: 'HSN/SAC' });
    c.push({ k: 'qty', label: 'Qty', num: true });
    c.push({ k: 'uom', label: 'Unit', ro: true });
    c.push({ k: 'rate', label: 'Rate', num: true });
    if (on('sw_disc')) c.push({ k: 'disc_pct', label: `${cfg.lbl_disc || 'Discount'} %`, num: true });
    for (const k of CHARGE_KEYS) if (on(`sw_${k}`)) c.push({ k, label: cfg[`lbl_${k}`] || k, num: true });
    c.push({ k: 'gross', label: 'Gross', num: true, ro: true });
    c.push({ k: 'gst_bp', label: S.inv_type === 'IGST' ? 'IGST %' : 'GST %' });
    if (S.inv_type === 'IGST') c.push({ k: 'igst', label: 'IGST', num: true, ro: true });
    else { c.push({ k: 'cgst', label: 'CGST', num: true, ro: true }); c.push({ k: 'sgst', label: 'SGST', num: true, ro: true }); }
    c.push({ k: 'net', label: 'Net', num: true, ro: true });
    c.push({ k: 'del', label: '' });
    return c;
  }
  let cols = columns();

  function calc(l) {
    if (!l.item) return null;
    const q = scaled(l.qty, 3);
    if (q.error || q.empty || q.n <= 0) return null;
    const r = scaled(l.rate, 3);
    const raw = { qty_milli: q.n, rate_milli: r.n || 0, disc_bp: 0 };
    if (on('sw_disc')) { const d = scaled(l.disc_pct, 2); if (d.n) raw.disc_bp = d.n; }
    for (const k of CHARGE_KEYS) if (on(`sw_${k}`)) { const v = scaled(l[k], 2); if (v.n) raw[k] = v.n; }
    return { ...lineMaths(raw, S.inv_type, l.gst_bp), qty_milli: q.n };
  }

  function recalc() {
    const done = [];
    S.lines.forEach((l, i) => {
      const m = calc(l);
      l.m = m;
      const tr = rowEls[i];
      if (!tr) return;
      const set = (k, v) => { const td = tr.querySelector(`[data-k="${k}"]`); if (td) td.textContent = v; };
      set('gross', m ? money(m.taxable_paise) : '');
      set('igst', m ? money(m.igst_paise) : '');
      set('cgst', m ? money(m.cgst_paise) : '');
      set('sgst', m ? money(m.sgst_paise) : '');
      set('net', m ? money(m.net_paise) : '');
      if (m) done.push(m);
    });
    const t = sumLines(done);
    const fcell = (k, v) => { const td = tfoot.querySelector(`[data-k="${k}"]`); if (td) td.textContent = v; };
    fcell('qty', t.qty_milli ? fromScaled(t.qty_milli, 3, 0) : '');
    fcell('gross', money(t.taxable_paise));
    fcell('igst', money(t.igst_paise));
    fcell('cgst', money(t.cgst_paise));
    fcell('sgst', money(t.sgst_paise));
    fcell('net', money(t.net_paise));
    netBig.textContent = money(t.net_paise);
    words.textContent = t.net_paise > 0 ? amountInWords(t.net_paise) : '';
  }

  const itemCombo = (line) => combo({
    placeholder: 'Type to search goods',
    value: line.item,
    search: async (q) => (await api('GET', `/api/items?show=active&limit=20${q ? `&q=${encodeURIComponent(q)}` : ''}`)).rows,
    label: (it) => it.name,
    render: (it) => h('span', null, it.name, h('small', { text: `  ${it.code || ''} ${it.uom || ''}` })),
    onAdd: async (text) => (await openItemSheet({ prefillName: text })) || null,
    onPick: (it) => pickItem(line, it),
    minWidth: 340,
    cls: 'ci',
  });

  async function pickItem(line, it) {
    line.item = it;
    line.hsn = it.code || '';
    line.gst_bp = it.gst_bp ?? 1800;
    if (!line.description && it.description) line.description = it.description;
    if (!line.rateTouched) line.rate = it.rate_paise != null ? fromScaled(it.rate_paise, 2, 2) : '';
    line.last = '';
    syncRow(S.lines.indexOf(line));
    recalc();
    try {
      const q = new URLSearchParams({ item_id: String(it.id) });
      if (S.client) q.set('client_id', String(S.client.id));
      const { last } = await api('GET', `/api/bills/last-rate?${q}`);
      if (last && line.item === it) {
        const rateText = fromScaled(last.rate_milli, 3, 2);
        line.last = `Last Sale Rate: ${rateText}  (${last.scope === 'party' ? 'to this party' : 'to anyone'}, ${ddmmyyyy(last.bill_date)}, bill no. ${last.bill_no})`;
        if (!line.rateTouched) {
          line.rate = rateText;
          const inp = rowEls[S.lines.indexOf(line)] && rowEls[S.lines.indexOf(line)].querySelector('[data-f="rate"]');
          if (inp) inp.value = rateText;
          recalc();
        }
        lastLine.textContent = line.last;
      } else lastLine.textContent = '';
    } catch { lastLine.textContent = ''; }
  }

  // Update a row in place (the box the cursor is in must stay the same box).
  function syncRow(i) {
    const tr = rowEls[i];
    const line = S.lines[i];
    if (!tr) return;
    const f = (k) => tr.querySelector(`[data-f="${k}"]`);
    if (f('hsn')) f('hsn').value = line.hsn || '';
    if (f('rate')) f('rate').value = line.rate || '';
    if (f('gst_bp')) f('gst_bp').value = String(line.gst_bp);
    const uom = tr.querySelector('[data-k="uom"]');
    if (uom) uom.textContent = line.item ? line.item.uom || '' : '';
    const sub = f('description');
    if (sub) {
      sub.value = line.description || '';
      sub.hidden = !(line.item && (line.item.desc_required || line.description));
      if (line.item && line.item.desc_required) sub.setAttribute('data-nav', ''); else sub.removeAttribute('data-nav');
    }
  }

  function numInput(line, key, extra = {}) {
    const inp = cinput({ 'data-nav': '', 'data-f': key, inputmode: 'decimal', maxlength: 14, class: 'ci num', ...extra });
    inp.value = line[key] || '';
    inp.addEventListener('input', () => {
      line[key] = inp.value;
      if (key === 'rate') line.rateTouched = true;
      inp.removeAttribute('aria-invalid');
      recalc();
    });
    return inp;
  }

  function buildRow(line, i) {
    const tr = h('tr', { class: 'ln' });
    for (const c of cols) {
      const td = h('td', { 'data-label': c.label, 'data-k': c.k, class: c.ro ? 'ro' : '' });
      if (c.k === 'sr') td.textContent = String(i + 1);
      else if (c.k === 'name') {
        td.className = 'name';
        const cb = itemCombo(line);
        cb.el.querySelector('input').setAttribute('data-f', 'item');
        cb.el.addEventListener('combo-empty-enter', () => { I.remark1.focus(); });
        td.append(cb.el);
        const sub = cinput({ placeholder: 'Description (optional)', maxlength: 200, 'data-f': 'description', class: 'ci sub-in' });
        sub.value = line.description || '';
        sub.hidden = !(line.item && (line.item.desc_required || line.description));
        sub.addEventListener('input', () => { line.description = sub.value; });
        td.append(sub);
        if (line.item && line.item.desc_required) sub.setAttribute('data-nav', '');
      } else if (c.k === 'hsn') {
        td.className = '';
        const inp = cinput({ maxlength: 8, inputmode: 'numeric', 'data-f': 'hsn', class: 'ci', 'aria-label': 'HSN or SAC' });
        inp.value = line.hsn || '';
        if (!on('hsn_edit')) { inp.readOnly = true; inp.tabIndex = -1; }
        inp.addEventListener('input', () => { line.hsn = inp.value; });
        td.append(inp);
      } else if (c.k === 'qty') {
        td.className = '';
        td.append(numInput(line, 'qty', { maxlength: 12 }));
      } else if (c.k === 'uom') td.textContent = line.item ? line.item.uom || '' : '';
      else if (c.k === 'rate' || c.k === 'disc_pct' || CHARGE_KEYS.includes(c.k)) {
        td.className = '';
        td.append(numInput(line, c.k));
      } else if (c.k === 'gst_bp') {
        td.className = '';
        const sel = h('select', { class: 'ci', 'data-f': 'gst_bp', 'aria-label': c.label }, [[0, '0%'], [25, '0.25%'], [300, '3%'], [500, '5%'], [1200, '12%'], [1800, '18%'], [2800, '28%'], [4000, '40%']].map(([v, t]) => h('option', { value: String(v), text: t })));
        sel.value = String(line.gst_bp);
        sel.addEventListener('change', () => { line.gst_bp = Number(sel.value); recalc(); });
        td.append(sel);
      } else if (c.k === 'del') {
        td.className = 'del';
        td.append(h('button', { type: 'button', class: 'xbtn', title: 'Remove this line (Ctrl+Delete)', 'aria-label': 'Remove line', onclick: () => removeLine(line) }, '✕'));
      }
      tr.append(td);
    }
    const navs = () => [...tr.querySelectorAll('[data-nav]')].filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' && e.ctrlKey) { e.preventDefault(); removeLine(line); return; }
      if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.ctrlKey || e.altKey) return;
      const list = navs();
      if (e.target === list[list.length - 1] && S.lines[S.lines.length - 1] === line && line.item) {
        e.preventDefault();
        if (S.lines.length < MAX_LINES) {
          addLine(true);
        } else { toast(`A bill can have ${MAX_LINES} lines at most.`, 'warning'); I.remark1.focus(); }
      }
    });
    tr.addEventListener('focusin', () => {
      rowEls.forEach((r) => r.classList.toggle('cur', r === tr));
      lastLine.textContent = line.last || '';
    });
    return tr;
  }

  function buildHead() {
    thead.replaceChildren(h('tr', null, cols.map((c) => h('th', { class: c.num ? 'num' : '', text: c.label }))));
    tfoot.replaceChildren(h('tr', { class: 'foot' }, cols.map((c) => h('td', { 'data-k': c.k, 'data-label': ['qty', 'gross', 'cgst', 'sgst', 'igst', 'net'].includes(c.k) ? c.label : '' }, c.k === 'name' ? 'Total' : ''))));
  }

  function rebuild() {
    cols = columns();
    buildHead();
    rowEls.length = 0;
    tbody.replaceChildren(...S.lines.map((l, i) => { const tr = buildRow(l, i); rowEls.push(tr); return tr; }));
    recalc();
  }

  function addLine(focus) {
    const l = emptyLine();
    S.lines.push(l);
    const tr = buildRow(l, S.lines.length - 1);
    rowEls.push(tr);
    tbody.append(tr);
    recalc();
    if (focus) { const inp = tr.querySelector('[data-f="item"]'); if (inp) inp.focus(); }
    return l;
  }

  function removeLine(line) {
    const i = S.lines.indexOf(line);
    if (i < 0) return;
    if (S.lines.length === 1) { S.lines[0] = emptyLine(); rebuild(); const f = rowEls[0].querySelector('[data-f="item"]'); if (f) f.focus(); return; }
    S.lines.splice(i, 1);
    rebuild();
    const f = (rowEls[Math.min(i, rowEls.length - 1)] || rowEls[0]).querySelector('[data-f="item"]');
    if (f) f.focus();
  }

  // ---------------- party and type ----------------
  function setParty(c) {
    S.client = c;
    I.gstin.value = (c && c.gstin) || '';
    I.reg.value = c ? c.reg_type || (c.gstin ? 'Register-Regular' : 'Unregister-Enduser') : '';
    I.city.value = (c && c.city) || '';
    I.state.value = c && c.state_code ? c.state_code : '';
    I.addr.value = (c && c.address) || '';
    if (c && c.state_code) {
      I.state.value = `${c.state_code}`;
      const want = c.state_code === firmState ? 'GST' : 'IGST';
      if (S.inv_type !== want) { S.inv_type = want; I.inv_type.value = want; rebuild(); }
    }
    checkType();
  }
  function checkType() {
    const sc = S.client && S.client.state_code;
    if (!sc) { warn.textContent = ''; return; }
    const want = sc === firmState ? 'GST' : 'IGST';
    warn.textContent = want === S.inv_type ? '' : "Tax type doesn't match the party's state.";
  }
  I.inv_type.addEventListener('change', () => { S.inv_type = I.inv_type.value; checkType(); rebuild(); });
  I.reverse_charge.addEventListener('change', () => { S.reverse_charge = Number(I.reverse_charge.value); });
  I.bill_date.addEventListener('input', () => { wd.textContent = weekday(I.bill_date.value); });
  I.vehicle_no.addEventListener('input', () => { I.vehicle_no.value = I.vehicle_no.value.toUpperCase(); });

  let prevTr = 1;
  I.transporter.addEventListener('focus', () => { prevTr = I.transporter.value; });
  I.transporter.addEventListener('change', async () => {
    if (I.transporter.value !== '__new') { prevTr = I.transporter.value; return; }
    const name = await askName('Add Transporter', 'Transporter Name');
    if (!name) { I.transporter.value = prevTr; return; }
    try {
      const t = (await api('POST', '/api/transporters', { name })).transporter;
      transporters.push(t);
      fillTransporters();
      I.transporter.value = String(t.id);
      prevTr = String(t.id);
      toast('Transporter added', 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not add the transporter.', 'danger');
      I.transporter.value = prevTr;
    }
  });

  // bill number checks
  let noTimer = null;
  const origNo = saved ? String(saved.bill_no) : '';
  async function checkNo() {
    noNote.textContent = '';
    const v = I.bill_no.value.trim();
    if (!/^[0-9]{1,7}$/.test(v) || Number(v) < 1) { if (v) noNote.textContent = 'Enter a whole number, 1 or more.'; return; }
    if (v === origNo) return;
    try {
      const d = await api('GET', `/api/bills?fy=${billFy}&q=${v}&status=all&from=${fyStart(billFy)}&to=${fyEnd(billFy)}`);
      if (d.rows.some((r) => String(r.bill_no) === v && (!saved || r.id !== saved.id))) { noNote.textContent = `Bill no. ${v} is already used.`; return; }
      const nx = (await api('GET', `/api/bills/next?fy=${billFy}`)).next;
      if (Number(v) > nx) noNote.textContent = `This leaves a gap: the next free number is ${nx}.`;
    } catch { /* the server checks again when saving */ }
  }
  I.bill_no.addEventListener('input', () => { I.bill_no.value = I.bill_no.value.replace(/\D/g, ''); clearTimeout(noTimer); noTimer = setTimeout(checkNo, 400); });

  // ---------------- fill from saved bill ----------------
  fillTransporters(saved && saved.transporter_id ? { id: saved.transporter_id, name: saved.transporter_name } : null);
  if (saved) {
    I.bill_no.value = String(saved.bill_no);
    I.bill_date.value = saved.bill_date;
    S.inv_type = saved.inv_type;
    I.inv_type.value = saved.inv_type;
    I.reverse_charge.value = String(saved.reverse_charge ? 1 : 0);
    S.reverse_charge = saved.reverse_charge ? 1 : 0;
    I.transporter.value = String(saved.transporter_id || 1);
    for (const k of ['lr_no', 'vehicle_no', 'x1', 'x2', 'x3', 'x4', 'remark1', 'remark2', 'remark3']) I[k].value = saved[k] || '';
    I.lr_date.value = saved.lr_date || '';
    I.po_date.value = saved.po_date || '';
    S.client = { id: saved.client_id, name: saved.party_name, gstin: saved.party_gstin, reg_type: saved.party_reg_type, city: saved.party_city, state_code: saved.party_state_code, address: saved.party_address };
    const pi = partyBox.el.querySelector('input');
    pi.value = saved.party_name;
    partyBox.set(S.client);
    I.gstin.value = saved.party_gstin || '';
    I.reg.value = saved.party_reg_type || '';
    I.city.value = saved.party_city || '';
    I.state.value = saved.party_state_code || '';
    I.addr.value = saved.party_address || '';
    S.lines = saved.lines.map((ln) => {
      const l = emptyLine();
      l.item = { id: ln.item_id, name: ln.item_name, uom: ln.uom, code: ln.hsn, gst_bp: ln.gst_bp, qty_decimals: 3, desc_required: 0 };
      l.description = ln.description || '';
      l.hsn = ln.hsn || '';
      l.qty = fromScaled(ln.qty_milli, 3, 0);
      l.rate = fromScaled(ln.rate_milli, 3, 2);
      l.rateTouched = true;
      l.disc_pct = ln.disc_bp ? fromScaled(ln.disc_bp, 2, 0) : '';
      for (const k of CHARGE_KEYS) l[k] = ln[`${k}_paise`] ? fromScaled(ln[`${k}_paise`], 2, 2) : '';
      l.gst_bp = ln.gst_bp;
      return l;
    });
  } else {
    I.bill_no.value = nextNo;
    I.bill_date.value = defaultBillDate(billFy);
    I.transporter.value = '1';
    S.lines = [emptyLine()];
  }
  wd.textContent = weekday(I.bill_date.value);
  rebuild();

  // ---------------- collect, save ----------------
  function payload() {
    const lines = S.lines.filter((l) => l.item || String(l.qty).trim()).map((l) => {
      const o = { item_id: l.item ? l.item.id : null, description: l.description, hsn: l.hsn, qty: l.qty, rate: l.rate, gst_bp: l.gst_bp };
      if (on('sw_disc')) o.disc_pct = l.disc_pct;
      for (const k of CHARGE_KEYS) if (on(`sw_${k}`)) o[k] = l[k];
      return o;
    });
    const body = {
      fy: billFy, bill_no: I.bill_no.value.trim(), bill_date: I.bill_date.value, inv_type: S.inv_type, client_id: S.client ? S.client.id : null,
      bill_kind: jobwork ? 'jobwork' : 'sale', reverse_charge: S.reverse_charge, transporter_id: Number(I.transporter.value) || 1, lr_no: I.lr_no.value, lr_date: I.lr_date.value,
      vehicle_no: I.vehicle_no.value, po_date: I.po_date.value, remark1: I.remark1.value, remark2: I.remark2.value, remark3: I.remark3.value, lines,
    };
    for (let i = 1; i <= 4; i++) body[`x${i}`] = I[`x${i}`].value;
    if (isNew && body.bill_no === nextNo && !noteTouched) body.bill_no = null;
    return body;
  }
  let noteTouched = false;
  I.bill_no.addEventListener('input', () => { noteTouched = true; });
  const snapshot = () => JSON.stringify([payload(), S.lines.map((l) => l.item && l.item.id)]);
  let baseline = null;

  function showErrors(fields) {
    for (const k of Object.keys(R)) R[k].setError && R[k].setError('');
    document.querySelectorAll('[aria-invalid="true"]').forEach((e) => e.removeAttribute('aria-invalid'));
    let first = null;
    const msgs = [];
    const mark = (el, msg) => { if (el) { el.setAttribute('aria-invalid', 'true'); if (!first) first = el; } if (msg) msgs.push(msg); };
    for (const [k, msg] of Object.entries(fields || {})) {
      if (k === 'client_id') { R.party.setError(msg); mark(partyBox.el.querySelector('input')); }
      else if (k === 'lines') msgs.push(msg);
      else if (k === 'lineErrors') {
        const used = S.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.item || String(l.qty).trim());
        for (const [idx, errs] of Object.entries(msg)) {
          const row = used[Number(idx)];
          if (!row) continue;
          const tr = rowEls[row.i];
          for (const [f, m] of Object.entries(errs)) {
            const key = f === 'item_id' ? 'item' : f;
            const el = tr && tr.querySelector(`[data-f="${key}"]`);
            mark(el, `Line ${row.i + 1}: ${m}`);
          }
        }
      } else if (R[k]) { R[k].setError(msg); mark(I[k]); }
      else msgs.push(msg);
    }
    if (msgs.length) toast(msgs[0], 'danger', 6000);
    if (first) first.focus();
  }

  let saving = false;
  async function save(mode) {
    if (saving || readOnly) return null;
    if (!S.client) { R.party.setError('Choose the party.'); partyBox.el.querySelector('input').focus(); return null; }
    if (!S.lines.some((l) => l.item)) { toast('Add at least one item.', 'warning'); const f = rowEls[0] && rowEls[0].querySelector('[data-f="item"]'); if (f) f.focus(); return null; }
    const bd = I.bill_date.value;
    if (bd && bd > new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)) {
      if (!(await confirmDialog({ title: 'Future date', message: 'This date is in the future. Save anyway?', confirmText: 'Save', cancelText: 'No' }))) return null;
    }
    saving = true;
    try {
      const res = saved ? await api('PUT', `/api/bills/${saved.id}`, payload()) : await api('POST', '/api/bills', payload());
      baseline = snapshot();
      toast(`Bill no. ${res.bill.bill_no} saved`, 'success');
      if (mode === 'print') {
        await printFlow([res.bill.id], cfg);
        ctx.navigate('#/sales');
      } else if (mode === 'preview' || mode === 'whatsapp') {
        if (saved) {
          saved = res.bill;
          saving = false;
          await act(mode, res.bill.id);
        } else {
          pendingAction = mode;
          ctx.navigate(`#/sales/${res.bill.id}`);
        }
      } else {
        ctx.navigate('#/sales');
      }
      return res.bill;
    } catch (e) {
      if (e instanceof ApiError && e.data && e.data.fields) showErrors(e.data.fields);
      else toast(e instanceof ApiError ? e.message : 'Could not save. Try again.', 'danger');
    }
    saving = false;
    return null;
  }

  function act(mode, billId) {
    return mode === 'preview' ? openPreview({ query: { ids: [billId] } }) : quickAction(mode, billId);
  }
  // Preview and WhatsApp: save first when something changed, then show or send the saved bill.
  async function previewOrShare(mode) {
    if (saved && (readOnly || snapshot() === baseline)) { await act(mode, saved.id); return; }
    await save(mode);
  }

  async function del() {
    if (!saved) return;
    const sure = await confirmDialog({ title: 'Delete Bill', message: `Are you sure? Bill no. ${saved.bill_no} will be deleted. The number stays empty. A full copy is kept in the Activity Log.`, confirmText: 'Yes, delete', cancelText: 'No', danger: true });
    if (!sure) return;
    try {
      await api('DELETE', `/api/bills/${saved.id}`);
      baseline = snapshot();
      toast('Bill deleted', 'success');
      ctx.navigate('#/sales');
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not delete the bill.', 'danger'); }
  }
  async function cancelBill() {
    if (!saved || saved.status === 'cancelled') return;
    const sure = await confirmDialog({ title: 'Cancel Bill', message: `Are you sure? Bill no. ${saved.bill_no} will be cancelled. The number stays, all amounts become zero.`, confirmText: 'Yes, cancel it', cancelText: 'No', danger: true });
    if (!sure) return;
    try {
      await api('POST', `/api/bills/${saved.id}/cancel`, {});
      baseline = snapshot();
      toast('Bill cancelled', 'success');
      ctx.navigate('#/sales');
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not cancel the bill.', 'danger'); }
  }

  const reset = () => ctx.reload();
  const buttons = h('div', { class: 'se-btns' },
    readOnly ? null : cbtn('Save', { hot: 'S', primary: true, onClick: () => save(false) }),
    readOnly ? null : cbtn('Save & Print', { hot: 'P', onClick: () => save('print') }),
    readOnly && !saved ? null : cbtn('Preview', { hot: 'v', onClick: () => previewOrShare('preview') }),
    readOnly && !saved ? null : cbtn('WhatsApp', { hot: 'W', onClick: () => previewOrShare('whatsapp') }),
    readOnly ? null : cbtn('Cancel', { hot: 'n', onClick: reset }),
    saved && !readOnly ? cbtn('Cancel Bill', { hot: 'l', onClick: cancelBill }) : null,
    saved ? cbtn('Delete', { hot: 'D', onClick: del }) : null,
    cbtn('Back', { hot: 'B', onClick: () => ctx.navigate('#/sales') }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));

  const notice = readOnly
    ? h('div', { class: 'se-warn', text: `This bill is cancelled${saved.cancel_reason ? ` (${saved.cancel_reason})` : ''}. It cannot be changed. The original net amount was ${money(saved.orig_net_paise || 0)}.` })
    : null;

  const head = h('div', { class: 'se-head' },
    h('div', null, R.party, R.gstin, R.reg, R.city, R.state, R.addr),
    h('div', null, R.book, R.dr, R.inv_type, R.bill_no, R.bill_date, R.transporter, R.lr_no, R.lr_date, R.vehicle_no),
    h('div', { class: 'se-extra' }, R.x1, R.x2, R.x3, R.x4, R.po_date, R.reverse_charge));
  const bottom = h('div', { class: 'se-bottom' }, h('div', null, R.remark1, R.remark2, R.remark3), netBox);
  const form = h('div', { class: 'sale-entry' }, notice, head, linesWrap, lastLine, bottom, buttons);
  wireEnter(form);
  const title = saved ? `${heading}  [${fyLabel(billFy)}]  Bill No. ${saved.bill_no}` : `${heading}  [${fyLabel(billFy)}]  New`;
  box.append(cwin({ title, onClose: () => ctx.navigate('#/sales'), className: 'wide' }, form).el);
  if (readOnly) {
    form.querySelectorAll('input, select, textarea, .xbtn').forEach((el) => { el.disabled = true; });
  }
  const off = wireHotkeys(box);
  baseline = snapshot();
  setTimeout(() => (!readOnly ? partyBox.el.querySelector('input').focus() : null), 0);
  if (pendingAction && saved) {
    const a = pendingAction;
    pendingAction = null;
    setTimeout(() => act(a, saved.id), 0);
  }
  return { destroy: off, canLeave: () => readOnly || snapshot() === baseline, back: () => '#/sales' };
}

function askName(title, label) {
  return new Promise((resolve) => {
    const input = cinput({ maxlength: 60 });
    const row = crow(label, input);
    let done = false;
    const finish = (v) => { if (!done) { done = true; s.close(); resolve(v); } };
    const ok = h('button', { type: 'button', class: 'btn btn-primary', text: 'Save' });
    const no = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    ok.addEventListener('click', () => { if (input.value.trim().length < 2) { row.setError('Enter the name.'); return; } finish(input.value); });
    no.addEventListener('click', () => finish(null));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } });
    const s = sheet({ title, body: row, footer: [no, ok], requestClose: () => { finish(null); return false; } });
  });
}
