// The Preview window: the bill pages on screen, with copies to tick and Print / PDF / WhatsApp / Email buttons.

import { h, toast } from '/assets/js/ui.js';
import { cwin, cbtn } from '/assets/js/classic/cui.js';
import { loadPrintData, getPrefs, savePrefs, optionsFrom, buildDoc, loadImages, printNow, savePdf, shareWhatsApp, shareEmail, logPrint, copyNames } from './service.js';
import { drawPage } from './canvas.js';
import { isPhoneLike } from './dialog.js';

// query: { ids:[…] } or a date range. Resolves when the window is closed.
export function openPreview({ query, title }) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const prefs = getPrefs();
    let data = null;
    let opts = null;
    let drawn = null;
    let images = null;
    let seq = 0;
    const phone = isPhoneLike();

    const pagesBox = h('div', { class: 'cprev-pages', tabindex: '0', 'aria-label': 'Bill pages' }, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Making the bill…'));
    const info = h('span', { class: 'cnote' });
    const copyBox = h('div', { class: 'cprev-copies' });
    const zoom = h('select', { class: 'ci cprev-zoom', 'aria-label': 'Zoom' }, [['fit', 'Fit width'], ['0.75', '75 %'], ['1', '100 %'], ['1.5', '150 %']].map(([v, t]) => h('option', { value: v, text: t })));
    const busy = (b, on) => { b.disabled = on; b.classList.toggle('dim', on); };

    const act = (how, fn) => async (e) => {
      if (!data) return;
      const btn = e.currentTarget;
      busy(btn, true);
      try {
        const r = await fn();
        if (r !== 'cancelled') logPrint(data.bills.map((b) => b.id), data.bills.length > 1 ? 'bulk' : how, data.doc);
        if (how === 'pdf' && r === 'downloaded') toast('PDF downloaded', 'success');
      } catch (err) {
        toast((err && err.message) || 'Could not do that. Try again.', 'danger');
      } finally {
        busy(btn, false);
      }
    };
    const single = () => (data && data.bills.length === 1);
    const bPrint = phone ? null : cbtn('Print', { hot: 'P', primary: true, onClick: act('print', async () => { await printNow(data, opts); return 'printed'; }) });
    const bPdf = cbtn(phone ? 'PDF / Share' : 'PDF', { hot: 'D', primary: phone, onClick: act('pdf', () => savePdf(data, opts)) });
    const bWa = cbtn('WhatsApp', { hot: 'W', onClick: act('whatsapp', () => shareWhatsApp(data, opts)) });
    const bMail = cbtn('Email', { hot: 'E', onClick: act('email', () => shareEmail(data, opts)) });
    const bClose = cbtn('Close', { hot: 'C', onClick: () => close() });
    const bar = h('div', { class: 'cprev-bar' }, copyBox, zoom, h('div', { class: 'cprev-btns' }, bPrint, bPdf, bWa, bMail, bClose));

    const win = cwin({ title: title || 'Preview', onClose: () => close(), className: 'cprev' }, bar, pagesBox, h('div', { class: 'cprev-foot' }, info));
    const overlay = h('div', { class: 'overlay cprev-ov' }, win.el);

    function cssWidth() {
      const avail = Math.max(260, pagesBox.clientWidth - 24);
      const z = zoom.value;
      return z === 'fit' ? Math.min(avail, 860) : Math.round(595.5 * 1.3333 * Number(z));
    }
    function paint() {
      if (!drawn) return;
      const w = cssWidth();
      const scale = Math.min(3, (window.devicePixelRatio || 1) * (w / 595.5));
      const canvases = drawn.built.pages.map((pg, i) => {
        const c = h('canvas', { class: 'cprev-pg', role: 'img', 'aria-label': `${data.doc === 'challan' ? 'Challan' : 'Bill'} ${pg.billNo}, ${pg.copy}, page ${i + 1}` });
        drawPage(c, drawn.built, i, scale, images, drawn.eng.measure);
        c.style.width = `${w}px`;
        c.style.height = `${Math.round((w * 842.25) / 595.5)}px`;
        return c;
      });
      pagesBox.replaceChildren(...canvases);
      info.textContent = `${canvases.length} page${canvases.length === 1 ? '' : 's'}${data.bills.length > 1 ? `, ${data.bills.length} bills` : ''}`;
    }
    async function rebuild() {
      const my = ++seq;
      try {
        opts = optionsFrom(data, prefs);
        const d = await buildDoc(data, opts);
        if (my !== seq) return;
        drawn = d;
        paint();
      } catch (err) {
        pagesBox.replaceChildren(h('p', { class: 'cerr', text: (err && err.message) || 'Could not make the preview.' }));
      }
    }
    function drawCopies() {
      const names = copyNames(data.settings);
      copyBox.replaceChildren(h('span', { text: 'Copies:' }), ...names.map((n, i) => {
        const t = h('input', { type: 'checkbox', checked: !!prefs.copies[i], 'aria-label': n });
        t.addEventListener('change', () => {
          prefs.copies[i] = t.checked;
          if (!prefs.copies.some(Boolean)) { prefs.copies[i] = true; t.checked = true; }
          savePrefs(prefs);
          rebuild();
        });
        return h('label', { class: 'cinline' }, t, n);
      }));
    }

    function close() {
      seq++;
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      overlay.remove();
      if (before && before.focus) before.focus();
      resolve();
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
        const b = { p: bPrint, d: bPdf, w: bWa, e: bMail, c: bClose }[e.key.toLowerCase()];
        if (b) { e.preventDefault(); b.click(); }
      }
    };
    let rt = null;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(paint, 150); };
    zoom.addEventListener('change', paint);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    document.body.append(overlay);
    pagesBox.focus();

    (async () => {
      try {
        data = await loadPrintData(query);
        win.el.querySelector('.cw-title span').textContent = title || (data.doc === 'challan' ? (data.bills.length === 1 ? `Preview - ${data.bills[0].kind === 'proforma' ? 'Proforma' : 'Challan'} No. ${data.bills[0].bill_no}` : `Preview - ${data.bills.length} challans`) : data.bills.length === 1 ? `Preview - Invoice No. ${data.bills[0].bill_no}` : `Preview - ${data.bills.length} bills`);
        images = await loadImages(data.firm);
        drawCopies();
        if (!single()) { bWa.classList.add('dim'); bWa.setAttribute('aria-disabled', 'true'); bWa.title = 'WhatsApp sends one bill at a time.'; bMail.classList.add('dim'); bMail.setAttribute('aria-disabled', 'true'); bMail.title = 'Email sends one bill at a time.'; }
        await rebuild();
      } catch (err) {
        pagesBox.replaceChildren(h('p', { class: 'cerr', text: (err && err.message) || 'Could not open the preview.' }));
      }
    })();
  });
}
