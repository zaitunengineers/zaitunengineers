// The printed Delivery Challan (general and jobwork) and Proforma Invoice, worked out as drawing steps like layout.js does for bills.
// Measurements (points, y from the TOP of the page) were taken from Aeon's own challan PDFs:
//   general  = Challan_FY2627.pdf (DC/017)      jobwork = Challan_FY2324.pdf (DC/35)      proforma = Challan_FY2223.pdf (000001)
// Same drawing steps ("ops") as layout.js, so the PDF writer, the on-screen Preview and the print all work unchanged.

import { amountInWords } from '../gst.js';
import { stateName } from '../states.js';
import { money2, qtyText, ddmmyyyy, aeonStateName, wrapText, fitSize } from './fmt.js';
import { PAGE_W, PAGE_H, AEON_TOP_MARGIN } from './layout.js';

const MM = 72 / 25.4;
const BLACK = [0, 0, 0];
const RED = [1, 0, 0];
const NAVY = [0, 0, 0.5];
const GREEN = [0, 0.5, 0];
const BLUE = [0, 0, 1];
const LIGHT = [0.94, 0.94, 0.94];
const SKY = [0.8, 0.96, 1];

const L = 28.2;
const R = 567.9;
const R2 = 568.2; // Aeon's header cells end 0.3 further right than the body
const LW = 0.45;
const ROW = 14.25;
const HEAD_H = 25.5;
const CENTRE = 297;

// Table columns (the same in all three).
const C = {
  sr: [28.2, 47.7], desc: [47.7, 262.6], hsn: [262.6, 320], gst: [320, 359], qty: [359, 416], rate: [416, 468.1], mou: [468.1, 501.9], amount: [501.9, 567.9],
};

// Per kind: where the table starts, how many rows a page holds, where the party text starts, how wide the party box is.
const VARIANTS = {
  general: { top: 235.0, rows: 21, split: 359, addr0: 158.2, state: 208.6, gstin: 222.9, taxBox: false, terms: true },
  proforma: { top: 235.0, rows: 19, split: 359, addr0: 158.2, state: 208.6, gstin: 222.9, taxBox: true, terms: true },
  jobwork: { top: 271.8, rows: 19, split: 298.2, addr0: 169, state: 220, gstin: 234.1, taxBox: true, terms: false },
};
const variantOf = (kind) => (kind === 'general' ? VARIANTS.general : kind === 'proforma' ? VARIANTS.proforma : VARIANTS.jobwork);

export const docTitle = (kind) => ({ general: 'DELIVERY CHALLAN', jw_issue: 'Delivery Challan for Jobwork', jw_receive: 'Jobwork Receive Challan', jw_opening: 'Jobwork Opening Challan', proforma: 'PROFORMA INVOICE' }[kind] || 'DELIVERY CHALLAN');
export const rowsPerPage = (kind) => variantOf(kind).rows;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// Aeon trims the rate on a challan: 367.4, 413.95, 0.1
const rateText = (milli) => { const s = ((Number(milli) || 0) / 1000).toFixed(3); return s.replace(/0+$/, '').replace(/\.$/, ''); };
const rateTxt = (bp) => `${(Number(bp) / 100).toFixed(2)}%`;
const rate3 = (bp) => `${(Number(bp) / 100).toFixed(3)}%`;

function totalsOf(c) {
  const t = { qty: 0, amount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, net: 0 };
  const rates = new Map();
  for (const l of c.lines) {
    t.qty += l.qty_milli || 0;
    t.amount += l.amount_paise || 0;
    t.taxable += l.taxable_paise || 0;
    t.cgst += l.cgst_paise || 0;
    t.sgst += l.sgst_paise || 0;
    t.igst += l.igst_paise || 0;
    t.net += l.net_paise || 0;
    const r = rates.get(l.gst_bp || 0) || { bp: l.gst_bp || 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    r.taxable += l.taxable_paise || 0;
    r.cgst += l.cgst_paise || 0; r.sgst += l.sgst_paise || 0; r.igst += l.igst_paise || 0;
    rates.set(l.gst_bp || 0, r);
  }
  t.rates = [...rates.values()].sort((a, b) => a.bp - b.bp).slice(0, 4);
  return t;
}

function itemRows(c, settings, M) {
  const mode = settings.print_wrap === 'word' ? 'word' : 'char';
  const descW = C.desc[1] - C.desc[0] - 2.4 - 3;
  const maxChars = Math.floor(descW / 6.03);
  const gstOn = c.kind !== 'general';
  const rows = [];
  let n = 0;
  for (const l of c.lines) {
    n += 1;
    const name = wrapText(M, 'r', 10, l.item_name, descW, mode, maxChars);
    const extra = l.description ? wrapText(M, 'r', 10, l.description, descW, mode, maxChars) : [];
    const first = {
      sr: String(n), desc: name[0], hsn: l.hsn || '', gst: gstOn ? rateTxt(l.gst_bp) : rateTxt(0),
      qty: qtyText(l.qty_milli), rate: rateText(l.rate_milli), mou: l.uom || '', amount: money2(l.amount_paise),
    };
    const block = [first];
    for (const t of [...name.slice(1), ...extra]) block.push({ desc: t });
    rows.push(block);
  }
  return rows;
}

// How many table rows the closing lines (dashes, sub-total, tax lines) take at the bottom of the last page.
function reservedRows(kind, totals, gstSplit) {
  if (kind === 'general') return 0;
  return 2 + taxLines(totals, gstSplit).length;
}
function taxLines(totals, gstSplit) {
  if (gstSplit) {
    const out = [];
    if (totals.cgst) out.push(['CGST', totals.cgst]);
    if (totals.sgst) out.push(['SGST', totals.sgst]);
    return out;
  }
  return totals.igst ? [['IGST', totals.igst]] : [];
}

function paginate(blocks, perPage, reserve) {
  const pages = [[]];
  const room = () => perPage - pages[pages.length - 1].length;
  for (const b of blocks) {
    if (b.length > room() && b.length <= perPage) pages.push([]);
    for (const r of b) {
      if (room() === 0) pages.push([]);
      pages[pages.length - 1].push(r);
    }
  }
  if (pages[pages.length - 1].length > perPage - reserve) pages.push([]);
  return pages;
}

function remarkLines(c, M, width) {
  const out = [];
  for (const raw of String(c.remark || '').split(/\r?\n/)) {
    const s = clean(raw);
    if (s) out.push(...wrapText(M, 'r', 8, s, width, 'word'));
  }
  return out.slice(0, 6);
}

function pageOps(ctx, c, copyName, rows, pageNo, pageCount, totals) {
  const { firm, settings, M, imgSize } = ctx;
  const V = variantOf(c.kind);
  const last = pageNo === pageCount;
  const gstSplit = c.inv_type === 'GST';
  const ops = [];
  const text = (x, y, size, font, s, o = {}) => { if (s !== '' && s != null) ops.push({ t: 'text', x, y, size, font, text: String(s), color: o.color || BLACK, align: o.align || 'l' }); };
  const line = (x1, y1, x2, y2, o = {}) => ops.push({ t: 'line', x1, y1, x2, y2, w: o.w || LW, color: o.color || BLACK });
  const rect = (x, y, w, h, fill) => ops.push({ t: 'rect', x, y, w, h, fill });
  const box = (x1, y1, x2, y2) => { line(x1, y1, x2, y1); line(x1, y2, x2, y2); line(x1, y1, x1, y2); line(x2, y1, x2, y2); };

  const T = V.top;
  const bodyTop = T + HEAD_H;
  const E = bodyTop + V.rows * ROW; // end of the item grid
  const isProforma = c.kind === 'proforma';

  // ---- top line
  text(30.6, 53.7, 10, 'b', docTitle(c.kind), { color: RED });
  text(CENTRE, 53.7, 10, 'b', clean(firm.bill_title) || 'TAX INVOICE', { align: 'c' });
  text(564.4, 53.7, 10, 'b', copyName, { color: RED, align: 'r' });

  // ---- firm block
  box(L, 64.8, R, 123.7);
  if (settings.print_logo !== '0' && ctx.logo) {
    const bx = { x: 30, y: 67, w: 66, h: 54 };
    const s = imgSize('logo');
    if (s) {
      const k = Math.min(bx.w / s.w, bx.h / s.h);
      const w = s.w * k, h = s.h * k;
      ops.push({ t: 'img', key: 'logo', x: bx.x + (bx.w - w) / 2, y: bx.y + (bx.h - h) / 2, w, h });
    }
  }
  const firmName = clean(firm.name).toUpperCase();
  text(CENTRE, 68.7, fitSize(M, 'b', 12, firmName, 420, 8), 'b', firmName, { align: 'c' });
  const city = [clean(firm.city).toUpperCase(), clean(firm.pincode)].filter(Boolean).join(' : ');
  const cityMob = [city, firm.mobile ? `Mobile No.: ${clean(firm.mobile)}` : ''].filter(Boolean).join(' ');
  const panMail = [firm.pan ? `PAN : ${clean(firm.pan)}` : '', firm.email ? `EmailID : ${clean(firm.email)}` : ''].filter(Boolean).join(', ');
  const fl = [clean(firm.address1), clean(firm.address2), cityMob, panMail].filter(Boolean);
  const fp = fl.length > 3 ? 8.6 : 9.55;
  fl.forEach((s, i) => text(CENTRE, 82.4 + i * fp, fitSize(M, 'i', 8, s, 430, 6), 'i', s, { align: 'c' }));
  if (firm.gstin) text(CENTRE, 112.6, 10, 'b', `GSTIN : ${clean(firm.gstin)}`, { align: 'c' });

  // ---- party block (left) and the number / date / transporter cells (right)
  const sx = V.split;
  const partyBottom = T;
  const leftW = sx - 32.8 - 4;
  line(L, 123.7, L, partyBottom); line(sx, 123.7, sx, partyBottom);
  line(L, 123.7, sx, 123.7);
  text(32.8, 129.9, 10, 'r', 'Buyer', { color: NAVY });
  line(32.8, 139.0, 57.6, 139.0, { w: 0.8 });
  const pname = clean(c.party_name).toUpperCase();
  let psz = fitSize(M, 'b', 10, pname, leftW, 7);
  if (M('b', psz, pname) > leftW) {
    wrapText(M, 'b', 7.5, pname, leftW, 'word').slice(0, 2).forEach((p, i) => text(32.8, 143 + i * 8.5, 7.5, 'b', p));
  } else text(32.8, 144.1, psz, 'b', pname);
  const addr = [];
  for (const raw of String(c.party_address || '').split(/\r?\n/)) {
    const s = clean(raw);
    if (s) addr.push(...wrapText(M, 'i', 8, s, leftW, 'word'));
  }
  const pcity = [clean(c.party_city).toUpperCase(), clean(c.party_pincode)].filter(Boolean).join(' : ');
  if (pcity) addr.push(pcity);
  if (clean(c.party_phone)) addr.push(`Phone: ${clean(c.party_phone)}`);
  if (clean(c.party_pan)) addr.push(`PAN : ${clean(c.party_pan)}`);
  const room = V.state - 4 - V.addr0;
  const apitch = addr.length > 1 && (addr.length - 1) * 9.5 + 8 > room ? Math.max(6.5, (room - 8) / (addr.length - 1)) : 9.5;
  addr.forEach((s, i) => text(32.8, V.addr0 + i * apitch, 8, 'i', s));
  const code = clean(c.party_state_code);
  text(32.8, V.state, 10, 'r', 'State');
  text(67.3, V.state, 10, 'b', ':');
  const stTxt = code ? `${code}-${aeonStateName(stateName(code))}`.replace(/-$/, '') : '';
  text(74.4, V.state, fitSize(M, 'b', 10, stTxt, sx - 74.4 - 3, 6.5), 'b', stTxt);
  text(32.8, V.gstin, 10, 'r', 'GSTIN');
  text(67.3, V.gstin, 10, 'b', ':');
  text(74.4, V.gstin, 10, 'b', clean(c.party_gstin));

  // right: number | date
  const mx = 488.4;
  const noLabel = isProforma ? 'Proforma No.' : 'Challan No.';
  box(sx, 123.7, mx, 152.2); box(mx, 123.7, R2, 152.2);
  text(sx + 2.3, 127.2, 10, 'r', noLabel);
  text(mx + 2.3, 127.2, 10, 'r', 'Dated');
  text(sx + 2.3, 141.5, 10, 'b', String(c.no_text || c.bill_no || ''));
  const shownDate = c.kind === 'jw_opening' && c.orig_date ? c.orig_date : c.challan_date;
  text(mx + 2.3, 141.5, 10, 'b', ddmmyyyy(shownDate));

  // transporter cells: always on jobwork (Aeon draws them empty), on the others only when something is filled
  const hasTrans = !!(clean(c.transporter_name) || clean(c.lr_no) || c.lr_date || clean(c.vehicle_no));
  let extraTop = 152.2;
  if (hasTrans || c.kind.startsWith('jw_')) {
    const cells = [
      [['Transporter Name', clean(c.transporter_name)], ['Dated', c.lr_date ? ddmmyyyy(c.lr_date) : '']],
      [['LR/RR No.', clean(c.lr_no)], ['Vehicle No.', clean(c.vehicle_no)]],
    ];
    cells.forEach(([a, b], i) => {
      const y0 = 152.2 + i * 2 * ROW;
      box(sx, y0, mx, y0 + 2 * ROW); box(mx, y0, R2, y0 + 2 * ROW);
      text(sx + 2.3, y0 + 3.8, 10, 'r', a[0]);
      text(mx + 2.3, y0 + 3.8, 10, 'r', b[0]);
      text(sx + 2.3, y0 + ROW + 3.6, fitSize(M, 'b', 10, a[1], mx - sx - 4, 7), 'b', a[1]);
      text(mx + 2.3, y0 + ROW + 3.6, fitSize(M, 'b', 10, b[1], R2 - mx - 4, 7), 'b', b[1]);
    });
    extraTop = 152.2 + 4 * ROW;
  }
  // the right-hand block ends where the table starts
  box(sx, extraTop, R2, partyBottom);
  const sep = (label) => `${label.replace(/\s*:\s*$/, '')} : `;
  const extras = [];
  [['lbl_x1', 'x1'], ['lbl_x2', 'x2'], ['lbl_x3', 'x3'], ['lbl_x4', 'x4']].forEach(([lk, vk]) => { if (clean(c[vk])) extras.push([sep(clean(settings[lk]) || vk.toUpperCase()), clean(c[vk])]); });
  if (c.po_date) extras.push([sep(clean(settings.lbl_po_date) || 'PO DATE'), ddmmyyyy(c.po_date)]);
  const ep = extras.length > 1 ? Math.min(13.3, Math.max(8.6, (partyBottom - extraTop - 8) / extras.length)) : 13.3;
  const esz = Math.min(10, Math.max(7, 10 * ep / 13.3));
  extras.forEach(([lab, val], i) => {
    const y = extraTop + 3.5 + i * ep;
    text(sx + 2.3, y, esz, 'r', lab);
    text(sx + 2.3 + M('r', esz, lab), y, esz, 'b', val);
  });

  // ---- table heading
  const hd = (key, size, l1, l2) => {
    const [a, b] = C[key];
    rect(a, T, (key === 'amount' ? R2 : b) - a, HEAD_H, LIGHT);
    const cx = (a + b) / 2;
    text(cx, T + 3.6, size, 'b', l1, { color: NAVY, align: 'c' });
    if (l2) text(cx, T + (size === 10 ? 15.1 : 14), size, 'b', l2, { color: NAVY, align: 'c' });
  };
  hd('sr', 10, 'Sr.', 'No.'); hd('desc', 9, 'Description of Goods/Services'); hd('hsn', 9, 'HSN/SAC', 'Code'); hd('gst', 9, 'GST', 'Rate');
  hd('qty', 9, 'Quantity'); hd('rate', 9, 'Rate'); hd('mou', 9, 'MOU'); hd('amount', 10, 'Amount');
  line(L, T, R2, T); line(L, bodyTop, R2, bodyTop);

  // ---- grid: the outer edges and the column rules, down to the end of the rows
  const tableEnd = E;
  for (const x of [L, C.sr[1], C.desc[1], C.hsn[1], C.gst[1], C.qty[1], C.rate[1], C.mou[1], R]) line(x, T, x, tableEnd);
  line(R2, T, R2, bodyTop);

  // ---- body rows
  rows.forEach((r, i) => {
    const y = bodyTop + i * ROW + 3.6;
    if (r.sr) text(44.0, y, 10, 'b', r.sr, { align: 'r' });
    if (r.desc) text(C.desc[0] + 2.4, y, 10, 'r', r.desc);
    if (r.hsn) text(C.hsn[0] + 2.3, y, 10, 'r', r.hsn);
    if (r.gst) text(C.gst[1] - 3.7, y, 10, 'r', r.gst, { align: 'r' });
    if (r.qty) text(C.qty[1] - 3.7, y, 10, 'r', r.qty, { align: 'r' });
    if (r.rate) text(C.rate[1] - 3.7, y, 10, 'r', r.rate, { align: 'r' });
    if (r.mou) text((C.mou[0] + C.mou[1]) / 2, y, 10, 'r', r.mou, { align: 'c' });
    if (r.amount) text(C.amount[1] - 3.7, y, 10, 'r', r.amount, { align: 'r' });
  });

  // ---- below the grid
  const totalNet = c.kind === 'general' ? totals.amount : totals.net;
  line(L, E, R, E);
  if (!last) {
    text(R - 6, E + 4, 9, 'i', 'Continued on next page ...', { align: 'r' });
    line(L, E + 15.7, R, E + 15.7);
    line(L, E, L, E + 15.7); line(R, E, R, E + 15.7);
  } else {
    const gstOn = c.kind !== 'general';
    if (gstOn) {
      // dashes, sub-total, and the tax lines, in the last rows of the grid
      const tl = taxLines(totals, gstSplit);
      const sTop = E - ROW * tl.length;
      const dashW = 64;
      const dashes = '-'.repeat(Math.max(8, Math.round(dashW / M('r', 10, '-'))));
      text(564.8, sTop - 2 * ROW + 3.6, 10, 'r', dashes, { align: 'r' });
      text(C.amount[1] - 3.7, sTop - ROW + 1.5, 10, 'r', money2(totals.taxable), { align: 'r' });
      tl.forEach(([lab, amt], i) => {
        const y = sTop + i * ROW + 3.6;
        text(C.desc[1] - 2.7, y, 10, 'r', lab, { align: 'r' });
        text(C.amount[1] - 3.7, y, 10, 'r', money2(amt), { align: 'r' });
      });
    }
    // total row
    box(L, E, 359, E + 15.7);
    rect(359, E, 57, 15.7, SKY); rect(501.9, E, 66, 15.7, SKY);
    box(359, E, 416, E + 15.7); box(416, E, 501.9, E + 15.7); box(501.9, E, R, E + 15.7);
    text(C.qty[1] - 3.7, E + 3.9, 12, 'b', qtyText(totals.qty), { align: 'r' });
    text(C.amount[1] - 3.7, E + 3.9, 12, 'b', money2(totalNet), { align: 'r' });
    if (c.kind.startsWith('jw_')) text(350, E + 3.8, 10, 'b', '** Net Challan Amount **', { align: 'r' });
    // words row
    const words = amountInWords(totalNet);
    line(L, E + 15.7, L, E + 38.2); line(R, E + 15.7, R, E + 38.2);
    line(L, E + 38.2, R, E + 38.2);
    text(30.5, E + 18.9, fitSize(M, 'b', 7, words, 440, 5), 'b', words);
    text(564.5, E + 19.3, 10, 'b', 'E. & O. E.', { align: 'r' });

    // ---- tax summary (proforma and jobwork)
    let B = E + 38.2;
    if (V.taxBox) {
      const rs = totals.rates.length ? totals.rates : [{ bp: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 }];
      const top = B;
      const cols = gstSplit
        ? { tv: [299.6, 366.0], c1r: [366.0, 416.5], c1a: [416.5, 466.9], c2r: [466.9, 517.4], c2a: [517.4, R] }
        : { tv: [382.6, 449.0], c1r: [449.0, 501.5], c1a: [501.5, R] };
      const labW = cols.tv[0];
      const h2 = top + 2 * 14.25 + (rs.length + 1) * ROW;
      line(L, top, labW, top); line(L, top, L, h2);
      line(cols.tv[0], top, R, top);
      // headings
      text((cols.tv[0] + cols.tv[1]) / 2, top + 3.6, 10, 'b', 'Taxable', { align: 'c' });
      text((cols.tv[0] + cols.tv[1]) / 2, top + 15.1, 10, 'b', 'Value', { align: 'c' });
      const grp = (name, a, b, m) => {
        text((a + b) / 2, top + 3.6, 10, 'b', name, { align: 'c' });
        text((a + m) / 2, top + 17.9, 10, 'b', 'Rate', { align: 'c' });
        text((m + b) / 2, top + 17.9, 10, 'b', 'Amount', { align: 'c' });
        line(a, top + 14.3, b, top + 14.3); line(m, top + 14.3, m, h2); line(a, top, a, h2);
      };
      if (gstSplit) { grp('Central Tax', cols.c1r[0], cols.c1a[1], cols.c1a[0]); grp('State Tax', cols.c2r[0], cols.c2a[1], cols.c2a[0]); line(cols.c2a[1], top, cols.c2a[1], h2); }
      else { grp('Inter State Tax', cols.c1r[0], cols.c1a[1], cols.c1r[1]); line(R, top, R, h2); }
      line(cols.tv[0], top, cols.tv[0], h2); line(cols.tv[1], top, cols.tv[1], h2);
      line(cols.tv[0], top + 28.5, R, top + 28.5);
      const dataTop = top + 28.5;
      const rowTxt = (y, tvV, r1, a1, r2, a2, bold) => {
        const f = bold ? 'b' : 'r';
        text(cols.tv[1] - 3.7, y, 10, f, tvV, { align: 'r' });
        if (r1) text(cols.c1r[1] - 3.7, y, 10, f, r1, { align: 'r' });
        if (a1) text(cols.c1a[1] - 3.8, y, 10, f, a1, { align: 'r' });
        if (r2) text(cols.c2r[1] - 3.7, y, 10, f, r2, { align: 'r' });
        if (a2) text(cols.c2a[1] - 3.8, y, 10, f, a2, { align: 'r' });
      };
      rs.forEach((r, i) => {
        const y = dataTop + i * ROW + 3.6;
        if (gstSplit) rowTxt(y, money2(r.taxable), rate3(r.bp / 2), money2(r.cgst), rate3(r.bp / 2), money2(r.sgst));
        else rowTxt(y, money2(r.taxable), rate3(r.bp), money2(r.igst));
      });
      const ty = dataTop + rs.length * ROW + 3.6;
      text(cols.tv[0] - 3.7, ty, 10, 'r', '** Total **', { align: 'r' });
      if (gstSplit) rowTxt(ty, money2(totals.taxable), '', money2(totals.cgst), '', money2(totals.sgst));
      else rowTxt(ty, money2(totals.taxable), '', money2(totals.igst));
      line(L, h2, R, h2);
      line(R, top, R, h2);
      // the tax in words
      const tax = gstSplit ? totals.cgst + totals.sgst : totals.igst;
      const tw = amountInWords(tax);
      line(L, h2, L, h2 + 10.9); line(R, h2, R, h2 + 10.9);
      line(L, h2 + 10.9, R, h2 + 10.9);
      text(30.5, h2 + 3.2, fitSize(M, 'b', 7, tw, 440, 5), 'b', tw);
      B = h2 + 10.9;
    }

    // ---- remarks, terms, signature
    const rl = remarkLines(c, M, 335);
    const remBody = Math.max(23.2, rl.length * 11.6 + 2);
    const jw = !V.terms;
    const leftBottom = jw ? B + 104.6 : B + 11.7 + remBody + 11.6 + 49.5;
    const sigH = jw ? 90.7 : 79.5;
    const rightBottom = leftBottom;
    line(L, B, 374, B);
    line(L, B, L, leftBottom); line(374, B, 374, leftBottom); line(R, B, R, rightBottom);
    line(L, leftBottom, R, leftBottom);
    if (rl.length) text(30.6, B + 3.4, 8, 'r', 'Remarks :-');
    rl.forEach((s, i) => text(30.6, B + 15 + i * 11.6, 8, 'r', s));
    if (!jw) {
      const tTop = B + 11.7 + remBody;
      line(L, B + 11.7, 374, B + 11.7);
      line(L, tTop, 374, tTop);
      text(30.6, tTop + 3.8, 8, 'b', 'Terms & Conditions :-', { color: GREEN });
      line(30.6, tTop + 10.7, 112.4, tTop + 10.7, { w: 0.64, color: GREEN });
      const terms = String(firm.terms || '').split(/\r?\n/).map(clean).filter(Boolean).slice(0, 5);
      terms.forEach((tline, i) => text(30.6, tTop + 15.6 + i * 9.55, fitSize(M, 'i', 8, tline, 340, 6), 'i', tline));
    }
    const cx = (374 + R) / 2;
    text(cx, B + 3.6, 10, 'b', `For ${firmName}`, { color: BLUE, align: 'c' });
    if (ctx.sig && ctx.signatureOn) {
      const s = imgSize('sig');
      if (s) {
        const bx = { x: 389, y: B + 18, w: 172, h: sigH - 30 };
        const k = Math.min(bx.w / s.w, bx.h / s.h);
        const w = s.w * k, h = s.h * k;
        ops.push({ t: 'img', key: 'sig', x: bx.x + (bx.w - w) / 2, y: bx.y + (bx.h - h) / 2, w, h });
      }
    }
    line(374, B + sigH, R, B + sigH);
    text(cx, B + sigH + (jw ? 3.6 : 3.6), 10, 'b', 'Authorised Signatory', { color: BLUE, align: 'c' });
  }

  if (pageCount > 1) text(R, 826, 7, 'r', `Page ${pageNo} of ${pageCount}`, { align: 'r' });
  if (c.status === 'cancelled') ops.push({ t: 'stamp', text: 'CANCELLED', cx: (L + R) / 2, cy: 460, size: 64, font: 'b', color: RED, rot: 30, opacity: 0.35 });
  return ops;
}

// input: { bills:[challan + lines] (named "bills" so the print code can treat them alike), firm, settings, copies, measure, topMarginMm, signature, imgSize, hasLogo, hasSig }
export function buildChallanDocument(input) {
  const { bills, firm, settings, copies } = input;
  const M = input.measure;
  const shift = ((Number(input.topMarginMm) || AEON_TOP_MARGIN) - AEON_TOP_MARGIN) * MM;
  const ctx = { firm, settings, M, imgSize: input.imgSize || (() => null), logo: input.hasLogo, sig: input.hasSig, signatureOn: input.signature !== false };
  const pages = [];
  for (const c of bills) {
    const V = variantOf(c.kind);
    const totals = totalsOf(c);
    const blocks = itemRows(c, settings, M);
    const rowPages = paginate(blocks, V.rows, reservedRows(c.kind, totals, c.inv_type === 'GST'));
    for (const copy of copies) {
      rowPages.forEach((rows, i) => {
        const ops = pageOps(ctx, c, copy, rows, i + 1, rowPages.length, totals);
        if (shift) for (const o of ops) {
          if (o.t === 'line') { o.y1 += shift; o.y2 += shift; } else if (o.y !== undefined) o.y += shift; else if (o.cy !== undefined) o.cy += shift;
        }
        pages.push({ ops, billId: c.id, billNo: c.no_text || c.bill_no, copy });
      });
    }
  }
  return { pageW: PAGE_W, pageH: PAGE_H, pages };
}
