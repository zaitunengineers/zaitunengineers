// Getting a made PDF out of the app: download, phone share sheet, WhatsApp and email. Nothing is stored anywhere.

import { safeName, moneyIndian, ddmmyyyy } from './fmt.js';

export function fileNameFor(bills) {
  if (bills[0] && bills[0].kind) {
    // a challan or proforma: Challan-DC-017-2026-27-PARTY.pdf (the "/" in a number becomes "-")
    const b = bills[0];
    const word = b.kind === 'proforma' ? 'Proforma' : 'Challan';
    if (bills.length === 1) return `${word}-${String(b.no_text || b.bill_no).replace(/[^A-Za-z0-9]+/g, '-')}-${b.fy}-${String((b.fy + 1) % 100).padStart(2, '0')}-${safeName(b.party_name)}.pdf`;
    const dates = bills.map((x) => x.challan_date).sort();
    return `${word}s-${dates[0]}-to-${dates[dates.length - 1]}.pdf`;
  }
  if (bills.length === 1) {
    const b = bills[0];
    return `Invoice-${b.bill_no}-${b.fy}-${String((b.fy + 1) % 100).padStart(2, '0')}-${safeName(b.party_name)}.pdf`;
  }
  const dates = bills.map((b) => b.bill_date).sort();
  return `Bills-${dates[0]}-to-${dates[dates.length - 1]}.pdf`;
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// A phone (or tablet) that can hand a file to another app through its share sheet.
export function canShareFile(file) {
  try {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return !!(coarse && navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

export async function shareFile(file, { title, text }) {
  try {
    await navigator.share({ files: [file], title, text });
    return 'shared';
  } catch (e) {
    return e && e.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

// "98249 09008", "+91 9824909008", "09824909008" -> "919824909008". Not a real mobile -> ''
export function cleanMobile(raw) {
  let d = String(raw || '').replace(/\D+/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 && /^[6-9]/.test(d) ? `91${d}` : '';
}

export function whatsappUrl(mobile, text) {
  const num = cleanMobile(mobile);
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

export function mailUrl(to, subject, body) {
  const addr = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || '').trim()) ? String(to).trim() : '';
  return `mailto:${addr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// {billno} {date} {amount} {party} {firm}
export function fillTemplate(tpl, bill, firm) {
  const net = bill.status === 'cancelled' ? bill.orig_net_paise || 0 : bill.net_paise;
  const map = { billno: String(bill.bill_no), date: ddmmyyyy(bill.bill_date), amount: moneyIndian(net), party: bill.party_name || '', firm: firm.name || '' };
  return String(tpl).replace(/\{(billno|date|amount|party|firm)\}/g, (_, k) => map[k]);
}
