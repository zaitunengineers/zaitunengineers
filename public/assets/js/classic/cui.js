// Aeon-style building blocks: window, buttons, grid, form rows, and the type-to-search box.

import { h } from '/assets/js/ui.js';
import { focusNext } from '/assets/js/classic/nav.js';

// ---------- window ----------
export function cwin({ title, onClose, className = '' }, ...children) {
  const x = h('button', { type: 'button', class: 'cw-x', 'aria-label': 'Close', title: 'Close (Esc)' }, '✕');
  if (onClose) x.addEventListener('click', onClose);
  const body = h('div', { class: 'cw-body' }, ...children);
  const el = h('section', { class: `cwin ${className}`.trim() }, h('div', { class: 'cw-title' }, h('span', { text: title }), x), body);
  return { el, body };
}

// ---------- buttons ----------
// hot: the letter to underline (Alt + letter presses it).
export function cbtn(label, { hot, onClick, disabled = false, note, primary = false, type = 'button', cls = '' } = {}) {
  const i = hot ? label.toLowerCase().indexOf(hot.toLowerCase()) : -1;
  const b = h('button', { type, class: `cbtn${primary ? ' primary' : ''}${disabled ? ' dim' : ''} ${cls}`.trim(), 'aria-disabled': disabled ? 'true' : null, 'data-hot': hot ? hot.toLowerCase() : null },
    i >= 0 ? [label.slice(0, i), h('u', { text: label[i] }), label.slice(i + 1)] : label);
  if (onClick) b.addEventListener('click', (e) => { if (b.getAttribute('aria-disabled') === 'true') return; onClick(e); });
  if (note) b.title = note;
  return b;
}

// Alt + letter presses the matching button inside root. Returns a function that removes the listener.
export function wireHotkeys(root) {
  const fn = (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.key.length !== 1) return;
    if (document.querySelector('.overlay')) return;
    const b = root.querySelector(`[data-hot="${e.key.toLowerCase()}"]`);
    if (b && b.offsetParent !== null) {
      e.preventDefault();
      b.click();
    }
  };
  document.addEventListener('keydown', fn);
  return () => document.removeEventListener('keydown', fn);
}

// ---------- form rows ----------
export function csec(text) {
  return h('div', { class: 'csec', text });
}

// label + control(s) on one line. errors show under the control.
export function crow(label, control, { cls = '', hint } = {}) {
  const err = h('div', { class: 'cerr', role: 'alert' });
  const el = h('label', { class: `crow ${cls}`.trim() }, h('span', { class: 'cl', text: label }), h('span', { class: 'cc' }, control, err), hint ? h('span', { class: 'chint', text: hint }) : null);
  el.setError = (msg) => {
    err.textContent = msg || '';
    const c = el.querySelector('input, select, textarea');
    if (c) c.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };
  return el;
}

export const cinput = (o = {}) => h('input', { class: 'ci', type: 'text', autocomplete: 'off', spellcheck: 'false', ...o });

// ---------- grid ----------
// columns: [{key, label, num, w, render(row)}]. footer: {key: text}.
export function cgrid({ columns, onOpen, onSelect, rowClass, emptyText = 'No records.' }) {
  const thead = h('tr', null, columns.map((c) => h('th', { class: c.num ? 'num' : '', style: null, 'data-key': c.key, text: c.label })));
  const tbody = h('tbody');
  const tfoot = h('tfoot');
  const empty = h('div', { class: 'cgrid-empty', text: emptyText, hidden: true });
  const table = h('table', { class: 'cgrid' }, h('thead', null, thead), tbody, tfoot);
  const wrap = h('div', { class: 'cgrid-wrap', tabindex: '0', role: 'grid' }, table, empty);
  let rows = [];
  let sel = -1;

  const cell = (c, row) => {
    const v = c.render ? c.render(row) : row[c.key];
    return h('td', { class: c.num ? 'num' : '' }, v == null ? '' : v);
  };

  function paintSel(scroll = true) {
    [...tbody.children].forEach((tr, i) => tr.classList.toggle('sel', i === sel));
    const tr = tbody.children[sel];
    if (tr && scroll) tr.scrollIntoView({ block: 'nearest' });
  }

  const api = {
    el: wrap,
    setRows(next, { keep = false } = {}) {
      const prevId = keep && rows[sel] ? rows[sel].id : null;
      rows = next;
      tbody.replaceChildren(
        ...rows.map((row, i) => {
          const tr = h('tr', { class: rowClass ? rowClass(row) : '', 'data-i': String(i) }, columns.map((c) => cell(c, row)));
          return tr;
        })
      );
      empty.hidden = rows.length > 0;
      sel = rows.length ? (prevId !== null ? Math.max(0, rows.findIndex((r) => r.id === prevId)) : rows.length - 1) : -1;
      paintSel();
      onSelect && onSelect(rows[sel] || null);
    },
    setFooter(map) {
      tfoot.replaceChildren(map ? h('tr', null, columns.map((c) => h('td', { class: c.num ? 'num' : '', text: map[c.key] ?? '' }))) : '');
    },
    get rows() { return rows; },
    get selected() { return rows[sel] || null; },
    select(i) {
      if (!rows.length) return;
      sel = Math.max(0, Math.min(rows.length - 1, i));
      paintSel();
      onSelect && onSelect(rows[sel]);
    },
    focus: () => wrap.focus(),
  };

  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr) api.select(Number(tr.dataset.i));
  });
  tbody.addEventListener('dblclick', (e) => {
    const tr = e.target.closest('tr');
    if (tr) {
      api.select(Number(tr.dataset.i));
      onOpen && onOpen(rows[sel]);
    }
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.target !== wrap) return;
    const page = Math.max(1, Math.floor(wrap.clientHeight / 28) - 1);
    if (e.key === 'ArrowDown') api.select(sel + 1);
    else if (e.key === 'ArrowUp') api.select(sel - 1);
    else if (e.key === 'PageDown') api.select(sel + page);
    else if (e.key === 'PageUp') api.select(sel - page);
    else if (e.key === 'Home') api.select(0);
    else if (e.key === 'End') api.select(rows.length - 1);
    else if (e.key === 'Enter') {
      if (rows[sel] && onOpen) onOpen(rows[sel]);
    } else return;
    e.preventDefault();
  });
  return api;
}

// ---------- type-to-search box ----------
// search(q) -> Promise<items>. label(item) text shown in the box. render(item) -> node or text in the list.
// onAdd(text) -> Promise<item|null> opens a quick-add and gives back the new record.
export function combo({ id, placeholder = '', search, label, render, onPick, onAdd, addLabel, value = null, cls = '', navAttr = true, minWidth }) {
  let current = value;
  let items = [];
  let active = 0;
  let timer = null;
  let navved = false;
  let seq = 0;
  let list = null;

  const input = h('input', { class: `ci combo-in ${cls}`.trim(), id, type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder, role: 'combobox', 'aria-expanded': 'false', 'aria-autocomplete': 'list', 'data-nav': navAttr ? '' : null });
  const el = h('span', { class: 'combo' }, input);
  input.value = current ? label(current) : '';

  function closeList() {
    if (list) {
      list.remove();
      list = null;
    }
    input.setAttribute('aria-expanded', 'false');
  }

  function paint(text) {
    const rowsEl = items.map((it, i) => h('div', { class: `combo-opt${i === active ? ' on' : ''}`, role: 'option', 'data-i': String(i) }, render ? render(it) : label(it)));
    const q = text.trim();
    if (onAdd && q) rowsEl.push(h('div', { class: `combo-opt add${active === items.length ? ' on' : ''}`, role: 'option', 'data-i': 'add' }, addLabel ? addLabel(q) : `+ Add new "${q}"`));
    if (!rowsEl.length) rowsEl.push(h('div', { class: 'combo-none', text: 'No match' }));
    if (!list) {
      list = h('div', { class: 'combo-list', role: 'listbox' });
      list.addEventListener('mousedown', (e) => e.preventDefault());
      list.addEventListener('click', (e) => {
        const o = e.target.closest('.combo-opt');
        if (!o) return;
        if (o.dataset.i === 'add') add();
        else pick(items[Number(o.dataset.i)], false);
      });
      document.body.append(list);
    }
    list.replaceChildren(...rowsEl);
    const r = input.getBoundingClientRect();
    const w = Math.max(r.width, minWidth || 260);
    list.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - w - 4))}px`;
    list.style.top = `${r.bottom + 1}px`;
    list.style.width = `${w}px`;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    list.style.maxHeight = `${Math.max(120, Math.min(320, spaceBelow))}px`;
    input.setAttribute('aria-expanded', 'true');
    const on = list.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  async function fetchNow(text) {
    const my = ++seq;
    let res = [];
    try {
      res = await search(text.trim());
    } catch {
      res = [];
    }
    if (my !== seq) return;
    items = res;
    active = Math.min(active, items.length);
    paint(text);
  }

  function pick(it, advance) {
    current = it;
    input.value = it ? label(it) : '';
    closeList();
    onPick && onPick(it);
    if (advance) focusNext(input);
    else input.focus();
  }

  async function add() {
    const text = input.value.trim();
    closeList();
    if (!onAdd) return;
    const made = await onAdd(text);
    if (made) pick(made, true);
    else input.focus();
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    active = 0;
    timer = setTimeout(() => fetchNow(input.value), 120);
  });
  input.addEventListener('focus', () => {
    navved = false;
    input.select();
    if (!current || input.value === label(current)) {
      // show the list when the box is entered
      clearTimeout(timer);
      timer = setTimeout(() => fetchNow(current ? '' : input.value), 0);
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      navved = true;
      if (!list) { fetchNow(input.value); return; }
      const max = items.length + (onAdd && input.value.trim() ? 1 : 0) - 1;
      active = e.key === 'ArrowDown' ? Math.min(max, active + 1) : Math.max(0, active - 1);
      paint(input.value);
    } else if (e.key === 'Enter') {
      if (!input.value.trim() && !navved) {
        closeList();
        input.dispatchEvent(new CustomEvent('combo-empty-enter', { bubbles: true }));
        e.preventDefault();
      } else if (list && (items.length || (onAdd && input.value.trim()))) {
        e.preventDefault();
        if (active >= items.length) add();
        else pick(items[active], true);
      } else if (!list && !input.value.trim()) {
        // empty box: let the form decide (Aeon: Enter on an empty goods box jumps to Remarks)
        input.dispatchEvent(new CustomEvent('combo-empty-enter', { bubbles: true }));
        e.preventDefault();
      }
    } else if (e.key === 'Escape' && list) {
      e.stopPropagation();
      e.preventDefault();
      closeList();
    } else if (e.key === 'Insert' && onAdd) {
      e.preventDefault();
      add();
    } else if (e.key === 'Tab' && list && items[active] && active < items.length && input.value !== label(current || {})) {
      // Tab accepts the highlighted match
      pick(items[active], false);
    }
  });
  input.addEventListener('blur', () => {
    clearTimeout(timer);
    setTimeout(() => {
      closeList();
      if (current) input.value = label(current);
      else if (!input.matches(':focus')) input.value = '';
    }, 120);
  });

  return {
    el,
    input,
    get: () => current,
    set(it) {
      current = it;
      input.value = it ? label(it) : '';
    },
    focus: () => input.focus(),
    destroy: closeList,
  };
}
