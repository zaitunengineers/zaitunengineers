// Loads the PDF library, the font reader and the four bill fonts the first time something is printed. Cached after that.

import { createMeasure } from './pdf.js';
import { FAMILY } from './canvas.js';

let engine = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the printing tools. Check your internet connection and try again.'));
    document.head.append(s);
  });
}

const FILES = { r: 'regular', b: 'bold', i: 'italic', bi: 'bolditalic' };
const FACE = { r: ['normal', '400'], b: ['normal', '700'], i: ['italic', '400'], bi: ['italic', '700'] };

async function init() {
  await Promise.all([loadScript('/assets/vendor/pdf-lib.min.js'), loadScript('/assets/vendor/fontkit.umd.min.js')]);
  const fontBytes = {};
  for (const k of Object.keys(FILES)) {
    const res = await fetch(`/assets/fonts/pagella-${FILES[k]}.ttf`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Could not load the bill fonts.');
    const buf = await res.arrayBuffer();
    fontBytes[k] = new Uint8Array(buf);
    const face = new FontFace(FAMILY, buf.slice(0), { style: FACE[k][0], weight: FACE[k][1] });
    await face.load();
    document.fonts.add(face);
  }
  const measure = await createMeasure(window.PDFLib, window.fontkit, fontBytes);
  return { lib: window.PDFLib, fontkit: window.fontkit, fontBytes, measure };
}

export function getEngine() {
  if (!engine) engine = init().catch((e) => { engine = null; throw e; });
  return engine;
}
