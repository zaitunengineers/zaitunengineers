// The printed bill: Aeon's A4 Tax Invoice, worked out as a list of drawing steps ("ops") per page.
// Everything here is plain data in, plain data out, so the same layout feeds the PDF, the on-screen Preview and the tests.
// Measurements (in points, y counted from the TOP of the page) were taken from Aeon's own bill 308.

import { amountInWords } from '../gst.js';
import { stateName } from '../states.js';
import { money2, qtyText, rateText, gstText, halfGstText, ddmmyyyy, aeonStateName, wrapText, fitSize } from './fmt.js';

export const PAGE_W = 595.5;
export const PAGE_H = 842.25;
// A text op's y is the top of its capital letters. The baseline sits BASE * size lower.
export const BASE = 0.74;

export const AEON_TOP_MARGIN = 13.23; // what Aeon's Bill Printing box shows; the layout below already includes it
const MM = 72 / 25.4;

const BLACK = [0, 0, 0];
const RED = [1, 0, 0];
const DARKRED = [0.5, 0, 0];
const NAVY = [0, 0, 0.5];
const PURPLE = [0.5, 0, 0.5];
const GREEN = [0, 0.5, 0];
const BLUE = [0, 0, 1];
const GREY = [0.8, 0.8, 0.8];
const LIGHT = [0.94, 0.94, 0.94];
const SKY = [0.8, 0.96, 1];

const L = 28.2;
const R = 567.9;
const MID = 296.5;
const LW = 0.45;

const BODY_TOP = 276.8;
const PITCH = 12.8;
export const ROWS_PER_PAGE = 30;

// column edges [from, to] for the two layouts
const COLS_IGST = {
  sr: [28.2, 41.7], desc: [41.7, 171.9], hsn: [171.9, 217.2], uom: [217.2, 240.9], qty: [240.9, 276.1], rate: [276.1, 318.1],
  amount: [318.1, 365.4], adj: [365.4, 404.4], taxable: [404.4, 451.6], t1r: [451.6, 478.6], t1a: [478.6, 520.6], net: [520.6, 567.9],
};
const COLS_GST = { // measured on Aeon's bill 222 (same state, CGST + SGST)
  sr: [28.2, 41.7], desc: [41.7, 128.0], hsn: [128.0, 168.1], uom: [168.1, 189.5], qty: [189.5, 224.7], rate: [224.7, 263.4],
  amount: [263.4, 310.6], adj: [310.6, 348.1], taxable: [348.1, 395.4], t1r: [395.4, 420.5], t1a: [420.5, 458.0], t2r: [458.0, 483.1], t2a: [483.1, 520.6], net: [520.6, 567.9],
};

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- the rows of the table
function lineRows(bill, settings, M, cols) {
  const mode = settings.print_wrap === 'word' ? 'word' : 'char';
  const gst = bill.inv_type === 'GST';
  const rows = [];
  let n = 0;
  for (const l of bill.lines) {
    n += 1;
    const descW = cols.desc[1] - cols.desc[0] - 2.4 - 3;
    const maxChars = Math.round(23 * descW / 124.8);
    const name = wrapText(M, 'r', 9, l.item_name, descW, mode, maxChars);
    const extra = l.description ? wrapText(M, 'r', 9, l.description, descW, mode, maxChars) : [];
    const adj = (l.taxable_paise || 0) - (l.amount_paise || 0);
    const first = {
      sr: String(n),
      desc: name[0],
      hsn: l.hsn || '',
      uom: l.uom || '',
      qty: qtyText(l.qty_milli),
      rate: rateText(l.rate_milli),
      amount: money2(l.amount_paise),
      adj: adj ? money2(adj) : '',
      taxable: money2(l.taxable_paise),
      net: money2(l.net_paise),
    };
    if (gst) {
      first.t1r = halfGstText(l.gst_bp); first.t1a = money2(l.cgst_paise);
      first.t2r = halfGstText(l.gst_bp); first.t2a = money2(l.sgst_paise);
    } else {
      first.t1r = gstText(l.gst_bp); first.t1a = money2(l.igst_paise);
    }
    const block = [first];
    for (const t of [...name.slice(1), ...extra]) block.push({ desc: t });
    rows.push(block);
  }
  return rows;
}

function remarkRows(bill, M) {
  const out = [];
  for (const t of [bill.remark1, bill.remark2, bill.remark3]) {
    const s = clean(t);
    if (s) for (const piece of wrapText(M, 'i', 9, s, 235, 'word')) out.push({ remark: piece });
  }
  return out;
}

// Put the item blocks on pages. A block (an item and its wrapped lines) stays together when it fits on one page.
// The remark lines are printed at the bottom of the grid on the last page (as Aeon does), so the last page keeps that room free.
function paginate(blocks, remarks) {
  const pages = [[]];
  const room = () => ROWS_PER_PAGE - pages[pages.length - 1].length;
  for (const b of blocks) {
    if (b.length > room() && b.length <= ROWS_PER_PAGE) pages.push([]);
    for (const r of b) {
      if (room() === 0) pages.push([]);
      pages[pages.length - 1].push(r);
    }
  }
  if (remarks.length && pages[pages.length - 1].length > ROWS_PER_PAGE - remarks.length + 1) pages.push([]);
  return pages;
}

function totalsOf(bill) {
  const t = { qty: 0, amount: 0, adj: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, net: 0 };
  for (const l of bill.lines) {
    t.qty += l.qty_milli || 0;
    t.amount += l.amount_paise || 0;
    t.adj += (l.taxable_paise || 0) - (l.amount_paise || 0);
    t.taxable += l.taxable_paise || 0;
    t.cgst += l.cgst_paise || 0;
    t.sgst += l.sgst_paise || 0;
    t.igst += l.igst_paise || 0;
    t.net += l.net_paise || 0;
  }
  return t;
}

// ---------------------------------------------------------------- one page
function pageOps(ctx, bill, copyName, rows, pageNo, pageCount, totals, remarks) {
  const { firm, settings, M, imgSize } = ctx;
  const gst = bill.inv_type === 'GST';
  const cols = gst ? COLS_GST : COLS_IGST;
  const last = pageNo === pageCount;
  const ops = [];
  const text = (x, y, size, font, s, o = {}) => { if (s !== '' && s != null) ops.push({ t: 'text', x, y, size, font, text: String(s), color: o.color || BLACK, align: o.align || 'l' }); };
  const line = (x1, y1, x2, y2, o = {}) => ops.push({ t: 'line', x1, y1, x2, y2, w: o.w || LW, color: o.color || BLACK });
  const rect = (x, y, w, h, fill) => ops.push({ t: 'rect', x, y, w, h, fill });

  // top line, above the frame
  text(31, 31, 10, 'b', 'Tax Invoice - Debit Memo', { color: RED });
  text(MID, 31, 10, 'b', clean(firm.bill_title) || 'TAX INVOICE', { align: 'c' });
  text(562, 31, 10, 'b', copyName, { color: RED, align: 'r' });

  // firm name band
  rect(L, 40.6, 536.6, 20.2, GREY);
  rect(31.2, 60.8, 536.6, 3, BLACK);
  rect(564.9, 43.6, 3, 20.2, BLACK);
  const firmName = clean(firm.name).toUpperCase();
  text(MID, 45.5, fitSize(M, 'b', 16, firmName, 500, 10), 'b', firmName, { align: 'c' });

  // firm block
  if (settings.print_logo !== '0' && ctx.logo) {
    const box = { x: 29, y: 65, w: 71, h: 60 };
    const s = imgSize('logo');
    if (s) {
      const k = Math.min(box.w / s.w, box.h / s.h);
      const w = s.w * k, h = s.h * k;
      ops.push({ t: 'img', key: 'logo', x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h });
    }
  }
  const FW = 430;
  const fl = (y, size, font, s) => { const sz = fitSize(M, font, size, s, FW, 6); text(MID, y, sz, font, s, { align: 'c' }); };
  const a1 = clean(firm.address1);
  const a2 = clean(firm.address2);
  if (a1) fl(69, 8, 'bi', a1);
  if (a2) fl(80.5, 8, 'bi', a2);
  const city = [clean(firm.city).toUpperCase(), clean(firm.pincode)].filter(Boolean).join(' : ');
  if (city) fl(92, 8, 'bi', city);
  const contact = [firm.mobile ? `Mobile No.: ${clean(firm.mobile)}` : '', firm.pan ? `PAN : ${clean(firm.pan)}` : ''].filter(Boolean).join(' ');
  const contact2 = [contact, firm.email ? `EmailID : ${clean(firm.email)}` : ''].filter(Boolean).join(', ');
  if (contact2) fl(104, 8, 'bi', contact2);
  if (firm.gstin) fl(116, 9, 'b', `GSTIN : ${clean(firm.gstin)}`);

  // party block (the bill's own copy of the party details)
  const labelX = 32, valX = 98, addrX = 105, leftW = 298.2 - 4;
  text(labelX, 132, 10, 'r', 'Party Name');
  const partyName = `: ${clean(bill.party_name).toUpperCase()}`;
  let psz = fitSize(M, 'b', 10, partyName, leftW - valX, 7);
  if (M('b', psz, partyName) > leftW - valX) {
    const parts = wrapText(M, 'b', 7.5, partyName, leftW - valX, 'word').slice(0, 2);
    parts.forEach((p, i) => text(valX, 129 + i * 8.5, 7.5, 'b', p));
  } else text(valX, 132, psz, 'b', partyName);
  text(labelX, 160, 10, 'r', 'Address');
  text(valX, 160, 10, 'b', ':');
  const addr = [];
  for (const raw of String(bill.party_address || '').split(/\r?\n/)) {
    const s = clean(raw);
    if (s) addr.push(...wrapText(M, 'i', 8, s, leftW - addrX, 'word'));
  }
  const pcity = [clean(bill.party_city).toUpperCase(), clean(bill.party_pincode)].filter(Boolean).join(' : ');
  if (pcity) addr.push(pcity);
  if (clean(bill.party_phone)) addr.push(`Phone: ${clean(bill.party_phone)}`);
  if (clean(bill.party_pan)) addr.push(`PAN : ${clean(bill.party_pan)}`);
  const pitch = addr.length > 6 ? 54 / addr.length : 9.5;
  addr.forEach((s, i) => text(addrX, 160 + i * pitch, 8, 'i', s));
  text(labelX, 217, 10, 'r', 'State Name');
  const code = clean(bill.party_state_code);
  text(valX, 216, 10, 'b', `: ${code ? `${code}-${aeonStateName(stateName(code))}` : ''}`.replace(/-$/, ''));
  text(labelX, 231, 10, 'r', "Party's GSTIN");
  text(valX, 231, 10, 'b', `: ${clean(bill.party_gstin)}`);

  // bill block
  const revLabel = 'Tax is Payable on Reverse Charge : ';
  text(302, 131, 10, 'r', revLabel);
  text(302 + M('r', 10, revLabel), 131, 10, 'b', bill.reverse_charge ? 'Yes' : 'No');
  rect(298.2, 142.2, R - 298.2, 31.5, LIGHT);
  text(302, 148, 10, 'r', 'Invoice No.');
  text(302, 162, 10, 'r', 'Invoice Date');
  text(371, 147, 10, 'b', ':');
  text(371, 162, 10, 'b', ':');
  text(378, 147, 10, 'b', String(bill.bill_no), { color: DARKRED });
  text(378, 162, 10, 'b', ddmmyyyy(bill.bill_date), { color: DARKRED });

  // transporter and extra fields, only the filled ones
  const sep = (label) => (settings.print_double_colon === '1' ? `${label} : ` : `${label.replace(/\s*:\s*$/, '')} : `);
  const rowsR = [];
  rowsR.push([['Transporter : ', clean(bill.transporter_name)]]);
  const veh = [];
  if (clean(bill.vehicle_no)) veh.push(['Vehicle No. : ', clean(bill.vehicle_no)]);
  if (clean(bill.lr_no)) veh.push(['  LR/RR No. : ', clean(bill.lr_no) + (bill.lr_date ? `  Date : ${ddmmyyyy(bill.lr_date)}` : '')]);
  if (veh.length) rowsR.push(veh);
  [['lbl_x1', 'x1'], ['lbl_x2', 'x2'], ['lbl_x3', 'x3'], ['lbl_x4', 'x4']].forEach(([lk, vk]) => {
    if (clean(bill[vk])) rowsR.push([[sep(clean(settings[lk]) || vk.toUpperCase()), clean(bill[vk])]]);
  });
  if (bill.po_date) rowsR.push([[sep(clean(settings.lbl_po_date) || 'PO DATE'), ddmmyyyy(bill.po_date)]]);
  const rp = rowsR.length > 5 ? Math.max(8.5, (246 - 178.5 - 10) / (rowsR.length - 1)) : 13.3;
  const rsz = Math.min(10, Math.max(7, 10 * rp / 13.3));
  rowsR.forEach((parts, i) => {
    let x = 302;
    for (const [lab, val] of parts) {
      text(x, 178.5 + i * rp, rsz, 'r', lab);
      x += M('r', rsz, lab);
      text(x, 178.5 + i * rp, rsz, 'b', val);
      x += M('b', rsz, val);
    }
  });

  // table heading
  const head = (key, size, l1, l2) => {
    const [a, b] = cols[key];
    rect(a, 248.3, b - a, 24.4, LIGHT);
    const c = (a + b) / 2;
    text(c, 252.4, size, 'bi', l1, { color: NAVY, align: 'c' });
    if (l2) text(c, size === 7 ? 260.4 : 263.4, size, 'bi', l2, { color: NAVY, align: 'c' });
  };
  head('sr', 7, 'Sr.', 'No.');
  head('desc', 9, 'Description');
  head('hsn', 9, 'HSNCode');
  head('uom', 8, 'UOM');
  head('qty', 9, 'Qty.');
  head('rate', 9, 'Rate');
  head('amount', 9, 'Amount');
  head('adj', 9, 'Adjust-', 'ments');
  head('taxable', 9, 'Taxable', 'Amount');
  head('net', 9, 'Net', 'Amount');
  const group = (name, rk, ak) => {
    const a = cols[rk][0], m = cols[rk][1], b = cols[ak][1];
    rect(a, 248.3, b - a, 12.4, LIGHT);
    text((a + b) / 2, 252.4, 9, 'bi', name, { color: NAVY, align: 'c' });
    rect(a, 260.7, m - a, 12, LIGHT);
    rect(m, 260.7, b - m, 12, LIGHT);
    text((a + m) / 2, 265, 9, 'bi', 'Rate', { color: NAVY, align: 'c' });
    text((m + b) / 2, 265, 9, 'bi', 'Amount', { color: NAVY, align: 'c' });
    line(a, 260.7, b, 260.7);
    line(m, 260.7, m, 680.7);
  };
  if (gst) { group('CGST', 't1r', 't1a'); group('SGST', 't2r', 't2a'); } else group('IGST', 't1r', 't1a');

  // frame
  line(L, 40.6, 564.9, 40.6); line(L, 60.8, 564.9, 60.8);
  line(L, 40.6, L, 60.8); line(564.9, 40.6, 564.9, 60.8);
  line(L, 63.8, R, 63.8);
  line(L, 126.5, R, 126.5);
  line(L, 63.8, L, 799.2); line(R, 63.8, R, 799.2);
  line(298.2, 126.5, 298.2, 248.3);
  line(298.2, 142.2, R, 142.2); line(298.2, 173.7, R, 173.7);
  line(L, 248.3, R, 248.3); line(L, 272.7, R, 272.7);
  line(L, 668, R, 668); line(L, 680.7, R, 680.7); line(L, 695, R, 695); line(L, 799.2, R, 799.2);
  // column rules run down to the totals row
  for (const k of ['desc', 'hsn']) line(cols[k][1], 248.3, cols[k][1], 668);
  line(cols.sr[1], 248.3, cols.sr[1], 668);
  for (const k of ['uom', 'qty', 'rate', 'amount', 'adj', 'taxable']) line(cols[k][1], 248.3, cols[k][1], 680.7);
  if (gst) { line(cols.t1a[1], 248.3, cols.t1a[1], 680.7); line(cols.t2a[1], 248.3, cols.t2a[1], 680.7); }
  else line(cols.t1a[1], 248.3, cols.t1a[1], 680.7);

  // body rows
  const colRight = (k) => cols[k][1] - 4;
  rows.forEach((r, i) => {
    const y = BODY_TOP + i * PITCH;
    if (r.blank) return;
    if (r.sr) text((cols.sr[0] + cols.sr[1]) / 2, y, 9, 'b', r.sr, { align: 'c' });
    if (r.desc) text(cols.desc[0] + 2.4, y, 9, 'r', r.desc);
    if (r.hsn) text(cols.hsn[0] + 2.3, y, 9, 'r', r.hsn);
    if (r.uom) text((cols.uom[0] + cols.uom[1]) / 2, y, 9, 'r', r.uom, { align: 'c' });
    for (const k of ['qty', 'rate', 'amount', 'adj', 'taxable', 't1r', 't1a', 't2r', 't2a', 'net']) {
      if (r[k] !== undefined && r[k] !== '' && cols[k]) text(k === 'qty' ? cols.qty[1] - 3.7 : colRight(k), y, 9, 'r', r[k], { align: 'r' });
    }
  });

  // remarks sit at the bottom of the grid, indented to the Description column (Aeon bill 198)
  if (last) remarks.forEach((r, i) => text(44.1, 659 - (remarks.length - 1 - i) * 12.5, 9, 'i', r.remark));

  // totals row (last page only) and the words / net row
  if (last) {
    const ty = 671.9;
    const tp = (k, v) => text(k === 'qty' ? cols.qty[1] - 3.7 : colRight(k), ty, 9, 'b', v, { color: PURPLE, align: 'r' });
    tp('qty', qtyText(totals.qty));
    tp('amount', money2(totals.amount));
    tp('adj', money2(totals.adj));
    tp('taxable', money2(totals.taxable));
    if (gst) { tp('t1a', money2(totals.cgst)); tp('t2a', money2(totals.sgst)); } else tp('t1a', money2(totals.igst));
    tp('net', money2(totals.net));
    const words = amountInWords(totals.net);
    text(30.5, 684.3, fitSize(M, 'b', 7, words, 340, 5), 'b', words);
    rect(478.6, 680.7, R - 478.6, 14.3, SKY);
    text(373.4, 684.8, 10, 'b', '** Net Bill Amount **');
    text(563.9, 684.8, 10, 'b', money2(totals.net), { align: 'r' });
    line(478.6, 680.7, 478.6, 695);
  } else {
    text(R - 6, 671.9, 9, 'i', 'Continued on next page ...', { align: 'r' });
  }

  // bank, terms and signature (last page only)
  if (last) {
    line(374, 695, 374, 799.2);
    text(30.6, 699, 9, 'b', 'Bank Details :-', { color: GREEN });
    line(30.6, 706.6, 91.5, 706.6, { w: 0.72, color: GREEN });
    const bank = [clean(firm.bank_name), clean(firm.bank_branch)].filter(Boolean).join(', ');
    const bankRow = (y, lab, val) => {
      if (!val) return;
      text(30.6, y, 9, 'r', lab);
      text(30.6 + M('r', 9, lab), y, fitSize(M, 'b', 9, val, 340 - M('r', 9, lab), 6.5), 'b', val);
    };
    bankRow(709.5, 'Bank Name : ', bank);
    if (firm.bank_account || firm.bank_ifsc) {
      let x = 30.6;
      const y = 721.5;
      if (firm.bank_account) { text(x, y, 9, 'r', 'A/c.No.: '); x += M('r', 9, 'A/c.No.: '); const v = clean(firm.bank_account); text(x, y, 9, 'b', v); x += M('b', 9, v); }
      if (firm.bank_ifsc) { const lab = `${firm.bank_account ? ', ' : ''}IFSC : `; text(x, y, 9, 'r', lab); x += M('r', 9, lab); text(x, y, 9, 'b', clean(firm.bank_ifsc)); }
    }
    line(L, 733.2, 374, 733.2);
    text(30.6, 737, 9, 'b', 'Terms & Conditions :-', { color: GREEN });
    line(30.6, 744.9, 122.2, 744.9, { w: 0.72, color: GREEN });
    const terms = String(firm.terms || '').split(/\r?\n/).map(clean).filter(Boolean).slice(0, 5);
    terms.forEach((tline, i) => text(30.6, 749 + i * 10.5, fitSize(M, 'i', 9, tline, 340, 6), 'i', tline));
    const cx = (374 + R) / 2;
    text(cx, 699, 9, 'b', `For ${firmName}`, { color: BLUE, align: 'c' });
    if (ctx.sig && ctx.signatureOn) {
      const s = imgSize('sig');
      if (s) {
        const box = { x: 389, y: 723, w: 172, h: 44 };
        const k = Math.min(box.w / s.w, box.h / s.h);
        const w = s.w * k, h = s.h * k;
        ops.push({ t: 'img', key: 'sig', x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h });
      }
    }
    text(cx, 788, 9, 'b', 'Authorised Signatory', { color: BLUE, align: 'c' });
  }

  if (pageCount > 1) text(R, 806, 7, 'r', `Page ${pageNo} of ${pageCount}`, { align: 'r' });

  if (bill.status === 'cancelled') {
    ops.push({ t: 'stamp', text: 'CANCELLED', cx: (L + R) / 2, cy: 460, size: 64, font: 'b', color: RED, rot: 30, opacity: 0.35 });
  }
  return ops;
}

// ---------------------------------------------------------------- the whole document
// input: { bills:[{...bill, lines:[]}], firm, settings, copies:[names], topMarginMm, signature:boolean,
//          measure(font,size,text), imgSize(key)->{w,h}|null, hasLogo, hasSig }
export function buildDocument(input) {
  const { bills, firm, settings, copies } = input;
  const M = input.measure;
  const shift = ((Number(input.topMarginMm) || AEON_TOP_MARGIN) - AEON_TOP_MARGIN) * MM;
  const ctx = { firm, settings, M, imgSize: input.imgSize || (() => null), logo: input.hasLogo, sig: input.hasSig, signatureOn: input.signature !== false };
  const pages = [];
  for (const bill of bills) {
    const cols = bill.inv_type === 'GST' ? COLS_GST : COLS_IGST;
    const blocks = lineRows(bill, settings, M, cols);
    const remarks = remarkRows(bill, M).slice(0, 4);
    const rowPages = paginate(blocks, remarks);
    const totals = totalsOf(bill);
    for (const copy of copies) {
      rowPages.forEach((rows, i) => {
        const ops = pageOps(ctx, bill, copy, rows, i + 1, rowPages.length, totals, remarks);
        if (shift) for (const o of ops) {
          if (o.t === 'line') { o.y1 += shift; o.y2 += shift; } else if (o.y !== undefined) o.y += shift; else if (o.cy !== undefined) o.cy += shift;
        }
        pages.push({ ops, billId: bill.id, billNo: bill.bill_no, copy });
      });
    }
  }
  return { pageW: PAGE_W, pageH: PAGE_H, pages };
}

export { totalsOf };
