// Saved Documents (F9): the bills you printed or shared. No PDF is kept; Open makes it fresh again, like Aeon.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast, formatDateTime } from '/assets/js/ui.js';
import { cwin, cbtn, cgrid, wireHotkeys } from '/assets/js/classic/cui.js';
import { openPreview } from '/assets/js/print/preview.js';

const HOW = { print: 'Printed', pdf: 'PDF made', whatsapp: 'WhatsApp', email: 'Email', bulk: 'Bulk Bill', preview: 'Preview' };

export default async function render(box, ctx) {
  let next = null;
  let rows = [];
  const grid = cgrid({
    columns: [{ key: 'when', label: 'Date and Time' }, { key: 'what', label: 'What' }, { key: 'nos', label: 'Bill / Challan No.' }, { key: 'party', label: 'Party Name' }],
    emptyText: 'Nothing has been printed or shared yet.',
    onOpen: (r) => open(r),
  });
  const more = cbtn('Load More', { hot: 'L', onClick: () => load() });
  more.hidden = true;

  function nosText(d) {
    const n = Array.isArray(d.bill_nos) ? d.bill_nos : Array.isArray(d.nos) ? d.nos : [];
    if (!n.length) return '';
    const w = d.doc === 'challan' ? (d.kind === 'proforma' ? 'proforma invoices' : 'challans') : 'bills';
    return n.length > 4 ? `${n.length} ${w} (${n[0]} to ${n[n.length - 1]})` : n.join(', ');
  }
  async function load() {
    try {
      const data = await api('GET', `/api/activity?action=bill_print,challan_print${next ? `&before=${next}` : ''}`);
      for (const it of data.items) {
        let d = {};
        try { d = JSON.parse(it.details || '{}') || {}; } catch { d = {}; }
        if (!Array.isArray(d.ids) || !d.ids.length) continue;
        const ch = d.doc === 'challan';
        rows.push({ id: it.id, ids: d.ids, doc: ch ? 'challan' : 'bill', when: formatDateTime(it.at), what: HOW[d.how] || d.how || '', nos: nosText(d), party: d.party || (d.count > 1 ? `${d.count} ${ch ? 'challans' : 'bills'}` : '') });
      }
      next = data.next;
      more.hidden = !next;
      grid.setRows(rows.slice(), { keep: true });
      if (rows.length && !grid.selected) grid.select(0);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not load the list.', 'danger');
    }
  }
  function open(r) {
    if (!r) { toast('Select a line first.'); return; }
    openPreview({ query: { ids: r.ids.slice(0, 100), doc: r.doc } });
  }

  const side = h('div', { class: 'cside' },
    cbtn('Open', { hot: 'O', primary: true, onClick: () => open(grid.selected) }),
    more,
    cbtn('Back', { hot: 'B', onClick: () => ctx.navigate('#/home') }),
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() }));
  const win = cwin({ title: 'Saved Documents', onClose: () => ctx.close(), className: 'wide' },
    h('div', { class: 'clist' }, h('div', null, grid.el, h('div', { class: 'chintline', text: "PDFs are not stored. 'Open' makes the bill again from the saved bill, like Aeon." })), side));
  box.append(win.el);
  const offKeys = wireHotkeys(box);
  await load();
  setTimeout(() => grid.focus(), 0);
  return { destroy: offKeys, back: () => '#/home' };
}
