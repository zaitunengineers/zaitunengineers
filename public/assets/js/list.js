// The list page shared by Clients and Items: title with count, search box, filter chips,
// phone cards / laptop table, "Load more", empty and no-result states.

import { api, ApiError } from '/assets/js/api.js';
import { h, icon, chips, setButtonLoading } from '/assets/js/ui.js';

// cfg: {title, noun, endpoint, searchPlaceholder, addLabel, openSheet(prefillName), hrefFor(row), colsClass, columns:[label],
//       renderRow(row) -> {main: node|string, sub: string, cells: [node|string]}, emptyIcon, emptyTitle, emptyText, extraEmpty: [nodes]}
export default async function listPage(box, ctx, cfg) {
  const state = { q: '', show: 'active', rows: [], more: false, total: 0, seq: 0, loading: false };

  const title = h('h1', { text: cfg.title });
  const addBtn = h('button', { type: 'button', class: 'btn btn-primary add-desktop' }, icon('plus'), cfg.addLabel);
  const search = h('input', { class: 'input search', type: 'search', placeholder: cfg.searchPlaceholder, 'aria-label': 'Search', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: 60 });
  const searchBox = h('div', { class: 'searchbox' }, icon('search'), search);
  const filter = chips({
    label: 'Show',
    options: [{ value: 'active', label: 'Active' }, { value: 'hidden', label: 'Hidden' }, { value: 'all', label: 'All' }],
    value: 'active',
    onChange: (v) => { state.show = v; reload(); },
  });
  const head = h('div', { class: `dhead ${cfg.colsClass}`, 'aria-hidden': 'true' }, h('div', { text: cfg.columns[0] }), cfg.columns.slice(1).map((c) => h('div', { text: c })));
  const rowsBox = h('div', { class: 'drows' });
  const table = h('div', { class: 'dtable', hidden: true }, head, rowsBox);
  const more = h('button', { type: 'button', class: 'btn btn-secondary', hidden: true }, 'Load more');
  const status = h('div', { class: 'list-status' });
  const toolbar = h('div', { class: 'toolbar' }, searchBox, filter.el);

  box.append(h('div', { class: 'page-head' }, h('div', null, title), addBtn), toolbar, status, table, h('div', { class: 'row-center' }, more));

  const renderRow = (row) => {
    const r = cfg.renderRow(row);
    return h(
      'a',
      { class: `drow ${cfg.colsClass}${row.active === 0 ? ' dim' : ''}`, href: cfg.hrefFor(row) },
      h('div', { class: 'c-main' }, r.main, row.active === 0 ? h('span', { class: 'badge muted', text: 'Hidden' }) : null),
      h('div', { class: 'c-sub' }, Array.isArray(r.sub) ? r.sub.join(' · ') : r.sub),
      r.cells.map((c) => h('div', { class: 'c-d' }, c))
    );
  };

  function paintStatus() {
    status.replaceChildren();
    const none = state.rows.length === 0;
    table.hidden = none;
    more.hidden = !state.more;
    if (!none) return;
    if (state.q) {
      status.append(
        h('div', { class: 'card empty' }, h('div', { class: 'ico' }, icon('search')), h('h2', { text: `Nothing matches “${state.q}”` }),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => add(state.q) }, icon('plus'), `Add “${state.q}” as a new ${cfg.noun}`))
      );
    } else if (state.show === 'active') {
      status.append(
        h('div', { class: 'card empty' }, h('div', { class: 'ico' }, icon(cfg.emptyIcon)), h('h2', { text: cfg.emptyTitle }), h('p', { text: cfg.emptyText }),
          h('div', { class: 'btns' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => add('') }, icon('plus'), cfg.addLabel), cfg.extraEmpty || null))
      );
    } else {
      status.append(h('p', { class: 'hint', text: state.show === 'hidden' ? 'No hidden records.' : 'Nothing here yet.' }));
    }
  }

  function paintTitle() {
    title.textContent = `${cfg.title} · ${state.total}`;
  }

  async function load(append) {
    const seq = ++state.seq;
    const params = new URLSearchParams({ show: state.show, offset: String(append ? state.rows.length : 0) });
    if (state.q) params.set('q', state.q);
    state.loading = true;
    if (!append) status.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading…'));
    try {
      const data = await api('GET', `${cfg.endpoint}?${params}`);
      if (seq !== state.seq) return; // a newer search is already running
      state.rows = append ? state.rows.concat(data.rows) : data.rows;
      state.more = data.more;
      state.total = data.total;
      if (!append) rowsBox.replaceChildren();
      for (const r of data.rows) rowsBox.append(renderRow(r));
      paintTitle();
      paintStatus();
    } catch (e) {
      if (seq !== state.seq) return;
      status.replaceChildren(h('div', { class: 'card stack' }, h('p', { text: e instanceof ApiError ? e.message : 'Could not load.' }), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => load(append) }, 'Try again')));
    } finally {
      if (seq === state.seq) state.loading = false;
    }
  }
  const reload = () => load(false);

  async function add(prefill) {
    const saved = await cfg.openSheet(prefill || '');
    if (saved) {
      ctx.toast(`${cfg.noun.charAt(0).toUpperCase() + cfg.noun.slice(1)} added`, 'success');
      if (state.q) { search.value = ''; state.q = ''; }
      reload();
    }
  }

  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = search.value.trim();
      if (q === state.q) return;
      state.q = q;
      reload();
    }, 250);
  });
  more.addEventListener('click', async () => {
    setButtonLoading(more, true, 'Loading');
    try { await load(true); } finally { setButtonLoading(more, false, 'Load more'); }
  });
  addBtn.addEventListener('click', () => add(''));
  ctx.setFab({ label: cfg.addLabel, onClick: () => add('') });

  const onKey = (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if (document.querySelector('.overlay')) return;
    if (e.key === '/' && !typing) { e.preventDefault(); search.focus(); }
    else if (e.key === 'Insert') { e.preventDefault(); add(''); }
  };
  document.addEventListener('keydown', onKey);

  await reload();
  return { destroy: () => { document.removeEventListener('keydown', onKey); clearTimeout(timer); state.seq++; } };
}
