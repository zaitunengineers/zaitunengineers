// Draws a layout page on a <canvas>. Same drawing steps as the PDF, so the Preview and the print match the PDF.

import { BASE } from './layout.js';

const CSS = { r: ['normal', 'normal'], b: ['normal', 'bold'], i: ['italic', 'normal'], bi: ['italic', 'bold'] };
export const FAMILY = 'ZBPagella';

const rgb = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

// scale = canvas pixels per point. images = { logo: CanvasImageSource|null, sig: CanvasImageSource|null }
export function drawPage(canvas, built, pageIndex, scale, images, measure) {
  const pg = built.pages[pageIndex];
  canvas.width = Math.round(built.pageW * scale);
  canvas.height = Math.round(built.pageH * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  for (const o of pg.ops) {
    if (o.t === 'rect') {
      ctx.fillStyle = rgb(o.fill);
      ctx.fillRect(o.x, o.y, o.w, o.h);
    } else if (o.t === 'line') {
      ctx.strokeStyle = rgb(o.color);
      ctx.lineWidth = Math.max(o.w, 0.7 / scale);
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y1);
      ctx.lineTo(o.x2, o.y2);
      ctx.stroke();
    } else if (o.t === 'text') {
      const s = measure.clean(o.text);
      const [style, weight] = CSS[o.font];
      ctx.font = `${style} ${weight} ${o.size}px ${FAMILY}`;
      ctx.fillStyle = rgb(o.color);
      const w = measure(o.font, o.size, s);
      const x = o.align === 'r' ? o.x - w : o.align === 'c' ? o.x - w / 2 : o.x;
      ctx.fillText(s, x, o.y + BASE * o.size);
    } else if (o.t === 'img') {
      const im = images[o.key];
      if (im) ctx.drawImage(im, o.x, o.y, o.w, o.h);
    } else if (o.t === 'stamp') {
      const [style, weight] = CSS[o.font];
      ctx.save();
      ctx.font = `${style} ${weight} ${o.size}px ${FAMILY}`;
      ctx.fillStyle = rgb(o.color, o.opacity);
      const w = measure(o.font, o.size, o.text);
      ctx.translate(o.cx, o.cy);
      ctx.rotate((-o.rot * Math.PI) / 180);
      ctx.fillText(o.text, -w / 2, o.size * 0.35);
      ctx.restore();
    }
  }
}
