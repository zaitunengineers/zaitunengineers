// Printing and sharing, put together: get the bills, lay them out, make the PDF or the pictures, send them where they should go.

import { api } from '/assets/js/api.js';
import { h, toast } from '/assets/js/ui.js';
import { buildDocument, AEON_TOP_MARGIN } from './layout.js';
import { buildChallanDocument } from './layout-challan.js';
import { makePdf, dataUrlInfo } from './pdf.js';
import { drawPage } from './canvas.js';
import { getEngine } from './loader.js';
import { download, fileNameFor, canShareFile, shareFile, cleanMobile, whatsappUrl, mailUrl, fillTemplate } from './share.js';

const DEFAULT_NAMES = ['ORIGINAL', 'DUPLICATE', 'TRIPLICATE', 'QUADRUPLICATE'];

export const copyNames = (s) => [s.copy1, s.copy2, s.copy3, s.copy4].map((n, i) => n || DEFAULT_NAMES[i]);

// What was chosen last time on this device (copies, output, margin). Only a convenience.
export function getPrefs() {
  const d = { copies: [true, false, false, false], output: 'screen', topMargin: AEON_TOP_MARGIN, signature: null };
  try {
    const p = JSON.parse(localStorage.getItem('zb_print') || 'null');
    if (p && Array.isArray(p.copies) && p.copies.length === 4) return { ...d, ...p, copies: p.copies.map(Boolean) };
  } catch { /* storage blocked */ }
  return d;
}
export function savePrefs(p) {
  try { localStorage.setItem('zb_print', JSON.stringify(p)); } catch { /* storage blocked */ }
}
export function pickedCopies(settings, prefs) {
  const names = copyNames(settings);
  const out = names.filter((_, i) => prefs.copies[i]);
  return out.length ? out : [names[0]];
}
// the options the layout needs, from the settings and the saved choices
export function optionsFrom(data, prefs) {
  return {
    copies: pickedCopies(data.settings, prefs),
    topMargin: prefs.topMargin,
    signature: prefs.signature === null || prefs.signature === undefined ? data.settings.print_signature !== '0' : !!prefs.signature,
  };
}

// query: { ids } or a range. query.doc = 'challan' prints challans and proforma invoices (same shape afterwards: data.bills).
export async function loadPrintData(query) {
  const { doc, ...rest } = query;
  const qs = rest.ids ? `ids=${rest.ids.join(',')}` : new URLSearchParams(rest).toString();
  if (doc === 'challan') {
    const res = await api('GET', `/api/challans/print?${qs}`);
    const bills = res.challans.map((c) => ({ ...c, bill_no: c.no_text, bill_date: c.challan_date }));
    return { firm: res.firm, settings: res.settings, bills, doc: 'challan' };
  }
  const res = await api('GET', `/api/bills/print?${qs}`);
  return { ...res, doc: 'bill' };
}

export function logPrint(ids, how, doc) {
  api('POST', '/api/print-log', doc === 'challan' ? { ids, how, doc } : { ids, how }).catch(() => {});
}

export async function buildDoc(data, opts) {
  const eng = await getEngine();
  const logo = dataUrlInfo(data.firm.logo_png);
  const sig = dataUrlInfo(data.firm.signature_png);
  const build = data.doc === 'challan' ? buildChallanDocument : buildDocument;
  const built = build({
    bills: data.bills, firm: data.firm, settings: data.settings, copies: opts.copies, measure: eng.measure,
    topMarginMm: opts.topMargin, signature: opts.signature, hasLogo: !!logo, hasSig: !!sig,
    imgSize: (k) => { const i = k === 'logo' ? logo : sig; return i ? { w: i.w, h: i.h } : null; },
  });
  return { eng, built, infos: { logo, sig } };
}

export async function makePdfBlob(data, opts) {
  const { eng, built, infos } = await buildDoc(data, opts);
  const ch = data.doc === 'challan';
  const one = data.bills.length === 1;
  const title = ch ? (one ? `${data.bills[0].kind === 'proforma' ? 'Proforma Invoice' : 'Delivery Challan'} ${data.bills[0].bill_no}` : 'Challans') : (one ? `Tax Invoice ${data.bills[0].bill_no}` : 'Tax Invoices');
  const bytes = await makePdf(eng.lib, eng.fontkit, eng.fontBytes, built, infos, { title });
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: fileNameFor(data.bills), pages: built.pages.length };
}

async function loadImage(url) {
  if (!url) return null;
  const im = new Image();
  im.src = url;
  try { await im.decode(); } catch { return null; }
  return im;
}
export async function loadImages(firm) {
  return { logo: await loadImage(firm.logo_png), sig: await loadImage(firm.signature_png) };
}

// ---- Print (laptop): the pages go to the browser's print box as 300 dpi pictures in a hidden frame
export async function printNow(data, opts) {
  const { eng, built } = await buildDoc(data, opts);
  const images = await loadImages(data.firm);
  const urls = [];
  const canvas = document.createElement('canvas');
  for (let i = 0; i < built.pages.length; i++) {
    drawPage(canvas, built, i, 300 / 72, images, eng.measure);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    urls.push(URL.createObjectURL(blob));
  }
  const frame = h('iframe', { class: 'printframe', title: 'Print', tabindex: '-1', 'aria-hidden': 'true' });
  document.body.append(frame);
  const doc = frame.contentDocument;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/css/print.css';
  doc.head.append(link);
  const pics = urls.map((u) => { const im = doc.createElement('img'); im.className = 'pg'; im.src = u; doc.body.append(im); return im; });
  await Promise.all(pics.map((im) => im.decode().catch(() => {})));
  await new Promise((resolve) => { if (link.sheet) resolve(); else { link.onload = resolve; link.onerror = resolve; setTimeout(resolve, 1500); } });
  const cleanup = () => { frame.remove(); urls.forEach((u) => URL.revokeObjectURL(u)); };
  frame.contentWindow.addEventListener('afterprint', () => setTimeout(cleanup, 500));
  setTimeout(cleanup, 10 * 60 * 1000);
  frame.contentWindow.focus();
  frame.contentWindow.print();
  return built.pages.length;
}

// ---- PDF file
export async function savePdf(data, opts) {
  const { blob, name } = await makePdfBlob(data, opts);
  const file = new File([blob], name, { type: 'application/pdf' });
  if (canShareFile(file)) {
    const r = await shareFile(file, { title: name.replace(/\.pdf$/, ''), text: '' });
    if (r === 'cancelled') return 'cancelled';
    if (r === 'shared') return 'shared';
  }
  download(blob, name);
  return 'downloaded';
}

// ---- WhatsApp: phone = share sheet with the PDF; laptop = download the PDF and open WhatsApp with the party's number
export async function shareWhatsApp(data, opts) {
  const bill = data.bills[0];
  const { blob, name } = await makePdfBlob(data, opts);
  const text = fillTemplate(data.settings.wa_msg, bill, data.firm);
  const file = new File([blob], name, { type: 'application/pdf' });
  if (canShareFile(file)) {
    const r = await shareFile(file, { title: `${data.doc === 'challan' ? (bill.kind === 'proforma' ? 'Proforma' : 'Challan') : 'Invoice'} ${bill.bill_no}`, text });
    if (r !== 'failed') return r;
  }
  download(blob, name);
  const mobile = cleanMobile(bill.client_mobile) || cleanMobile(bill.party_phone);
  window.open(whatsappUrl(mobile, text), '_blank', 'noopener');
  toast(mobile ? 'PDF downloaded. Attach it in WhatsApp.' : 'PDF downloaded. No mobile number is saved for this party, so choose the contact in WhatsApp.', 'info', 7000);
  return 'opened';
}

// ---- Email: phone = share sheet; laptop = download the PDF and open the email app
export async function shareEmail(data, opts) {
  const bill = data.bills[0];
  const { blob, name } = await makePdfBlob(data, opts);
  const subject = fillTemplate(data.settings.mail_subject, bill, data.firm);
  const body = fillTemplate(data.settings.mail_body, bill, data.firm);
  const file = new File([blob], name, { type: 'application/pdf' });
  if (canShareFile(file)) {
    const r = await shareFile(file, { title: subject, text: body });
    if (r !== 'failed') return r;
  }
  download(blob, name);
  const a = document.createElement('a');
  a.href = mailUrl(bill.client_email, subject, body);
  document.body.append(a);
  a.click();
  a.remove();
  toast(bill.client_email ? 'PDF downloaded. Attach it to the email.' : 'PDF downloaded. No email is saved for this party. Attach it and type the address.', 'info', 7000);
  return 'opened';
}

// Used by the buttons on the Sales list: do one thing for one bill, with the choices remembered on this device.
export async function quickAction(kind, billId, doc = 'bill') {
  const t = toast('Making the PDF…', 'info', 0);
  try {
    const data = await loadPrintData({ ids: [billId], doc });
    const opts = optionsFrom(data, getPrefs());
    let r;
    if (kind === 'whatsapp') r = await shareWhatsApp(data, opts);
    else if (kind === 'email') r = await shareEmail(data, opts);
    else r = await savePdf(data, opts);
    if (r !== 'cancelled') logPrint([billId], kind === 'whatsapp' ? 'whatsapp' : kind === 'email' ? 'email' : 'pdf', doc);
    return r;
  } catch (e) {
    toast((e && e.message) || 'Could not make the PDF.', 'danger');
    return 'failed';
  } finally {
    t.remove();
  }
}
