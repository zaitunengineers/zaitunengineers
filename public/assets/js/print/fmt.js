// Small formatting helpers for the printed bill. Pure functions: they run in the browser and in Node tests.

const trimZeros = (s) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);

// 536100 paise -> "5361.00" (always 2 decimals, no commas, keeps a minus sign)
export function money2(paise) {
  const n = Math.round(Number(paise) || 0);
  const a = Math.abs(n);
  return `${n < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

// 1,23,456.78 style, used inside WhatsApp and email messages
export function moneyIndian(paise) {
  const n = Math.round(Number(paise) || 0);
  const a = Math.abs(n);
  const whole = String(Math.floor(a / 100));
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}${rest ? rest + ',' : ''}${last3}.${String(a % 100).padStart(2, '0')}`;
}

// qty_milli 1000 -> "1", 2500 -> "2.5", 1234 -> "1.234"
export function qtyText(milli) {
  const n = Math.round(Number(milli) || 0);
  const a = Math.abs(n);
  const whole = Math.floor(a / 1000);
  const frac = String(a % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${n < 0 ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

// rate_milli 5361000 -> "5361", 950500 -> "950.50", 55555 -> "55.555"
export function rateText(milli) {
  const n = Math.round(Number(milli) || 0);
  const a = Math.abs(n);
  const whole = Math.floor(a / 1000);
  const frac = a % 1000;
  const sign = n < 0 ? '-' : '';
  if (frac === 0) return `${sign}${whole}`;
  if (frac % 10 === 0) return `${sign}${whole}.${String(frac / 10).padStart(2, '0')}`;
  return `${sign}${whole}.${String(frac).padStart(3, '0')}`;
}

// 1800 -> "18", 250 -> "2.5"
export function gstText(bp) {
  return trimZeros(((Number(bp) || 0) / 100).toFixed(2));
}

// half of the GST rate for the CGST and SGST columns: 1800 -> "9", 500 -> "2.5", 25 -> "0.125"
export function halfGstText(bp) {
  return trimZeros(((Number(bp) || 0) / 200).toFixed(3));
}

export function ddmmyyyy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || '';
}

// "Daman & Diu (old)" -> "DAMAN AND DIU", as Aeon prints it
export function aeonStateName(name) {
  return String(name || '')
    .replace(/\s*\(old\)\s*/i, '')
    .replace(/&/g, 'AND')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// Break text into lines no wider than maxW.
// mode 'char': break at the exact character that no longer fits, like Aeon ("(SU-2" / "50P)"). Aeon's own bill 308
// breaks all three sample names after 23 characters, so maxChars does the same (the width check is a safety net).
// mode 'word': break at spaces; a word longer than a whole line is broken by character.
export function wrapText(measure, font, size, text, maxW, mode = 'char', maxChars = 0) {
  const out = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    if (para === '') { out.push(''); continue; }
    if (mode === 'char') {
      let cur = '';
      for (const ch of para) {
        if (cur && (measure(font, size, cur + ch) > maxW || (maxChars && cur.length >= maxChars))) { out.push(cur); cur = ch === ' ' ? '' : ch; }
        else cur += ch;
      }
      out.push(cur);
    } else {
      let cur = '';
      for (const word of para.split(' ')) {
        const tryLine = cur ? `${cur} ${word}` : word;
        if (measure(font, size, tryLine) <= maxW) { cur = tryLine; continue; }
        if (cur) { out.push(cur); cur = ''; }
        if (measure(font, size, word) <= maxW) { cur = word; continue; }
        let piece = '';
        for (const ch of word) {
          if (piece && measure(font, size, piece + ch) > maxW) { out.push(piece); piece = ch; }
          else piece += ch;
        }
        cur = piece;
      }
      out.push(cur);
    }
  }
  return out;
}

// The biggest size (stepping down by 0.5) at which the text fits maxW; never below min.
export function fitSize(measure, font, size, text, maxW, min = 6.5) {
  let s = size;
  while (s > min && measure(font, s, text) > maxW) s -= 0.5;
  return s;
}

// "FAKHRUDDIN ISMAIL" -> "A–Z0–9_" safe piece for a file name
export function safeName(s, max = 20) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max) || 'PARTY';
}
