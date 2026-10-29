import { h, icon, badge } from '/assets/js/ui.js';
import { stateName } from '/assets/js/states.js';
import listPage from '/assets/js/list.js';
import detailPage from '/assets/js/pages/detail.js';
import { createClientEditor, openClientSheet } from '/assets/js/forms/client-form.js';

const place = (r) => [r.city, stateName(r.state_code)].filter(Boolean).join(' · ');

export default async function render(box, ctx, parts) {
  const id = parts[1];
  if (id) {
    return detailPage(box, ctx, id, {
      noun: 'client',
      listLabel: 'Clients',
      listHref: '#/clients',
      endpoint: '/api/clients',
      recordKey: 'client',
      subtitle: (c) => [c.gstin ? `GSTIN ${c.gstin}` : 'Unregistered', place(c)].filter(Boolean).join(' · '),
      makeEditor: (record, onChange) => createClientEditor({ client: record, onChange }),
      after: h('div', { class: 'card' }, h('h2', { text: 'Bills for this client' }), h('p', { class: 'hint', text: 'Bills arrive in Stage 3.' })),
    });
  }
  return listPage(box, ctx, {
    title: 'Clients',
    noun: 'client',
    endpoint: '/api/clients',
    searchPlaceholder: 'Search name, GSTIN, phone or city',
    addLabel: 'Add client',
    openSheet: (prefill) => openClientSheet({ prefillName: prefill }),
    hrefFor: (r) => `#/clients/${r.id}`,
    colsClass: 'cols-clients',
    columns: ['Name', 'City', 'State', 'GSTIN', 'Phone'],
    emptyIcon: 'clients',
    emptyTitle: 'No clients yet',
    emptyText: 'Add your first client, or bring in your whole list from Aeon.',
    extraEmpty: h('a', { class: 'btn btn-secondary', href: '#/settings/import' }, icon('upload'), 'Import from Aeon'),
    renderRow: (r) => ({
      main: r.name,
      sub: [place(r), r.gstin || ''].filter(Boolean),
      cells: [r.city || '', stateName(r.state_code) || '', r.gstin || badge('Unregistered', 'muted'), r.phone || r.mobile || ''],
    }),
  });
}
