import { h, icon, badge } from '/assets/js/ui.js';
import listPage from '/assets/js/list.js';
import detailPage from '/assets/js/pages/detail.js';
import { createItemEditor, openItemSheet } from '/assets/js/forms/item-form.js';
import { rupeesForList, gstLabel } from '/assets/js/rules.js';

const codeBadge = (r) => (r.code ? badge(`${r.kind === 'service' ? 'SAC' : 'HSN'} ${r.code}`) : badge('No code', 'warn'));

export default async function render(box, ctx, parts) {
  const id = parts[1];
  if (id) {
    return detailPage(box, ctx, id, {
      noun: 'item',
      listLabel: 'Items',
      listHref: '#/items',
      endpoint: '/api/items',
      recordKey: 'item',
      subtitle: (i) => [i.code ? `${i.kind === 'service' ? 'SAC' : 'HSN'} ${i.code}` : 'No code', gstLabel(i.gst_bp)].join(' · '),
      makeEditor: (record, onChange) => createItemEditor({ item: record, onChange }),
    });
  }
  return listPage(box, ctx, {
    title: 'Items',
    noun: 'item',
    endpoint: '/api/items',
    searchPlaceholder: 'Search name or HSN/SAC code',
    addLabel: 'Add item',
    openSheet: (prefill) => openItemSheet({ prefillName: prefill }),
    hrefFor: (r) => `#/items/${r.id}`,
    colsClass: 'cols-items',
    columns: ['Name', 'HSN/SAC', 'Type', 'Unit', 'Rate', 'GST %'],
    emptyIcon: 'items',
    emptyTitle: 'No items yet',
    emptyText: 'Add your first item, or bring in your whole list from Aeon.',
    extraEmpty: h('a', { class: 'btn btn-secondary', href: '#/settings/import' }, icon('upload'), 'Import from Aeon'),
    renderRow: (r) => ({
      main: r.name,
      sub: [r.code ? `${r.kind === 'service' ? 'SAC' : 'HSN'} ${r.code}` : 'No code', r.uom, rupeesForList(r.rate_paise), gstLabel(r.gst_bp)],
      cells: [codeBadge(r), r.kind === 'service' ? 'Service' : 'Goods', r.uom, rupeesForList(r.rate_paise), gstLabel(r.gst_bp)],
    }),
  });
}
