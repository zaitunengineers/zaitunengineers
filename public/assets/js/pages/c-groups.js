// Item/Service Group Master: a short list with a small add/rename box.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast, sheet } from '/assets/js/ui.js';
import { cbtn, crow, cinput } from '/assets/js/classic/cui.js';
import { masterList } from '/assets/js/classic/masterlist.js';

function askName(initial) {
  return new Promise((resolve) => {
    const input = cinput({ maxlength: 40, value: initial || '' });
    const row = crow('Group Name', input);
    let done = false;
    const finish = (v) => { if (!done) { done = true; s.close(); resolve(v); } };
    const ok = h('button', { type: 'button', class: 'btn btn-primary', text: 'Save' });
    const no = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    ok.addEventListener('click', () => { if (input.value.trim().length < 2) { row.setError('Enter the group name.'); return; } finish(input.value); });
    no.addEventListener('click', () => finish(null));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } });
    const s = sheet({ title: initial ? 'Edit Group' : 'Add Group', body: row, footer: [no, ok], requestClose: () => { finish(null); return false; } });
    input.select();
  });
}

export default async function render(box, ctx) {
  let reload = null;
  const call = async (method, path, body) => {
    try {
      await api(method, path, body);
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save. Try again.', 'danger');
      return false;
    }
  };
  const page = await masterList(box, ctx, {
    title: 'Item/Service Group Master',
    endpoint: '/api/item-groups',
    noun: 'group',
    placeholder: 'Search',
    onAdd: async () => {
      const name = await askName('');
      if (name && (await call('POST', '/api/item-groups', { name }))) ctx.reload();
    },
    onEdit: async (r) => {
      const name = await askName(r.name);
      if (name && (await call('PUT', `/api/item-groups/${r.id}`, { name }))) ctx.reload();
    },
    columns: [{ key: 'name', label: 'Group Name' }, { key: 'items', label: 'Items', num: true }],
    exportName: 'Item-Groups.xlsx',
    exportHeaders: ['Group Name', 'Items'],
    exportRow: (r) => [r.name, r.items],
  });
  void reload;
  return page;
}
