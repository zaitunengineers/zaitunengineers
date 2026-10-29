// Bill maths in whole numbers (BigInt), shared by the screen and the server.
// Money is in paise. Quantity is in thousandths (qty x 1000). Rate is in thousandths of a rupee.
// GST % is in hundredths of a percent (1800 = 18%). An exact half goes to the EVEN paisa, as Aeon does.

export const CHARGE_KEYS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'l2'];

// n / d, rounded to the nearest whole number; an exact half goes to the even number. n >= 0, d > 0.
export function divHalfEven(n, d) {
  n = BigInt(n);
  d = BigInt(d);
  let q = n / d;
  const twice = (n - q * d) * 2n;
  if (twice > d || (twice === d && q % 2n === 1n)) q += 1n;
  return Number(q);
}

// line: {qty_milli, rate_milli, disc_bp, a1..a6 (paise), l2 (paise)}; mode: 'GST' or 'IGST'; gst_bp.
// Returns every figure for the line in paise.
export function lineMaths(line, mode, gstBp) {
  const qty = BigInt(line.qty_milli || 0);
  const rate = BigInt(line.rate_milli || 0);
  const amount = divHalfEven(qty * rate, 10000n);
  const discBp = Number(line.disc_bp || 0);
  const disc = discBp ? divHalfEven(BigInt(amount) * BigInt(discBp), 10000n) : 0;
  let taxable = amount - disc;
  const out = { amount_paise: amount, disc_bp: discBp, disc_paise: disc };
  for (const k of CHARGE_KEYS) {
    const v = Number(line[k] || 0);
    out[`${k}_paise`] = v;
    taxable += k === 'l2' ? -v : v;
  }
  if (taxable < 0) taxable = 0;
  const bp = BigInt(gstBp || 0);
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (mode === 'IGST') igst = divHalfEven(BigInt(taxable) * bp, 10000n);
  else {
    cgst = divHalfEven(BigInt(taxable) * bp, 20000n);
    sgst = cgst;
  }
  out.taxable_paise = taxable;
  out.gst_bp = Number(gstBp || 0);
  out.cgst_paise = cgst;
  out.sgst_paise = sgst;
  out.igst_paise = igst;
  out.net_paise = taxable + cgst + sgst + igst;
  return out;
}

export function sumLines(lines) {
  const t = { amount_paise: 0, taxable_paise: 0, cgst_paise: 0, sgst_paise: 0, igst_paise: 0, net_paise: 0, qty_milli: 0 };
  for (const l of lines) {
    for (const k of Object.keys(t)) t[k] += Number(l[k] || 0);
  }
  return t;
}

// "1,23,456.78" style Indian grouping, always 2 decimals. Used for words and for display.
export function fmtMoney(paise, group = false) {
  const neg = paise < 0;
  const p = Math.abs(Math.round(paise));
  const whole = String(Math.floor(p / 100));
  const frac = String(p % 100).padStart(2, '0');
  let w = whole;
  if (group && whole.length > 3) {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    w = `${rest},${last3}`;
  }
  return `${neg ? '-' : ''}${w}.${frac}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n) {
  const out = [];
  if (n >= 100) {
    out.push(ONES[Math.floor(n / 100)], 'Hundred');
    n %= 100;
  }
  if (n >= 20) {
    out.push(TENS[Math.floor(n / 10)]);
    n %= 10;
  }
  if (n > 0) out.push(ONES[n]);
  return out;
}

// 1989126 paise -> "Rupees Nineteen Thousand Eight Hundred Ninety One And Twenty Six Paisa Only."
export function amountInWords(paise) {
  let rupees = Math.floor(paise / 100);
  const ps = paise % 100;
  const words = [];
  const crore = Math.floor(rupees / 10000000);
  rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000);
  rupees %= 100000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (crore) words.push(...below1000(crore), 'Crore');
  if (lakh) words.push(...below1000(lakh), 'Lakh');
  if (thousand) words.push(...below1000(thousand), 'Thousand');
  words.push(...below1000(rupees));
  const r = words.length ? words.join(' ') : 'Zero';
  let s = `Rupees ${r}`;
  if (ps) s += ` And ${below1000(ps).join(' ')} Paisa`;
  return `${s} Only.`;
}

// Financial year helpers. fy = the starting year (2026 means 2026-27).
export const fyLabel = (fy) => `${fy}-${fy + 1}`;
export const fyStart = (fy) => `${fy}-04-01`;
export const fyEnd = (fy) => `${fy + 1}-03-31`;
export function fyOfDate(iso) {
  const y = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
}
