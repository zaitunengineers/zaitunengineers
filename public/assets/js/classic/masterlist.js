// The Aeon-style master list: search, grid and the buttons down the right.
// Used by Account Master, Item/Service Master and (with small changes) Transport and Group Master.

import { api, ApiError } from '/assets/js/api.js';
import { h, toast, confirmDialog, choiceDialog } from '/assets/js/ui.js';
import { cwin, cgrid, cbtn, wireHotkeys } from '/assets/js/classic/cui.js';
import { exportSheet } from '/assets/js/classic/xl.js';

// cfg: {title, endpoint, noun, columns, placeholder, hint, onAdd(), onEdit(row), canHide, exportName, exportHeaders, exportRow(row),
//       importHref, rowClass, apiLimit}
export async function masterList(box, ctx, cfg) {
  const state = { q: '', hidden: false, rows: [], seq: 0 };
  const search = h('input', { class: 'ci search', type: 'search', placeholder: cfg.placeholder || 'Search', 'aria-label': 'Search', autocomplete: 'off', maxlength: 60 });
  const hiddenTick = h('input', { type: 'checkbox', id: 'show-hidden' });
  const count = h('span', { class: 'cnote' });
  const grid = cgrid({
    columns: cfg.columns,
    onOpen: (row) => cfg.onEdit && cfg.onEdit(row),
    rowClass: (r) => (r.active === 0 ? 'dim' : ''),
    emptyText: `No ${cfg.noun}s found.`,
  });

  async function load() {
    const my = ++state.seq;
    const params = new URLSearchParams({ show: state.hidden ? 'all' : 'active', limit: '500' });
    if (state.q) params.set('q', state.q);
    let rows = [];
    try {
      for (let offset = 0; ; ) {
        params.set('offset', String(offset));
        const data = await api('GET', `${cfg.endpoint}?${params}`);
        if (my !== state.seq) return;
        rows = rows.concat(data.rows);
        offset = rows.length;
        if (!data.more || rows.length > 5000) break;
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not load the list.', 'danger');
      return;
    }
    state.rows = cfg.prepare ? cfg.prepare(rows) : rows;
    grid.setRows(state.rows);
    count.textContent = `${state.rows.length} ${cfg.noun}${state.rows.length === 1 ? '' : 's'}`;
  }

  async function del() {
    const row = grid.selected;
    if (!row) return;
    const sure = await confirmDialog({ title: 'Delete', message: `Delete ${cfg.noun} "${row.name}"?`, confirmText: 'Delete', cancelText: 'No', danger: true });
    if (!sure) return;
    try {
      await api('DELETE', `${cfg.endpoint}/${row.id}`);
      toast(`${cfg.noun[0].toUpperCase() + cfg.noun.slice(1)} deleted`, 'success');
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && cfg.canHide) {
        const hide = await choiceDialog({ title: 'Cannot delete', message: `${e.message}\nHide "${row.name}" instead? It stays on old bills and disappears from lists.`, actions: [{ label: 'Leave it', value: false }, { label: 'Hide', value: true, kind: 'primary' }] });
        if (hide) {
          try {
            await api('PUT', `${cfg.endpoint}/${row.id}`, { active: 0 });
            toast('Hidden', 'success');
            await load();
          } catch (e2) {
            toast(e2 instanceof ApiError ? e2.message : 'Could not hide it.', 'danger');
          }
        }
      } else toast(e instanceof ApiError ? e.message : 'Could not delete it.', 'danger');
    }
  }

  async function exportNow() {
    try {
      await exportSheet(cfg.exportName, cfg.exportHeaders, state.rows.map(cfg.exportRow), cfg.title);
      toast('Excel file downloaded', 'success');
    } catch {
      toast('Could not make the Excel file.', 'danger');
    }
  }

  const grey = (label, note = 'Not in this app yet. Tell me if you need it.') => cbtn(label, { disabled: true, onClick: () => toast(note) });
  const side = h(
    'div',
    { class: 'cside' },
    cbtn('Add', { hot: 'A', onClick: () => cfg.onAdd() }),
    cbtn('Edit', { hot: 'E', onClick: () => grid.selected && cfg.onEdit(grid.selected) }),
    cbtn('Delete', { hot: 'D', onClick: del }),
    cfg.importHref ? grey('Import from Another Firm') : null,
    cfg.importHref ? cbtn('Import', { hot: 'I', onClick: () => ctx.navigate(cfg.importHref) }) : null,
    cfg.exportName ? cbtn('Export', { hot: 'x', onClick: exportNow }) : null,
    cbtn('Close', { hot: 'C', onClick: () => ctx.close() })
  );

  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = search.value.trim();
      load();
    }, 250);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); grid.focus(); }
    else if (e.key === 'Enter' && grid.selected) { e.preventDefault(); cfg.onEdit(grid.selected); }
  });
  hiddenTick.addEventListener('change', () => {
    state.hidden = hiddenTick.checked;
    load();
  });

  const win = cwin({ title: cfg.title, onClose: () => ctx.close(), className: 'wide' },
    h('div', { class: 'ctools' }, h('span', { text: 'Search :' }), search, cfg.canHide ? h('label', null, hiddenTick, 'Show hidden') : null, count),
    h('div', { class: 'clist' }, h('div', null, grid.el, h('div', { class: 'chintline', text: cfg.hint || "Press 'INSERT' for add new record" })), side));
  box.append(win.el);

  const offKeys = wireHotkeys(box);
  const onKey = (e) => {
    if (e.key === 'Insert' && !document.querySelector('.overlay')) {
      e.preventDefault();
      cfg.onAdd();
    }
  };
  document.addEventListener('keydown', onKey);
  await load();
  setTimeout(() => (document.activeElement === document.body ? grid.focus() : null), 0);
  return { destroy: () => { offKeys(); document.removeEventListener('keydown', onKey); clearTimeout(timer); state.seq++; } };
}
