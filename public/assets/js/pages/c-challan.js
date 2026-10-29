// Challan entry (Aeon layout): Delivery Challan (General), Jobwork Issue / Receive / Opening, and Proforma Invoice (Sales).
// Opens as #/dc/<kind>/new or #/dc/<kind>/<id>, and #/proforma/new or #/proforma/<id>.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast, confirmDialog, sheet } from '/assets/js/ui.js';
import { lineMaths, sumLines, fmtMoney, amountInWords, fyLabel } from '/assets/js/gst.js';
import { getFy, defaultBillDate, weekday, fyStart, fyEnd, ddmmyyyy } from '/assets/js/classic/fy.js';
import { cwin, cbtn, crow, cinput, combo, wireHotkeys } from '/assets/js/classic/cui.js';
import { wireEnter } from '/assets/js/classic/nav.js';
import { openClientSheet } from '/assets/js/forms/client-form.js';
import { openItemSheet } from '/assets/js/forms/item-form.js';
import { printFlow } from '/assets/js/print/flow.js';
import { openPreview } from '/assets/js/print/preview.js';
import { quickAction } from '/assets/js/print/service.js';
import { KINDS } from '/assets/js/pages/challan-kinds.js';

const MAX_LINES = 30;
let pendingAction = null;
const money = (p) => fmtMoney(p, true);

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

export default async function render(box, ctx, kindKey, id) {
  const K = KINDS[kindKey];
  const isNew = id === 'new';
  const tax = K.tax;
  const proforma = K.kind === 'proforma';
  const receive = K.kind === 'jw_receive';
  const opening = K.kind === 'jw_opening';
  const cfg = ctx.settings() || {};
  const on = (k) => cfg[k] === '1';
  const firmState = (ctx.me && ctx.me.firm && ctx.me.firm.state_code) || '24';
  const lblX = [cfg.lbl_x1 || 'PO NO 1', cfg.lbl_x2 || 'SUPPLIER CODE', cfg.lbl_x3 || 'PO NO 2', cfg.lbl_x4 || 'PO NO 3'];
  const back = K.route;
  const Cap = K.single[0].toUpperCase() + K.single.slice(1);

  let saved = null;
  if (!isNew) {
    try {
      saved = (await api('GET', `/api/challans/${encodeURIComponent(id)}`)).challan;
      if (saved.kind !== K.kind) throw new ApiError('wrong', 404);
    } catch (e) {
      box.append(cwin({ title: K.title, onClose: () => ctx.navigate(back) }, h('p', { text: e instanceof ApiError && e.status === 404 ? `This ${K.single} was not found. It may have been deleted.` : `Could not load this ${K.single}.` }), cbtn('Back', { onClick: () => ctx.navigate(back) })).el);
      return {};
    }
  }
  const fy = saved ? saved.fy : getFy();
  const readOnly = !!saved && saved.status === 'cancelled';

  let transporters = [];
  try { transporters = (await api('GET', '/api/transporters?show=active')).rows; } catch { transporters = []; }
  let nextNo = '';
  if (isNew && K.auto) {
    try { nextNo = String((await api('GET', `/api/challans/next?kind=${K.kind}&fy=${fy}`)).next || ''); } catch { nextNo = ''; }
  }

  const S = { client: null, inv_type: 'GST', reverse_charge: 0, lines: [], pending: [] };
  const emptyLine = () => ({ item: null, description: '', hsn: '', qty: '', rate: '', gst_bp: 1800, rateTouched: false, against: '' });

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
    onAdd: async (text) => (await openClientSheet({ prefillName: text })) || null,
    onPick: (c) => setParty(c),
    minWidth: 340,
  });
  R.party = crow('Party Name', partyBox.el);
  ro('gstin', 'GSTIN'); I.gstin.classList.add('gstin');
  ro('city', 'City'); ro('state', 'State');
  const addr = h('textarea', { class: 'ci ro', rows: 3, readonly: true, tabindex: '-1' });
  I.addr = addr;
  R.addr = crow('Address', addr);

  const book = cinput({ value: K.title, readonly: true, tabindex: '-1', class: 'ci ro' });
  R.book = crow('Challan Book', book);
  I.inv_type = h('select', { class: 'ci', 'data-nav': '' }, h('option', { value: 'GST', text: 'GST (CGST + SGST)' }), h('option', { value: 'IGST', text: 'IGST' }));
  const warn = h('div', { class: 'se-warn' });
  R.inv_type = crow('Invoice Type', h('span', { class: 'cinline' }, I.inv_type));
  R.inv_type.querySelector('.cc').append(warn);
  I.no_text = cinput({ maxlength: 20, 'data-nav': '', class: 'ci' });
  const noNote = h('div', { class: 'se-warn' });
  R.no_text = crow(K.noLabel, I.no_text);
  R.no_text.querySelector('.cc').append(noNote);
  const dateKey = opening ? 'orig_date' : 'challan_date';
  I[dateKey] = h('input', { class: 'ci', type: 'date', 'data-nav': '', 'aria-label': opening ? 'Original challan date' : 'Date' });
  if (opening) I[dateKey].max = new Date(Date.parse(`${fyStart(fy)}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  else { I[dateKey].min = fyStart(fy); I[dateKey].max = fyEnd(fy); }
  const wd = h('span', { class: 'wd' });
  R[dateKey] = crow(opening ? 'Original Challan Date' : 'Date', h('span', { class: 'cinline' }, I[dateKey], wd));
  I.transporter = h('select', { class: 'ci', 'data-nav': '' });
  R.transporter = crow('Transporter', I.transporter);
  txt('lr_no', 'LR/RR No.', { max: 30 });
  I.lr_date = h('input', { class: 'ci', type: 'date', 'data-nav': '', 'aria-label': 'LR date' });
  R.lr_date = crow('LR/RR Date', I.lr_date);
  txt('vehicle_no', 'Vehicle No.', { max: 20, upper: true });
  if (proforma) {
    for (let i = 1; i <= 4; i++) txt(`x${i}`, lblX[i - 1], { max: 60 });
    I.po_date = h('input', { class: 'ci', type: 'date', 'data-nav': '', 'aria-label': cfg.lbl_po_date || 'PO DATE' });
    R.po_date = crow(cfg.lbl_po_date || 'PO DATE', I.po_date);
    I.reverse_charge = h('select', { class: 'ci', 'data-nav': '' }, h('option', { value: '0', text: 'No' }), h('option', { value: '1', text: 'Yes' }));
    R.reverse_charge = crow('Reverse Charge', I.reverse_charge);
  }
  const fillTransporters = (selected) => {
    const opts = [h('option', { value: '', text: '— none —' }), ...transporters.map((t) => h('option', { value: String(t.id), text: t.name }))];
    if (selected && !transporters.some((t) => t.id === selected.id)) opts.push(h('option', { value: String(selected.id), text: selected.name }));
    opts.push(h('option', { value: '__new', text: '+ Add new transporter…' }));
    I.transporter.replaceChildren(...opts);
  };

  // remarks (up to 4 lines)
  for (let i = 1; i <= 4; i++) txt(`remark${i}`, i === 1 ? 'Remarks' : ' ', { max: 100 });
  const netBig = h('div', { class: 'big', text: '0.00' });
  const words = h('div', { class: 'words' });
  const netBox = h('div', { class: 'se-net' }, h('div', { class: 'lab', text: tax ? 'Net Amount' : 'Amount' }), netBig, words);

  // lines
  const thead = h('thead');
  const tbody = h('tbody');
  const tfoot = h('tfoot');
  const linesWrap = h('div', { class: 'se-lines' }, h('table', null, thead, tbody, tfoot));
  const rowEls = [];

  function columns() {
    const c = [{ k: 'sr', label: '#', ro: true }, { k: 'name', label: 'Goods / Service' }, { k: 'hsn', label: 'HSN/SAC' }, { k: 'qty', label: 'Qty', num: true }, { k: 'uom', label: 'Unit', ro: true }, { k: 'rate', label: 'Rate', num: true }];
    if (receive) c.push({ k: 'against', label: 'Against DC' });
    c.push({ k: 'gross', label: tax ? 'Gross' : 'Amount', num: true, ro: true });
    if (tax) {
      c.push({ k: 'gst_bp', label: S.inv_type === 'IGST' ? 'IGST %' : 'GST %' });
      if (S.inv_type === 'IGST') c.push({ k: 'igst', label: 'IGST', num: true, ro: true });
      else { c.push({ k: 'cgst', label: 'CGST', num: true, ro: true }); c.push({ k: 'sgst', label: 'SGST', num: true, ro: true }); }
      c.push({ k: 'net', label: 'Net', num: true, ro: true });
    }
    c.push({ k: 'del', label: '' });
    return c;
  }
  let cols = columns();

  function calc(l) {
    if (!l.item) return null;
    const q = scaled(l.qty, 3);
    if (q.error || q.empty || q.n <= 0) return null;
    const r = scaled(l.rate, 3);
    return { ...lineMaths({ qty_milli: q.n, rate_milli: r.n || 0, disc_bp: 0 }, tax ? S.inv_type : 'IGST', tax ? l.gst_bp : 0), qty_milli: q.n };
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
    fcell('igst', money(t.igst_paise)); fcell('cgst', money(t.cgst_paise)); fcell('sgst', money(t.sgst_paise)); fcell('net', money(t.net_paise));
    const shown = tax ? t.net_paise : t.taxable_paise;
    netBig.textContent = money(shown);
    words.textContent = shown > 0 ? amountInWords(shown) : '';
  }

  const itemCombo = (line) => combo({
    placeholder: 'Type to search goods', value: line.item,
    search: async (q) => (await api('GET', `/api/items?show=active&limit=20${q ? `&q=${encodeURIComponent(q)}` : ''}`)).rows,
    label: (it) => it.name,
    render: (it) => h('span', null, it.name, h('small', { text: `  ${it.code || ''} ${it.uom || ''}` })),
    onAdd: async (text) => (await openItemSheet({ prefillName: text })) || null,
    onPick: (it) => pickItem(line, it),
    minWidth: 340, cls: 'ci',
  });

  function pickItem(line, it) {
    line.item = it;
    line.hsn = it.code || '';
    line.gst_bp = it.gst_bp ?? 1800;
    if (!line.description && it.description) line.description = it.description;
    if (!line.rateTouched) line.rate = it.rate_paise != null ? fromScaled(it.rate_paise, 2, 2) : '';
    syncRow(S.lines.indexOf(line));
    recalc();
  }
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
    fillAgainst(i);
  }
  // "Against DC": the party's open issue challans that still have this item out
  function fillAgainst(i) {
    const tr = rowEls[i];
    const line = S.lines[i];
    const sel = tr && tr.querySelector('[data-f="against"]');
    if (!sel) return;
    const opts = [h('option', { value: '', text: '— oldest first —' })];
    const have = new Set();
    for (const c of S.pending) {
      const ln = line.item ? c.lines.find((x) => x.item_id === line.item.id) : null;
      if (!ln) continue;
      have.add(String(c.id));
      opts.push(h('option', { value: String(c.id), text: `${c.no_text}  (${ddmmyyyy(c.challan_date)}, ${fromScaled(ln.balance_milli, 3, 0)} out)` }));
    }
    if (line.against && !have.has(String(line.against))) opts.push(h('option', { value: String(line.against), text: `DC id ${line.against}` }));
    sel.replaceChildren(...opts);
    sel.value = line.against ? String(line.against) : '';
  }
  async function loadPending() {
    S.pending = [];
    if (receive && S.client) {
      try { S.pending = (await api('GET', `/api/challans/pending-for?client_id=${S.client.id}`)).challans; } catch { S.pending = []; }
    }
    S.lines.forEach((_, i) => fillAgainst(i));
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
      } else if (c.k === 'qty') { td.className = ''; td.append(numInput(line, 'qty', { maxlength: 12 })); }
      else if (c.k === 'uom') td.textContent = line.item ? line.item.uom || '' : '';
      else if (c.k === 'rate') { td.className = ''; td.append(numInput(line, 'rate')); }
      else if (c.k === 'against') {
        td.className = '';
        const sel = h('select', { class: 'ci', 'data-nav': '', 'data-f': 'against', 'aria-label': 'Against DC' });
        sel.addEventListener('change', () => { line.against = sel.value; });
        td.append(sel);
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
        if (S.lines.length < MAX_LINES) addLine(true);
        else { toast(`A ${K.single} can have ${MAX_LINES} lines at most.`, 'warning'); I.remark1.focus(); }
      }
    });
    tr.addEventListener('focusin', () => rowEls.forEach((r) => r.classList.toggle('cur', r === tr)));
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
    S.lines.forEach((_, i) => fillAgainst(i));
    recalc();
  }
  function addLine(focus) {
    const l = emptyLine();
    S.lines.push(l);
    const tr = buildRow(l, S.lines.length - 1);
    rowEls.push(tr);
    tbody.append(tr);
    fillAgainst(S.lines.length - 1);
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

  // party and type
  function checkType() {
    const sc = S.client && S.client.state_code;
    if (!tax || !sc) { warn.textContent = ''; return; }
    const want = sc === firmState ? 'GST' : 'IGST';
    warn.textContent = want === S.inv_type ? '' : "Tax type doesn't match the party's state.";
  }
  function setParty(c) {
    S.client = c;
    I.gstin.value = (c && c.gstin) || '';
    I.city.value = (c && c.city) || '';
    I.state.value = c && c.state_code ? c.state_code : '';
    I.addr.value = (c && c.address) || '';
    if (tax && c && c.state_code) {
      const want = c.state_code === firmState ? 'GST' : 'IGST';
      if (S.inv_type !== want) { S.inv_type = want; I.inv_type.value = want; rebuild(); }
    }
    checkType();
    loadPending();
  }
  I.inv_type.addEventListener('change', () => { S.inv_type = I.inv_type.value; checkType(); rebuild(); });
  if (proforma) I.reverse_charge.addEventListener('change', () => { S.reverse_charge = Number(I.reverse_charge.value); });
  I[dateKey].addEventListener('input', () => { wd.textContent = weekday(I[dateKey].value); });
  I.vehicle_no.addEventListener('input', () => { I.vehicle_no.value = I.vehicle_no.value.toUpperCase(); });
  let prevTr = '';
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

  // number check
  let noTimer = null;
  const origNo = saved ? String(saved.no_text) : '';
  async function checkNo() {
    noNote.textContent = '';
    const v = I.no_text.value.trim();
    if (!v || v === origNo) return;
    try {
      const d = await api('GET', `/api/challans?kind=${K.kind}&fy=${fy}&q=${encodeURIComponent(v)}&status=all&from=${fyStart(fy)}&to=${fyEnd(fy)}`);
      if (d.rows.some((r) => r.no_text === v && (!saved || r.id !== saved.id)) && K.kind !== 'jw_receive') noNote.textContent = `Number ${v} is already used.`;
    } catch { /* the server checks again when saving */ }
  }
  I.no_text.addEventListener('input', () => { clearTimeout(noTimer); noTimer = setTimeout(checkNo, 400); });

  // fill
  fillTransporters(saved && saved.transporter_id ? { id: saved.transporter_id, name: saved.transporter_name } : null);
  if (saved) {
    I.no_text.value = saved.no_text || '';
    I[dateKey].value = (opening ? saved.orig_date : saved.challan_date) || '';
    if (tax) { S.inv_type = saved.inv_type || 'GST'; I.inv_type.value = S.inv_type; }
    I.transporter.value = saved.transporter_id ? String(saved.transporter_id) : '';
    I.lr_no.value = saved.lr_no || ''; I.vehicle_no.value = saved.vehicle_no || ''; I.lr_date.value = saved.lr_date || '';
    if (proforma) {
      for (const k of ['x1', 'x2', 'x3', 'x4']) I[k].value = saved[k] || '';
      I.po_date.value = saved.po_date || '';
      S.reverse_charge = saved.reverse_charge ? 1 : 0;
      I.reverse_charge.value = String(S.reverse_charge);
    }
    const rl = String(saved.remark || '').split('\n');
    for (let i = 0; i < 4; i++) I[`remark${i + 1}`].value = rl[i] || '';
    S.client = { id: saved.client_id, name: saved.party_name, gstin: saved.party_gstin, city: saved.party_city, state_code: saved.party_state_code, address: saved.party_address };
    partyBox.el.querySelector('input').value = saved.party_name;
    partyBox.set(S.client);
    I.gstin.value = saved.party_gstin || ''; I.city.value = saved.party_city || ''; I.state.value = saved.party_state_code || ''; I.addr.value = saved.party_address || '';
    S.lines = saved.lines.map((ln) => {
      const l = emptyLine();
      l.item = { id: ln.item_id, name: ln.item_name, uom: ln.uom, code: ln.hsn, gst_bp: ln.gst_bp, qty_decimals: 3, desc_required: 0 };
      l.description = ln.description || ''; l.hsn = ln.hsn || '';
      l.qty = fromScaled(ln.qty_milli, 3, 0); l.rate = fromScaled(ln.rate_milli, 3, 2); l.rateTouched = true;
      l.gst_bp = ln.gst_bp || 0; l.against = ln.against_id ? String(ln.against_id) : '';
      return l;
    });
  } else {
    I.no_text.value = nextNo;
    I[dateKey].value = opening ? '' : defaultBillDate(fy);
    I.transporter.value = '';
    S.lines = [emptyLine()];
  }
  wd.textContent = weekday(I[dateKey].value);
  rebuild();
  if (receive && S.client) loadPending();

  function payload() {
    const lines = S.lines.filter((l) => l.item || String(l.qty).trim()).map((l) => {
      const o = { item_id: l.item ? l.item.id : null, description: l.description, hsn: l.hsn, qty: l.qty, rate: l.rate };
      if (tax) o.gst_bp = l.gst_bp;
      if (receive && l.against) o.against_id = Number(l.against);
      return o;
    });
    const body = {
      fy, kind: K.kind, no_text: I.no_text.value.trim(), inv_type: tax ? S.inv_type : null, client_id: S.client ? S.client.id : null,
      transporter_id: I.transporter.value && I.transporter.value !== '__new' ? Number(I.transporter.value) : null,
      lr_no: I.lr_no.value, lr_date: I.lr_date.value, vehicle_no: I.vehicle_no.value,
      remark: [1, 2, 3, 4].map((i) => I[`remark${i}`].value.trim()).filter(Boolean).join('\n'), lines,
    };
    body[dateKey] = I[dateKey].value;
    if (proforma) { for (let i = 1; i <= 4; i++) body[`x${i}`] = I[`x${i}`].value; body.po_date = I.po_date.value; body.reverse_charge = S.reverse_charge; }
    if (isNew && K.auto && body.no_text === nextNo && !noTouched) body.no_text = '';
    return body;
  }
  let noTouched = false;
  I.no_text.addEventListener('input', () => { noTouched = true; });
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
      else if (k === 'remark') { R.remark1.setError(msg); mark(I.remark1); }
      else if (k === 'lineErrors') {
        const used = S.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.item || String(l.qty).trim());
        for (const [idx, errs] of Object.entries(msg)) {
          const row = used[Number(idx)];
          if (!row) continue;
          const tr = rowEls[row.i];
          for (const [f, m] of Object.entries(errs)) {
            const el = tr && tr.querySelector(`[data-f="${f === 'item_id' ? 'item' : f === 'against_id' ? 'against' : f}"]`);
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
    const d = I[dateKey].value;
    if (!opening && d && d > new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)) {
      if (!(await confirmDialog({ title: 'Future date', message: 'This date is in the future. Save anyway?', confirmText: 'Save', cancelText: 'No' }))) return null;
    }
    saving = true;
    try {
      const res = saved ? await api('PUT', `/api/challans/${saved.id}`, payload()) : await api('POST', '/api/challans', payload());
      baseline = snapshot();
      toast(`${Cap} no. ${res.challan.no_text} saved`, 'success');
      if (mode === 'print') {
        await printFlow([res.challan.id], cfg, 'challan');
        ctx.navigate(back);
      } else if (mode === 'preview' || mode === 'whatsapp') {
        if (saved) { saved = res.challan; saving = false; await act(mode, res.challan.id); }
        else { pendingAction = mode; ctx.navigate(`${back}/${res.challan.id}`); }
      } else ctx.navigate(back);
      return res.challan;
    } catch (e) {
      if (e instanceof ApiError && e.data && e.data.fields) showErrors(e.data.fields);
      else toast(e instanceof ApiError ? e.message : 'Could not save. Try again.', 'danger');
    }
    saving = false;
    return null;
  }
  const act = (mode, cid) => (mode === 'preview' ? openPreview({ query: { ids: [cid], doc: 'challan' } }) : quickAction(mode, cid, 'challan'));
  async function previewOrShare(mode) {
    if (saved && (readOnly || snapshot() === baseline)) { await act(mode, saved.id); return; }
    await save(mode);
  }
  async function del() {
    if (!saved) return;
    const sure = await confirmDialog({ title: `Delete ${Cap}`, message: `Are you sure? ${Cap} no. ${saved.no_text} will be deleted. A full copy is kept in the Activity Log.`, confirmText: 'Yes, delete', cancelText: 'No', danger: true });
    if (!sure) return;
    try {
      await api('DELETE', `/api/challans/${saved.id}`);
      baseline = snapshot();
      toast(`${Cap} deleted`, 'success');
      ctx.navigate(back);
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not delete.', 'danger'); }
  }
  async function cancelIt() {
    if (!saved || saved.status === 'cancelled') return;
    const sure = await confirmDialog({ title: `Cancel ${Cap}`, message: `Are you sure? ${Cap} no. ${saved.no_text} will be cancelled. The number stays, all amounts become zero.`, confirmText: 'Yes, cancel it', cancelText: 'No', danger: true });
    if (!sure) return;
    try {
      await api('POST', `/api/challans/${saved.id}/cancel`, {});
      baseline = snapshot();
      toast(`${Cap} cancelled`, 'success');
      ctx.navigate(back);
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not cancel.', 'danger'); }
  }

  const buttons = h('div', { class: 'se-btns' },
    readOnly ? null : cbtn('Save', { hot: 'S', primary: true, onClick: () => save(false) }),
    readOnly ? null : cbtn('Save & Print', { hot: 'P', onClick: () => save('print') }),
    readOnly && !saved ? null : cbtn('Preview', { hot: 'v', onClick: () => previewOrShare('preview') }),
    readOnly && !saved ? null : cbtn('WhatsApp', { hot: 'W', onClick: () => previewOrShare('whatsapp') }),
    readOnly ? null : cbtn('Cancel', { hot: 'n', onClick: () => ctx.reload() }),
    saved && !readOnly ? cbtn(`Cancel ${K.cap}`, { hot: 'l', onClick: cancelIt }) : null,
    saved ? cbtn('Delete', { hot: 'D', onClick: del }) : null,
    cbtn('Back', { hot: 'B', onClick: () => ctx.navigate(back) }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));
  const notice = readOnly ? h('div', { class: 'se-warn', text: `This ${K.single} is cancelled${saved.cancel_reason ? ` (${saved.cancel_reason})` : ''}. It cannot be changed.` }) : null;

  const mid = [R.book];
  if (tax) mid.push(R.inv_type);
  mid.push(R.no_text, R[dateKey], R.transporter, R.lr_no, R.lr_date, R.vehicle_no);
  const head = h('div', { class: 'se-head' },
    h('div', null, R.party, R.gstin, R.city, R.state, R.addr),
    h('div', null, ...mid),
    proforma ? h('div', { class: 'se-extra' }, R.x1, R.x2, R.x3, R.x4, R.po_date, R.reverse_charge) : null);
  const bottom = h('div', { class: 'se-bottom' }, h('div', null, R.remark1, R.remark2, R.remark3, R.remark4), netBox);
  const form = h('div', { class: 'sale-entry' }, notice, head, linesWrap, bottom, buttons);
  wireEnter(form);
  box.append(cwin({ title: `${K.title}  [${fyLabel(fy)}]  ${saved ? `No. ${saved.no_text}` : 'New'}`, onClose: () => ctx.navigate(back), className: 'wide' }, form).el);
  if (readOnly) form.querySelectorAll('input, select, textarea, .xbtn').forEach((el) => { el.disabled = true; });
  const off = wireHotkeys(box);
  baseline = snapshot();
  setTimeout(() => (!readOnly ? partyBox.el.querySelector('input').focus() : null), 0);
  if (pendingAction && saved) {
    const a = pendingAction;
    pendingAction = null;
    setTimeout(() => act(a, saved.id), 0);
  }
  return { destroy: off, canLeave: () => readOnly || snapshot() === baseline, back: () => back };
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
