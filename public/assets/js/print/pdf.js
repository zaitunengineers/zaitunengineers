// Draws the layout's pages into a real PDF with pdf-lib. Works in the browser and in Node (the libraries are passed in).

import { BASE } from './layout.js';

export const FONT_KEYS = ['r', 'b', 'i', 'bi'];

// Image bytes from a data URL, plus the size read from the file header.
export function dataUrlInfo(url) {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(url || '');
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const type = /png/i.test(m[1]) ? 'png' : 'jpg';
  let w = 0, h = 0;
  if (type === 'png') {
    w = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
    h = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
  } else {
    let p = 2;
    while (p < bytes.length - 9) {
      if (bytes[p] !== 0xff) { p++; continue; }
      const mk = bytes[p + 1];
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
        h = (bytes[p + 5] << 8) | bytes[p + 6];
        w = (bytes[p + 7] << 8) | bytes[p + 8];
        break;
      }
      p += 2 + ((bytes[p + 2] << 8) | bytes[p + 3]);
    }
  }
  return w && h ? { type, bytes, w, h } : null;
}

async function embedFonts(lib, fontkit, fontBytes) {
  const doc = await lib.PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = {};
  const sets = {};
  for (const k of FONT_KEYS) {
    f[k] = await doc.embedFont(fontBytes[k], { subset: false });
    sets[k] = new Set(f[k].getCharacterSet());
  }
  return { doc, f, sets };
}

// A text measuring function that matches the PDF exactly: measure(fontKey, size, text) in points.
export async function createMeasure(lib, fontkit, fontBytes) {
  const { f, sets } = await embedFonts(lib, fontkit, fontBytes);
  const clean = (s) => {
    let out = '';
    for (const ch of String(s)) out += sets.r.has(ch.codePointAt(0)) ? ch : ch === '–' || ch === '—' ? '-' : '?';
    return out;
  };
  const measure = (font, size, text) => f[font].widthOfTextAtSize(clean(text), size);
  measure.clean = clean;
  return measure;
}

// pages: from buildDocument(). images: { logo: info|null, sig: info|null } from dataUrlInfo().
export async function makePdf(lib, fontkit, fontBytes, built, images, info = {}) {
  const { doc, f, sets } = await embedFonts(lib, fontkit, fontBytes);
  const { rgb, degrees } = lib;
  const clean = (s) => {
    let out = '';
    for (const ch of String(s)) out += sets.r.has(ch.codePointAt(0)) ? ch : ch === '–' || ch === '—' ? '-' : '?';
    return out;
  };
  doc.setTitle(info.title || 'Tax Invoice');
  doc.setProducer('Zaitun Billing');
  doc.setCreator('Zaitun Billing');
  doc.setCreationDate(new Date());
  const emb = {};
  for (const key of ['logo', 'sig']) {
    const im = images[key];
    if (im) emb[key] = im.type === 'png' ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes);
  }
  const H = built.pageH;
  const col = (c) => rgb(c[0], c[1], c[2]);
  for (const pg of built.pages) {
    const page = doc.addPage([built.pageW, H]);
    for (const o of pg.ops) {
      if (o.t === 'rect') {
        page.drawRectangle({ x: o.x, y: H - o.y - o.h, width: o.w, height: o.h, color: col(o.fill) });
      } else if (o.t === 'line') {
        page.drawLine({ start: { x: o.x1, y: H - o.y1 }, end: { x: o.x2, y: H - o.y2 }, thickness: o.w, color: col(o.color) });
      } else if (o.t === 'text') {
        const s = clean(o.text);
        const font = f[o.font];
        const w = font.widthOfTextAtSize(s, o.size);
        const x = o.align === 'r' ? o.x - w : o.align === 'c' ? o.x - w / 2 : o.x;
        page.drawText(s, { x, y: H - (o.y + BASE * o.size), size: o.size, font, color: col(o.color) });
      } else if (o.t === 'img') {
        if (emb[o.key]) page.drawImage(emb[o.key], { x: o.x, y: H - o.y - o.h, width: o.w, height: o.h });
      } else if (o.t === 'stamp') {
        const font = f[o.font];
        const w = font.widthOfTextAtSize(o.text, o.size);
        const th = (o.rot * Math.PI) / 180;
        const vx = w / 2, vy = o.size * 0.35;
        const x = o.cx - (vx * Math.cos(th) - vy * Math.sin(th));
        const yUp = H - o.cy - (vx * Math.sin(th) + vy * Math.cos(th));
        page.drawText(o.text, { x, y: yUp, size: o.size, font, color: col(o.color), rotate: degrees(o.rot), opacity: o.opacity });
      }
    }
  }
  return doc.save();
}
