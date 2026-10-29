// App shell: menu, hash routes, leave-page guard, auto logout.

import { api } from '/assets/js/api.js';
import { h, icon, toast, confirmDialog } from '/assets/js/ui.js';
import { createClassicShell } from '/assets/js/classic/shell.js';
import { cwin } from '/assets/js/classic/cui.js';

const NAV = [
  { key: 'home', label: 'Home', icon: 'home', href: '#/home' },
  { key: 'bills', label: 'Bills', icon: 'bills', href: '#/sales' },
  { key: 'clients', label: 'Clients', icon: 'clients', href: '#/clients' },
  { key: 'items', label: 'Items', icon: 'items', href: '#/items' },
  { key: 'settings', label: 'Settings', icon: 'settings', href: '#/settings' },
];


const PAGES = {
  chome: () => import('/assets/js/pages/c-home.js'),
  sales: () => import('/assets/js/pages/c-sales.js'),
  sale: () => import('/assets/js/pages/c-sale.js'),
  accounts: () => import('/assets/js/pages/c-accounts.js'),
  itemmaster: () => import('/assets/js/pages/c-items.js'),
  transport: () => import('/assets/js/pages/c-transport.js'),
  groups: () => import('/assets/js/pages/c-groups.js'),
  fy: () => import('/assets/js/pages/c-fy.js'),
  billbook: () => import('/assets/js/pages/c-billbook.js'),
  gensetting: () => import('/assets/js/pages/c-gensetting.js'),
  bulkbill: () => import('/assets/js/pages/c-bulkbill.js'),
  saveddocs: () => import('/assets/js/pages/c-saveddocs.js'),
  msgsetting: () => import('/assets/js/pages/c-msgsetting.js'),
  digisign: () => import('/assets/js/pages/c-digisign.js'),
  challans: () => import('/assets/js/pages/c-challans.js'),
  challan: () => import('/assets/js/pages/c-challan.js'),
  dcregister: () => import('/assets/js/pages/c-dcregister.js'),
  home: () => import('/assets/js/pages/home.js'),
  firm: () => import('/assets/js/pages/firm.js'),
  settings: () => import('/assets/js/pages/settings.js'),
  soon: () => import('/assets/js/pages/soon.js'),
  clients: () => import('/assets/js/pages/clients.js'),
  items: () => import('/assets/js/pages/items.js'),
  transporters: () => import('/assets/js/pages/transporters.js'),
  import: () => import('/assets/js/pages/import.js'),
};

const state = { me: null, current: null, hash: '', token: 0, classic: true };
let classicShell = null;
let view;
let fab;
let shell;
let sidebarName;
let topName;

// ---------- boot ----------
async function boot() {
  const me = await api('GET', '/api/me');
  state.me = me;
  state.classic = (me.settings && me.settings.ui_theme) !== 'modern';
  document.documentElement.setAttribute('data-ui', state.classic ? 'classic' : 'modern');
  try {
    localStorage.setItem('zb_ui', state.classic ? 'classic' : 'modern');
  } catch { /* storage blocked */ }
  if (state.classic) buildClassic(me);
  else buildShell(me);
  startTimers(me);
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('beforeunload', (e) => {
    if (state.current && state.current.canLeave && !state.current.canLeave()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/home');
  state.hash = location.hash;
  await renderRoute();
}

function buildClassic() {
  classicShell = createClassicShell({
    state,
    navigate: (hash) => { location.hash = hash; },
    reload: () => renderRoute(),
    logout: () => logout(),
    toast,
    setTheme,
    get f2() { return pageF2; },
  });
  view = classicShell.view;
  shell = classicShell.el;
  fab = h('button', { type: 'button', hidden: true });
  document.getElementById('app').replaceChildren(shell);
}

async function setTheme(ui) {
  if (state.current && state.current.canLeave && !state.current.canLeave()) {
    toast('Save or discard your changes first.', 'warning');
    return;
  }
  try {
    await api('PUT', '/api/settings', { ui_theme: ui });
    try {
      localStorage.setItem('zb_ui', ui);
    } catch { /* storage blocked */ }
    location.reload();
  } catch (e) {
    toast((e && e.message) || 'Could not change the theme.', 'danger');
  }
}

async function refreshMe() {
  try {
    const me = await api('GET', '/api/me');
    state.me = { ...state.me, ...me };
    if (classicShell) classicShell.paintStrip();
  } catch { /* keep what we had */ }
}

let pageF2 = null;

function firmLabel() {
  return state.me.firmName || 'Zaitun Engineers';
}

function setFirmName(name) {
  state.me.firmName = name || '';
  if (classicShell) return classicShell.paintStrip();
  sidebarName.textContent = firmLabel();
  topName.textContent = firmLabel();
}

// ---------- shell ----------
function navLinks(cls, withLabel) {
  return NAV.map((n) =>
    h('a', { class: cls, href: n.href, 'data-key': n.key }, icon(n.icon), withLabel ? h('span', { text: n.label }) : null)
  );
}

function buildShell(me) {
  sidebarName = h('div', { class: 'name', text: firmLabel() });
  topName = h('div', { class: 'title', text: firmLabel() });

  const sidebar = h(
    'aside',
    { class: 'sidebar' },
    h('div', { class: 'brand' }, h('img', { class: 'logo-mark', src: '/assets/img/logo-sample.svg', alt: '' }), h('div', null, sidebarName, h('div', { class: 'cap', text: 'Billing' }))),
    h('nav', { 'aria-label': 'Main' }, navLinks('navlink', true)),
    h(
      'div',
      { class: 'foot' },
      h('div', { class: 'who', text: `Signed in as ${me.username}` }),
      h('button', { type: 'button', onclick: logout }, icon('logout'), 'Log out')
    )
  );

  // phone/tablet top bar with account menu
  const menuBtn = h('button', { type: 'button', class: 'avatar', 'aria-label': 'Account menu', 'aria-haspopup': 'true', 'aria-expanded': 'false', text: me.username.charAt(0).toUpperCase() });
  const menu = h(
    'div',
    { class: 'menu', role: 'menu', hidden: true },
    h('div', { class: 'who', text: `Signed in as ${me.username}` }),
    h('a', { href: '#/settings', role: 'menuitem' }, icon('settings'), 'Settings'),
    h('button', { type: 'button', role: 'menuitem', onclick: logout }, icon('logout'), 'Log out')
  );
  const closeMenu = () => {
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
  };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });

  const topbar = h('header', { class: 'topbar' }, h('img', { class: 'logo-mark', src: '/assets/img/logo-sample.svg', alt: '' }), topName, menuBtn, menu);

  const bottom = h(
    'nav',
    { class: 'bottombar', 'aria-label': 'Main' },
    ...NAV.slice(0, 4).map((n) => h('a', { href: n.href, 'data-key': n.key }, icon(n.icon), h('span', { text: n.label }))),
    h('a', { href: '#/settings', 'data-key': 'settings' }, icon('more'), h('span', { text: 'More' }))
  );

  fab = h('button', { type: 'button', class: 'fab', 'aria-label': 'New bill' }, icon('plus'), 'New bill');
  fab.addEventListener('click', () => (fabAction ? fabAction() : (location.hash = '#/sales/new')));

  view = h('main', { class: 'main', id: 'view', tabindex: '-1' });
  shell = h('div', { class: 'shell', 'data-route': 'home' }, sidebar, h('div', { class: 'main-wrap' }, topbar, view), bottom, fab);
  document.getElementById('app').replaceChildren(shell);
}

function markActive(key) {
  if (classicShell) return classicShell.markActive(key);
  shell.setAttribute('data-route', key);
  for (const a of shell.querySelectorAll('[data-key]')) {
    if (a.getAttribute('data-key') === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

// The round button on a phone. Most pages show "New bill" (not ready until Stage 3);
// list pages turn it into "Add client" / "Add item"; settings and form pages hide it.
let fabAction = null;
function setFab(cfg) {
  fabAction = null;
  if (state.classic) return;
  fab.hidden = false;
  if (cfg === false) {
    fab.hidden = true;
  } else if (cfg) {
    fabAction = cfg.onClick;
    fab.removeAttribute('aria-disabled');
    fab.setAttribute('aria-label', cfg.label);
    fab.replaceChildren(icon('plus'), cfg.label);
  } else {
    fab.removeAttribute('aria-disabled');
    fab.setAttribute('aria-label', 'New bill');
    fab.replaceChildren(icon('plus'), 'New bill');
  }
}

// ---------- routing ----------
function parseHash(hash) {
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

async function onHashChange() {
  const next = location.hash;
  if (state.current && state.current.canLeave && !state.current.canLeave()) {
    const leave = await confirmDialog({
      title: 'Leave without saving?',
      message: 'You have changes that are not saved. If you leave now they will be lost.',
      confirmText: 'Leave',
      cancelText: 'Stay',
      danger: true,
    });
    if (!leave) {
      history.replaceState(null, '', state.hash);
      return;
    }
  }
  state.hash = next;
  await renderRoute();
}

const LEGACY_TITLES = { clients: 'Clients', items: 'Items' };

// Pages that were built for the Modern look are shown inside an Aeon-style window when the theme is Classic.
function framed(title, run) {
  return async (c) => {
    if (!state.classic) return run(c);
    const win = cwin({ title, onClose: () => { location.hash = '#/home'; } });
    c.append(win.el);
    return run(win.body);
  };
}

async function renderRoute() {
  let parts = parseHash(location.hash);
  let key = parts[0] || 'home';
  // The two looks name a few screens differently.
  if (state.classic && (key === 'clients' || key === 'items')) {
    history.replaceState(null, '', `#/${key === 'clients' ? 'accounts' : 'itemmaster'}${parts[1] ? '/' + parts[1] : ''}`);
    parts = parseHash(location.hash);
    key = parts[0];
  } else if (!state.classic && (key === 'accounts' || key === 'itemmaster' || key === 'transport')) {
    const to = key === 'accounts' ? '#/clients' : key === 'itemmaster' ? '#/items' : '#/settings/transporters';
    history.replaceState(null, '', `${to}${parts[1] && key !== 'transport' ? '/' + parts[1] : ''}`);
    parts = parseHash(location.hash);
    key = parts[0];
  }
  const sub = parts[1] || '';
  const token = ++state.token;

  if (state.current && state.current.destroy) state.current.destroy();
  state.current = null;
  pageF2 = null;
  markActive(key === 'sales' ? 'bills' : NAV.some((n) => n.key === key) ? key : state.classic ? key : 'home');
  view.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading…'));

  setFab(null);
  const ctx = {
    me: state.me,
    classic: state.classic,
    setFirmName,
    setFab,
    toast,
    refreshMe,
    navigate: (hash) => { location.hash = hash; },
    reload: () => renderRoute(),
    setF2: (fn) => { pageF2 = fn; },
    settings: () => state.me.settings,
    close: () => { location.hash = '#/home'; },
  };
  let page;
  try {
    if (key === 'sales') {
      if (sub === '' || sub === 'cancelled') {
        const mod = await PAGES.sales();
        page = { title: sub ? 'Sale (Cancel)' : 'Sales', run: (c) => mod.default(c, ctx, { cancelled: sub === 'cancelled' }) };
      } else if (sub === 'bulk') {
        const mod = await PAGES.bulkbill();
        page = { title: 'Bulk Bill', run: (c) => mod.default(c, ctx) };
      } else {
        const mod = await PAGES.sale();
        page = { title: 'Sales', run: (c) => mod.default(c, ctx, sub) };
      }
    } else if (key === 'dc' || key === 'proforma') {
      const kindKey = key === 'proforma' ? 'proforma' : sub;
      const rest = key === 'proforma' ? parts[1] : parts[2];
      if (key === 'dc' && sub === 'register') {
        const mod = await PAGES.dcregister();
        page = { title: 'Pending/Over/All Register', run: (c) => mod.default(c, ctx) };
      } else if (['general', 'issue', 'receive', 'opening', 'proforma'].includes(kindKey)) {
        if (!rest) {
          const mod = await PAGES.challans();
          page = { title: 'Challans', run: (c) => mod.default(c, ctx, kindKey) };
        } else {
          const mod = await PAGES.challan();
          page = { title: 'Challan', run: (c) => mod.default(c, ctx, kindKey, rest) };
        }
      } else {
        history.replaceState(null, '', '#/home');
        const mod = state.classic ? await PAGES.chome() : await PAGES.home();
        page = { title: 'Home', run: (c) => mod.default(c, ctx) };
      }
    } else if (key === 'bulkchallan') {
      const mod = await PAGES.bulkbill();
      page = { title: 'Bulk Print', run: (c) => mod.default(c, ctx, ['general', 'issue', 'receive', 'opening', 'proforma'].includes(sub) ? sub : 'general') };
    } else if (key === 'accounts') {
      const mod = await PAGES.accounts();
      page = { title: 'Account Master', run: (c) => mod.default(c, ctx, parts) };
    } else if (key === 'itemmaster') {
      const mod = await PAGES.itemmaster();
      page = { title: 'Item/Service Master', run: (c) => mod.default(c, ctx, parts) };
    } else if (key === 'transport') {
      const mod = await PAGES.transport();
      page = { title: 'Transport Master', run: (c) => mod.default(c, ctx, parts) };
    } else if (key === 'groups') {
      const mod = await PAGES.groups();
      page = { title: 'Item/Service Group Master', run: (c) => mod.default(c, ctx) };
    } else if (key === 'fy') {
      const mod = await PAGES.fy();
      page = { title: 'Change Firm/Year', run: (c) => mod.default(c, ctx) };
    } else if (key === 'billbook') {
      const mod = await PAGES.billbook();
      page = { title: 'Bill Book Master', run: (c) => mod.default(c, ctx) };
    } else if (key === 'gensetting') {
      const mod = await PAGES.gensetting();
      page = { title: 'General Setting', run: (c) => mod.default(c, ctx) };
    } else if (key === 'saveddocs') {
      const mod = await PAGES.saveddocs();
      page = { title: 'Saved Documents', run: (c) => mod.default(c, ctx) };
    } else if (key === 'msgsetting') {
      const mod = await PAGES.msgsetting();
      page = { title: 'Email/WhatsApp/ftp Settings', run: (c) => mod.default(c, ctx) };
    } else if (key === 'digisign') {
      const mod = await PAGES.digisign();
      page = { title: 'Digital Signature', run: (c) => mod.default(c, ctx) };
    } else if (key === 'clients' || key === 'items') {
      const mod = await PAGES[key]();
      page = { title: LEGACY_TITLES[key], run: (c) => mod.default(c, ctx, parts) };
    } else if (key === 'settings' && sub === 'transporters') {
      const mod = await PAGES.transporters();
      page = { title: 'Transporters', run: (c) => mod.default(c, ctx) };
    } else if (key === 'settings' && sub === 'import') {
      const mod = await PAGES.import();
      page = { title: 'Import from Aeon', run: framed('Import from Aeon', (c) => mod.default(c, ctx)) };
    } else if (key === 'settings' && sub === 'firm') {
      const mod = await PAGES.firm();
      page = { title: 'Firm Master', run: framed('Firm Master', (c) => mod.default(c, ctx)) };
    } else if (key === 'settings' && sub === 'password') {
      const mod = await PAGES.settings();
      page = { title: 'Change password', run: framed('Change Password', (c) => mod.password(c, ctx)) };
    } else if (key === 'settings' && sub === 'activity') {
      const mod = await PAGES.settings();
      page = { title: 'Activity Log', run: framed('Activity Log', (c) => mod.activity(c, ctx)) };
    } else if (key === 'settings') {
      const mod = await PAGES.settings();
      page = { title: 'Settings', run: framed('Settings', (c) => mod.default(c, ctx)) };
    } else {
      if (key !== 'home') history.replaceState(null, '', '#/home');
      const mod = state.classic ? await PAGES.chome() : await PAGES.home();
      page = { title: 'Home', run: (c) => mod.default(c, ctx) };
    }
    document.title = `${page.title} · Zaitun Billing`;
    const box = h('div');
    const result = await page.run(box);
    if (token !== state.token) return; // another page was opened meanwhile
    view.replaceChildren(box);
    state.current = result || null;
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    if (result && result.afterMount) result.afterMount();
  } catch (e) {
    if (token !== state.token) return;
    view.replaceChildren(
      h('div', { class: 'card stack' }, h('h2', { text: 'This page could not load' }), h('p', { class: 'hint', text: (e && e.message) || 'Please try again.' }), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => renderRoute() }, 'Try again'))
    );
  }
}

// Esc closes the window (Classic): goes back, asking first when there are unsaved changes.
document.addEventListener('keydown', (e) => {
  if (!state.classic || e.key !== 'Escape' || e.defaultPrevented) return;
  if (document.querySelector('.overlay') || document.querySelector('.combo-list')) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) {
    a.blur();
    return;
  }
  if (location.hash === '#/home' || location.hash === '' || location.hash === '#') return;
  e.preventDefault();
  const back = state.current && state.current.back ? state.current.back() : '#/home';
  if (back) location.hash = back;
});

// ---------- logout and timers ----------
let leaving = false;

async function logout(reason) {
  if (leaving) return;
  leaving = true;
  try {
    await api('POST', '/api/logout', {}, { noRedirect: true });
  } catch {
    /* even if this fails, leave the app */
  }
  const q = reason === 'timeout' ? '?timeout=1' : reason === 'expired' ? '?expired=1' : '';
  location.replace('/' + q);
}

function startTimers(me) {
  const idleMs = me.idleTimeoutMs;
  const expiresAt = me.sessionExpiresAt;
  let lastActivity = Date.now();
  let lastPing = Date.now();
  let warned = false;

  const bump = () => {
    const now = Date.now();
    if (now - lastActivity > 2000) {
      lastActivity = now;
      warned = false;
    }
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll']) {
    window.addEventListener(ev, bump, { passive: true, capture: true });
  }

  const tick = () => {
    if (leaving) return;
    const now = Date.now();
    if (now >= expiresAt) return logout('expired');
    if (now - lastActivity >= idleMs) return logout('timeout');
    const nearIdle = idleMs - (now - lastActivity) <= 60 * 1000;
    const nearExpiry = expiresAt - now <= 60 * 1000;
    if ((nearIdle || nearExpiry) && !warned) {
      warned = true;
      toast(nearExpiry ? "You'll be logged out in 1 minute (12 hour limit)." : "You'll be logged out in 1 minute because of inactivity.", 'warning', 15000);
    }
    // keep the server's idle clock fresh while the person is really using the page
    if (lastActivity > lastPing && now - lastPing > 10 * 60 * 1000) {
      lastPing = now;
      api('GET', '/api/me').catch(() => {});
    }
  };
  setInterval(tick, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

boot().catch(() => {
  /* a 401 already redirected to the login page; anything else shows nothing to guess at */
  document.getElementById('app').replaceChildren(
    h('div', { class: 'main' }, h('div', { class: 'card stack' }, h('h2', { text: 'Could not start' }), h('p', { class: 'hint', text: 'Check your internet connection and try again.' }), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => location.reload() }, 'Reload')))
  );
});
