// Settings > Import from Aeon: bring in a client list or item list from an Excel / CSV file.
// The file is read on this device. Only cleaned rows are sent to the server, 40 at a time.
// Nothing is saved until the person taps Import on the preview step.

import { api, ApiError } from '/assets/js/api.js';
import { h, icon, toast, badge, chips, setButtonLoading, field } from '/assets/js/ui.js';
import { parseState, tenDigits, nameKey } from '/assets/js/rules.js';
import { isValidGstin, isValidPan, isValidPincode, isValidEmail } from '/assets/js/gstin.js';

const CHUNK = 40;
const MAX_FILE = 5 * 1024 * 1024;

const FIELDS = {
  clients: [
    { key: 'name', label: 'Client name', required: true, aliases: ['Account Name', 'Party Name', 'Name', 'Ledger Name', 'Customer', 'Client Name'] },
    { key: 'address1', label: 'Address 1', aliases: ['Address', 'Address1', 'Address 1', 'Add1'] },
    { key: 'address2', label: 'Address 2', aliases: ['Address2', 'Address 2', 'Add2'] },
    { key: 'address3', label: 'Address 3', aliases: ['Address3', 'Address 3', 'Add3'] },
    { key: 'city', label: 'City', aliases: ['City', 'Station', 'Place'] },
    { key: 'pincode', label: 'Pincode', aliases: ['Pincode', 'Pin Code', 'PIN', 'Pin'] },
    { key: 'state', label: 'State', aliases: ['State', 'State Name', 'State Code'] },
    { key: 'gstin', label: 'GSTIN', aliases: ['GSTIN', 'GST No', 'GST Number', 'GSTIN No', 'GSTIN/UIN'] },
    { key: 'pan', label: 'PAN', aliases: ['PAN', 'PAN No', 'Income Tax No'] },
    { key: 'phone', label: 'Phone', aliases: ['Phone', 'Phone No', 'Tel', 'Telephone'] },
    { key: 'mobile', label: 'Mobile', aliases: ['Mobile', 'Mobile No', 'Cell'] },
    { key: 'email', label: 'Email', aliases: ['Email', 'E-mail', 'Email ID'] },
  ],
  items: [
    { key: 'name', label: 'Item name', required: true, aliases: ['Item Name', 'Service Name', 'Product', 'Product Name', 'Particulars', 'Name', 'Item'] },
    { key: 'code', label: 'HSN / SAC code', aliases: ['HSN', 'SAC', 'HSN Code', 'SAC Code', 'HSN/SAC', 'HSNCode', 'SACCode'] },
    { key: 'uom', label: 'Unit', aliases: ['Unit', 'UOM', 'Unit Name'] },
    { key: 'rate', label: 'Rate', aliases: ['Rate', 'Sale Rate', 'Sales Rate', 'MRP', 'Price'] },
    { key: 'gst', label: 'GST %', aliases: ['GST', 'GST %', 'GST Rate', 'Tax %', 'IGST %', 'Tax Rate'] },
    { key: 'description', label: 'Description', aliases: ['Description', 'Details', 'Narration'] },
  ],
};
const GROUP_ALIASES = ['Group', 'Group Name', 'Under', 'Account Group'];

const simple = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const cell = (v) => String(v ?? '').trim();
const colLetter = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

export default async function render(box, ctx) {
  ctx.setFab(false);
  const S = {
    type: null, fileName: '', wb: null, X: null, sheetName: '', aoa: [], headerRow: 0, headers: [],
    map: {}, groupCol: -1, groupValues: new Set(), mode: 'skip', rows: [], ignored: { blank: 0, group: 0 }, cursor: 0, results: [], busy: false,
  };
  const root = h('div', { class: 'stack' });
  let leaveGuard = false;

  const STEP_NAMES = ['Choose file', 'Sheet and header', 'Match columns', 'Preview', 'Import', 'Done'];
  function frame(step, ...content) {
    root.replaceChildren(
      h('div', { class: 'wizard-steps', 'aria-label': `Step ${step} of 6` }, STEP_NAMES.map((n, i) => h('div', { class: `ws${i + 1 === step ? ' on' : i + 1 < step ? ' done' : ''}` }, h('span', { class: 'n', text: String(i + 1) }), h('span', { class: 'l', text: n })))),
      ...content
    );
    window.scrollTo(0, 0);
  }
  const nav = (...btns) => h('div', { class: 'btns wiz-nav' }, btns);
  const btn = (label, fn, cls = 'btn-primary') => h('button', { type: 'button', class: `btn ${cls}`, onclick: fn, text: label });

  // ---------------------------------------------------------- step 1
  function step1() {
    leaveGuard = false;
    const input = h('input', { type: 'file', id: 'aeon-file', class: 'visually-hidden', accept: '.xlsx,.xls,.csv' });
    const msg = h('div', { class: 'err', role: 'alert' });
    const pick = (t, title, desc, ic) => {
      const b = h('button', { type: 'button', class: 'typecard', 'aria-pressed': String(S.type === t) }, h('div', { class: 'ico' }, icon(ic)), h('div', null, h('div', { class: 't', text: title }), h('div', { class: 'd', text: desc })));
      b.addEventListener('click', () => { S.type = t; for (const c of grid.children) c.setAttribute('aria-pressed', String(c === b)); });
      return b;
    };
    const grid = h('div', { class: 'typegrid' }, pick('clients', 'Clients', 'Your Aeon account or party list', 'clients'), pick('items', 'Items', 'Your Aeon item or service list', 'items'));
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      msg.textContent = '';
      if (!file) return;
      if (!S.type) { msg.textContent = 'First choose Clients or Items.'; return; }
      if (file.size > MAX_FILE) { msg.textContent = 'That file is bigger than 5 MB. Export a smaller list.'; return; }
      pickLabel.replaceChildren(h('span', { class: 'spinner' }), 'Reading the file');
      try {
        const mod = await import('/assets/vendor/xlsx.mjs');
        S.X = mod.default || mod;
        S.wb = S.X.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dense: true });
        S.fileName = file.name;
        if (!S.wb.SheetNames.length) throw new Error('empty');
        let best = S.wb.SheetNames[0];
        let bestRows = -1;
        for (const n of S.wb.SheetNames) {
          const ref = S.wb.Sheets[n]['!ref'];
          const rows = ref ? S.X.utils.decode_range(ref).e.r : 0;
          if (rows > bestRows) { best = n; bestRows = rows; }
        }
        S.sheetName = best;
        loadSheet();
        step2();
      } catch {
        pickLabel.replaceChildren(icon('upload'), 'Choose file');
        msg.textContent = 'That file could not be read. Save it as .xlsx or .csv and try again.';
      }
    });
    const pickLabel = h('label', { class: 'btn btn-primary', for: 'aeon-file' }, icon('upload'), 'Choose file');
    frame(
      1,
      h('div', { class: 'card stack' }, h('h2', { text: 'What do you want to bring in?' }), h('p', { class: 'hint', text: 'Export the list from Aeon to Excel first. Then pick the type and the file. Nothing is saved until the last step.' }), grid, input, h('div', null, pickLabel), h('div', { class: 'hint', text: '.xlsx, .xls or .csv, up to 5 MB.' }), msg)
    );
  }

  function loadSheet() {
    S.aoa = S.X.utils.sheet_to_json(S.wb.Sheets[S.sheetName], { header: 1, raw: false, defval: '', blankrows: true });
    S.headerRow = detectHeader();
    readHeaders();
  }

  function detectHeader() {
    const known = new Set(FIELDS[S.type].flatMap((f) => f.aliases).concat(S.type === 'clients' ? GROUP_ALIASES : []).map(simple));
    let best = 0;
    let bestScore = 0;
    for (let i = 0; i < Math.min(15, S.aoa.length); i++) {
      const score = (S.aoa[i] || []).filter((c) => known.has(simple(c))).length;
      if (score >= 2) return i;
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return best;
  }

  function readHeaders() {
    const row = S.aoa[S.headerRow] || [];
    const width = Math.max(row.length, ...S.aoa.slice(S.headerRow + 1, S.headerRow + 50).map((r) => r.length), 1);
    S.headers = Array.from({ length: width }, (_, i) => cell(row[i]) || `Column ${colLetter(i)}`);
    // match columns by name
    S.map = {};
    const used = new Set();
    for (const f of FIELDS[S.type]) {
      const wanted = new Set(f.aliases.map(simple));
      const idx = S.headers.findIndex((hd, i) => !used.has(i) && wanted.has(simple(hd)));
      S.map[f.key] = idx;
      if (idx >= 0) used.add(idx);
    }
    S.groupCol = -1;
    if (S.type === 'clients') {
      const g = new Set(GROUP_ALIASES.map(simple));
      const idx = S.headers.findIndex((hd, i) => !used.has(i) && g.has(simple(hd)));
      S.groupCol = idx;
      pickGroupValues();
    }
  }

  function groupValues() {
    const counts = new Map();
    if (S.groupCol < 0) return counts;
    for (let i = S.headerRow + 1; i < S.aoa.length; i++) {
      const v = cell((S.aoa[i] || [])[S.groupCol]);
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    return counts;
  }
  function pickGroupValues() {
    const counts = groupValues();
    const debtors = [...counts.keys()].filter((v) => /debtor/i.test(v));
    S.groupValues = new Set(debtors.length ? debtors : counts.keys());
  }

  // ---------------------------------------------------------- step 2
  function step2() {
    const sheetSel = h('select', { class: 'select', id: 'sheet-sel', 'aria-label': 'Sheet' }, S.wb.SheetNames.map((n) => h('option', { value: n, text: n })));
    sheetSel.value = S.sheetName;
    const headSel = h('select', { class: 'select', id: 'header-sel', 'aria-label': 'Header row' }, Array.from({ length: Math.min(15, Math.max(S.aoa.length, 1)) }, (_, i) => h('option', { value: String(i), text: `Row ${i + 1}` })));
    headSel.value = String(S.headerRow);
    const table = h('div', { class: 'tablewrap' });
    const paint = () => {
      const rows = S.aoa.slice(S.headerRow, S.headerRow + 6);
      table.replaceChildren(
        h('table', { class: 'preview-table nowrap' },
          h('thead', null, h('tr', null, S.headers.map((hd) => h('th', { text: hd })))),
          h('tbody', null, rows.slice(1).map((r) => h('tr', null, S.headers.map((_, i) => h('td', { text: cell(r[i]) })))))
        )
      );
    };
    sheetSel.addEventListener('change', () => { S.sheetName = sheetSel.value; loadSheet(); headSel.value = String(S.headerRow); paint(); });
    headSel.addEventListener('change', () => { S.headerRow = Number(headSel.value); readHeaders(); paint(); });
    paint();
    const dataRows = () => S.aoa.slice(S.headerRow + 1).filter((r) => r.some((c) => cell(c))).length;
    frame(
      2,
      h('div', { class: 'card stack' },
        h('h2', { text: 'Check the header row' }),
        h('p', { class: 'hint', text: `${S.fileName}. The first row of column names was found for you. Change it if it is wrong.` }),
        S.wb.SheetNames.length > 1 ? field('Sheet', sheetSel) : null,
        field('Header row (the row with the column names)', headSel),
        table),
      nav(btn('Back', step1, 'btn-secondary'), btn('Next', () => { if (!dataRows()) { toast('No data rows were found under that header.', 'danger'); return; } step3(); }))
    );
  }

  // ---------------------------------------------------------- step 3
  function step3() {
    const selects = {};
    const fieldEls = FIELDS[S.type].map((f) => {
      const sel = h('select', { class: 'select', id: `map-${f.key}`, 'aria-label': f.label }, h('option', { value: '-1', text: 'Not in file' }), S.headers.map((hd, i) => h('option', { value: String(i), text: hd })));
      sel.value = String(S.map[f.key]);
      sel.addEventListener('change', () => { S.map[f.key] = Number(sel.value); err.textContent = ''; });
      selects[f.key] = sel;
      return field(f.label, sel, { required: f.required });
    });
    const err = h('div', { class: 'err', role: 'alert' });

    let groupBox = null;
    if (S.type === 'clients') {
      const gSel = h('select', { class: 'select', id: 'map-group', 'aria-label': 'Group column' }, h('option', { value: '-1', text: 'No group column (use every row)' }), S.headers.map((hd, i) => h('option', { value: String(i), text: hd })));
      gSel.value = String(S.groupCol);
      const vals = h('div', { class: 'stack tight' });
      const paintVals = () => {
        vals.replaceChildren();
        if (S.groupCol < 0) return;
        const counts = [...groupValues().entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
        for (const [v, n] of counts) {
          const cb = h('input', { type: 'checkbox', id: `grp-${simple(v)}`, checked: S.groupValues.has(v) });
          cb.addEventListener('change', () => { if (cb.checked) S.groupValues.add(v); else S.groupValues.delete(v); });
          vals.append(h('label', { class: 'check', for: cb.id }, cb, h('span', { text: `${v} (${n})` })));
        }
      };
      gSel.addEventListener('change', () => { S.groupCol = Number(gSel.value); pickGroupValues(); paintVals(); });
      paintVals();
      groupBox = h('div', { class: 'card stack' }, h('h2', { text: 'Which accounts are clients?' }), h('p', { class: 'hint', text: 'An Aeon account list also holds banks, expenses and suppliers. Tick only the groups that are your clients, usually Sundry Debtors.' }), field('Group column', gSel), vals);
    }

    frame(
      3,
      h('div', { class: 'card stack' }, h('h2', { text: 'Match the columns' }), h('p', { class: 'hint', text: 'Each box shows which column of your file goes into that detail. Fix any that are wrong.' }), h('div', { class: 'form-grid' }, fieldEls), err),
      groupBox,
      nav(btn('Back', step2, 'btn-secondary'), btn('Preview', async () => {
        if (S.map.name < 0) { err.textContent = 'Choose the column that holds the name.'; selects.name.focus(); return; }
        if (S.type === 'clients' && S.groupCol >= 0 && S.groupValues.size === 0) { toast('Tick at least one group.', 'danger'); return; }
        await step4();
      }))
    );
  }

  // ---------------------------------------------------------- build rows
  function build() {
    const out = [];
    S.ignored = { blank: 0, group: 0 };
    const seen = new Map();
    for (let i = S.headerRow + 1; i < S.aoa.length; i++) {
      const r = S.aoa[i] || [];
      if (!r.some((c) => cell(c))) { continue; }
      const get = (k) => (S.map[k] >= 0 ? cell(r[S.map[k]]) : '');
      const name = get('name').replace(/\s+/g, ' ');
      if (!name) { S.ignored.blank++; continue; }
      if (S.type === 'clients' && S.groupCol >= 0 && !S.groupValues.has(cell(r[S.groupCol]))) { S.ignored.group++; continue; }
      const row = { fileRow: i + 1, name, payload: null, notes: [], status: 'pending', message: '' };
      row.payload = S.type === 'clients' ? clientPayload(get, row) : itemPayload(get, row);
      const key = S.type === 'clients' && row.payload.gstin && isValidGstin(row.payload.gstin) ? `g:${row.payload.gstin}` : `n:${nameKey(name)}`;
      if (seen.has(key)) { row.status = 'error'; row.message = `Appears twice in the file (row ${seen.get(key)}).`; } else seen.set(key, row.fileRow);
      out.push(row);
    }
    return out;
  }

  function clientPayload(get, row) {
    const p = { name: get('name').replace(/\s+/g, ' ').slice(0, 100) };
    const gstin = get('gstin').replace(/\s+/g, '').toUpperCase();
    if (gstin) p.gstin = gstin;
    const pan = get('pan').replace(/\s+/g, '').toUpperCase();
    if (pan) { if (isValidPan(pan)) p.pan = pan; else row.notes.push('PAN left out'); }
    p.state_code = gstin && isValidGstin(gstin) ? gstin.slice(0, 2) : parseState(get('state'));
    p.address = ['address1', 'address2', 'address3'].map(get).filter(Boolean).join('\n');
    p.city = get('city').slice(0, 40);
    const pin = get('pincode').replace(/\s+/g, '');
    if (pin) { if (isValidPincode(pin)) p.pincode = pin; else row.notes.push('pincode left out'); }
    let phone = get('phone').replace(/[^0-9+\- ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20).trim();
    if (phone && phone.replace(/[^0-9]/g, '').length < 5) phone = '';
    const mobileRaw = get('mobile');
    const mobile = mobileRaw ? tenDigits(mobileRaw) : '';
    if (mobileRaw && !mobile) {
      const asPhone = mobileRaw.replace(/[^0-9+\- ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!phone && asPhone.replace(/[^0-9]/g, '').length >= 5) phone = asPhone;
      else row.notes.push('mobile left out');
    }
    if (phone) p.phone = phone;
    if (mobile) p.mobile = mobile;
    const email = get('email').toLowerCase();
    if (email) { if (isValidEmail(email)) p.email = email; else row.notes.push('email left out'); }
    return p;
  }

  function itemPayload(get, row) {
    const p = { name: get('name').replace(/\s+/g, ' ').slice(0, 120) };
    const code = get('code').replace(/[^0-9]/g, '');
    if (code) p.code = code;
    const uom = get('uom').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8);
    if (uom) p.uom = uom;
    const rate = get('rate');
    if (rate) p.rate = rate;
    if (S.map.gst >= 0) {
      const g = get('gst').replace(/[%\s]/g, '');
      if (g === '') row.notes.push('GST taken as 18%');
      else if (!/^[0-9]+(\.[0-9]+)?$/.test(g)) { row.status = 'error'; row.message = 'Check GST %.'; } else p.gst_bp = Math.round(parseFloat(g) * 100);
    }
    const d = get('description').slice(0, 200);
    if (d) p.description = d;
    return p;
  }

  // ---------------------------------------------------------- step 4: preview
  async function step4() {
    S.rows = build();
    if (!S.rows.length) { toast('No rows were found with those settings.', 'danger'); return; }
    const bar = h('progress', { class: 'progress', max: '100', value: '0' });
    const label = h('div', { class: 'hint', text: 'Checking your list against what is already saved…' });
    frame(4, h('div', { class: 'card stack' }, h('h2', { text: 'Checking the file' }), bar, label));
    const todo = S.rows.filter((r) => r.status === 'pending');
    try {
      for (let i = 0; i < todo.length; i += CHUNK) {
        const part = todo.slice(i, i + CHUNK);
        const res = await api('POST', `/api/${S.type}/import`, { mode: 'skip', dryRun: true, rows: part.map((r) => r.payload) });
        res.results.forEach((x, k) => {
          const row = part[k];
          row.status = x.status === 'added' ? 'new' : x.status === 'skipped' ? 'saved' : 'error';
          row.message = x.message || '';
        });
        bar.value = Math.min(100, Math.round(((i + part.length) / todo.length) * 100));
        label.textContent = `Checked ${Math.min(i + part.length, todo.length)} of ${todo.length}`;
      }
    } catch (e) {
      frame(4, h('div', { class: 'card stack' }, h('h2', { text: 'Could not check the file' }), h('p', { class: 'hint', text: e instanceof ApiError ? e.message : 'Check your internet connection.' }), nav(btn('Back', step3, 'btn-secondary'), btn('Try again', step4))));
      return;
    }
    paintPreview();
  }

  function counts() {
    const c = { new: 0, saved: 0, error: 0 };
    for (const r of S.rows) c[r.status]++;
    return c;
  }

  function paintPreview() {
    const c = counts();
    leaveGuard = false;
    let filter = 'all';
    let q = '';
    let shown = 100;
    const list = h('div', { class: 'tablewrap' });
    const more = h('button', { type: 'button', class: 'btn btn-secondary', hidden: true, text: 'Show more' });
    const find = h('input', { class: 'input', type: 'search', placeholder: 'Search the preview', 'aria-label': 'Search the preview' });
    const statusChips = chips({ label: 'Show', options: [{ value: 'all', label: 'All' }, { value: 'new', label: `New ${c.new}` }, { value: 'saved', label: `Saved ${c.saved}` }, { value: 'error', label: `Problems ${c.error}` }], value: 'all', onChange: (v) => { filter = v; shown = 100; draw(); } });
    const badgeFor = (r) => (r.status === 'new' ? badge('New', 'good') : r.status === 'saved' ? badge('Already saved', 'muted') : badge('Problem', 'bad'));
    const second = (r) => (S.type === 'clients' ? [r.payload.gstin || '', r.payload.state_code || ''].filter(Boolean).join(' · ') : [r.payload.code || '', r.payload.rate ? `₹${r.payload.rate}` : ''].filter(Boolean).join(' · '));
    function draw() {
      const needle = nameKey(q);
      const rows = S.rows.filter((r) => (filter === 'all' || r.status === filter) && (!needle || nameKey(r.name).includes(needle) || String(second(r)).toLowerCase().includes(q.toLowerCase())));
      list.replaceChildren(
        h('table', { class: 'preview-table' },
          h('thead', null, h('tr', null, h('th', { text: 'Row' }), h('th', { text: 'Name' }), h('th', { text: S.type === 'clients' ? 'GSTIN · State' : 'Code · Rate' }), h('th', { text: 'Status' }))),
          h('tbody', null, rows.slice(0, shown).map((r) => h('tr', { class: r.status }, h('td', { text: String(r.fileRow) }), h('td', null, h('div', { text: r.name }), r.message || r.notes.length ? h('div', { class: 'det', text: r.message || `Note: ${r.notes.join(', ')}` }) : null), h('td', { text: second(r) }), h('td', null, badgeFor(r)))))
        )
      );
      if (!rows.length) list.append(h('p', { class: 'hint', text: 'Nothing matches.' }));
      more.hidden = rows.length <= shown;
    }
    more.addEventListener('click', () => { shown += 200; draw(); });
    find.addEventListener('input', () => { q = find.value.trim(); shown = 100; draw(); });
    draw();

    const modeChips = chips({ label: 'For rows already saved', options: [{ value: 'skip', label: 'Skip them' }, { value: 'update', label: "Update with the file's details" }], value: S.mode, onChange: (v) => { S.mode = v; summary(); } });
    const importBtn = btn('Import', startImport);
    const summaryEl = h('p', { class: 'summary' });
    const summary = () => {
      const n = c.new + (S.mode === 'update' ? c.saved : 0);
      summaryEl.textContent = `${c.new} new · ${c.saved} already saved · ${c.error} problems`;
      importBtn.textContent = n ? `Import ${n} ${S.type === 'clients' ? 'clients' : 'items'}` : 'Nothing to import';
      importBtn.disabled = n === 0;
    };
    summary();
    const ignoredText = [S.ignored.group ? `${S.ignored.group} left out by the group choice` : '', S.ignored.blank ? `${S.ignored.blank} without a name ignored` : ''].filter(Boolean).join(' · ');
    frame(
      4,
      h('div', { class: 'card stack' }, h('h2', { text: 'Preview' }), summaryEl, ignoredText ? h('p', { class: 'hint', text: ignoredText }) : null, h('div', { class: 'field' }, h('label', { text: 'For rows already saved' }), modeChips.el), statusChips.el, find, list, h('div', { class: 'row-center' }, more)),
      c.error ? h('p', { class: 'hint', text: 'Rows with problems are never half-saved. Fix them in Excel later and import the same file again: rows already saved are skipped.' }) : null,
      nav(btn('Back', step3, 'btn-secondary'), importBtn)
    );
  }

  // ---------------------------------------------------------- step 5: import
  async function startImport() {
    const send = S.rows.filter((r) => r.status === 'new' || (S.mode === 'update' && r.status === 'saved'));
    S.queue = send;
    S.cursor = 0;
    S.out = { added: 0, updated: 0, skipped: 0, errors: 0 };
    S.problems = S.rows.filter((r) => r.status === 'error').map((r) => ({ fileRow: r.fileRow, name: r.name, message: r.message }));
    leaveGuard = true;
    await runImport();
  }

  async function runImport() {
    const bar = h('progress', { class: 'progress', max: '100', value: '0' });
    const label = h('div', { class: 'hint', text: '' });
    const retry = btn('Continue', runImport);
    retry.hidden = true;
    const failMsg = h('div', { class: 'err', role: 'alert' });
    frame(5, h('div', { class: 'card stack' }, h('h2', { text: 'Importing' }), bar, label, failMsg, h('div', null, retry)));
    const total = S.queue.length;
    const paint = () => {
      bar.value = total ? Math.round((S.cursor / total) * 100) : 100;
      label.textContent = `Importing ${S.cursor} of ${total}`;
    };
    paint();
    while (S.cursor < total) {
      const part = S.queue.slice(S.cursor, S.cursor + CHUNK);
      try {
        const res = await api('POST', `/api/${S.type}/import`, { mode: S.mode, rows: part.map((r) => r.payload) });
        res.results.forEach((x, k) => {
          if (x.status === 'added') S.out.added++;
          else if (x.status === 'updated') S.out.updated++;
          else if (x.status === 'skipped') S.out.skipped++;
          else { S.out.errors++; S.problems.push({ fileRow: part[k].fileRow, name: part[k].name, message: x.message || 'Not imported.' }); }
        });
        S.cursor += part.length;
        paint();
      } catch (e) {
        failMsg.textContent = `${e instanceof ApiError ? e.message : 'The connection was lost.'} Nothing already imported is lost. Tap Continue to carry on.`;
        retry.hidden = false;
        return;
      }
    }
    done();
  }

  // ---------------------------------------------------------- step 6
  function done() {
    leaveGuard = false;
    const skipped = S.out.skipped + S.rows.filter((r) => r.status === 'saved').length * (S.mode === 'skip' ? 1 : 0);
    const problems = S.problems.length;
    const csv = () => {
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const body = [['Row in file', 'Name', 'Problem'], ...S.problems.map((p) => [p.fileRow, p.name, p.message])].map((r) => r.map(q).join(',')).join('\r\n');
      const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })), download: `${S.type}-import-problems.csv` });
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    frame(
      6,
      h('div', { class: 'card stack done' },
        h('div', { class: 'ico okbig' }, icon('check')),
        h('h2', { text: 'Import finished' }),
        h('p', { class: 'summary', id: 'import-summary', text: `${S.out.added} added, ${S.out.updated} updated, ${skipped} skipped, ${problems} not imported` }),
        problems ? h('p', { class: 'hint', text: 'Fix the problem rows in Excel and import the same file again. Rows already saved are skipped.' }) : null,
        h('div', { class: 'btns' }, problems ? h('button', { type: 'button', class: 'btn btn-secondary', onclick: csv }, icon('upload'), 'Download problem rows') : null, h('a', { class: 'btn btn-primary', href: S.type === 'clients' ? '#/clients' : '#/items' }, S.type === 'clients' ? 'Open Clients' : 'Open Items'), btn('Import another file', step1, 'btn-secondary')))
    );
  }

  step1();
  box.append(
    h('a', { class: 'crumb', href: '#/settings' }, icon('back'), 'Settings'),
    h('div', { class: 'page-head' }, h('div', null, h('h1', { text: 'Import from Aeon' }), h('p', { class: 'sub', text: 'Bring in your client or item list from Excel.' }))),
    root
  );
  return { canLeave: () => !leaveGuard };
}
