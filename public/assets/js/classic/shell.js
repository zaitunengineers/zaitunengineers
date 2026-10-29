// The Aeon-style frame: title strip, green menu bar, firm strip, body, status bar.
// On a phone the menu bar becomes one Menu button that opens the same tree as an accordion.

import { h, choiceDialog } from '/assets/js/ui.js';
import { MENU, KEYS, whyNot } from '/assets/js/classic/menu.js';
import { getFy, fyLabel, currentFy, onFyChange, todayIST, ddmmyyyy } from '/assets/js/classic/fy.js';

export const VERSION = '0.5.0';
const HOT = { Master: 'M', Transaction: 'T', Report: 'R', 'Flexible Reports': 'F', GST: 'G', Tools: 'o', Settings: 'S', Help: 'H' };
export const WHATS_NEW = [
  ['v0.5.0', 'Delivery challans (general and jobwork), Pending/Over/All register, Proforma Invoice and the Jobwork bill. Bills brought from Aeon can now be edited.'],
  ['v0.4.0', 'Print and share: the Aeon A4 Tax Invoice with copies, Preview, PDF, WhatsApp, Email, Bulk Bill, Saved Documents and Digital Signature.'],
  ['v0.3.0', 'Aeon-style screens, Change Year, Sales bills (add, edit, cancel, delete), Account and Item Master in Aeon layout, General Setting.'],
  ['v0.2.0', 'Clients, items and transporters, with Excel import from Aeon.'],
  ['v0.1.0', 'Secure login and firm details.'],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const statusDate = () => {
  const t = todayIST();
  return `${t.slice(8, 10)}-${MONTHS[Number(t.slice(5, 7)) - 1]}-${t.slice(0, 4)}`;
};

// Underline the hot letter inside a label.
function labelWithHot(label, hot) {
  const i = hot ? label.indexOf(hot) : 0;
  if (i < 0) return document.createTextNode(label);
  return h('span', null, label.slice(0, i), h('u', { text: label[i] }), label.slice(i + 1));
}

export function infoDialog(title, message) {
  return choiceDialog({ title, message, actions: [{ label: 'OK', value: true, kind: 'primary' }] });
}

// ctx: {state, navigate, logout, toast, setTheme}
export function createClassicShell(ctx) {
  const { state } = ctx;
  const firm = () => state.me.firm || {};

  const titleName = h('span', { class: 'ct-name', text: 'Zaitun Billing' });
  const menuBar = h('nav', { class: 'cmenubar', 'aria-label': 'Menu' });
  const menuToggle = h('button', { type: 'button', class: 'cmenu-toggle', 'aria-expanded': 'false', 'aria-controls': 'cphone-menu' }, '☰ Menu');
  const phoneMenu = h('div', { class: 'cphone-menu', id: 'cphone-menu', hidden: true });

  const boxName = h('div', { class: 'cf-box cf-name' });
  const boxPan = h('div', { class: 'cf-box' });
  const boxGstin = h('div', { class: 'cf-box cf-gstin' });
  const boxFy = h('div', { class: 'cf-box cf-fy' });
  const strip = h('div', { class: 'cfirm' }, boxName, boxPan, boxGstin, boxFy);

  const view = h('main', { class: 'cbody', id: 'view', tabindex: '-1' });
  const stUser = h('span', { class: 'cs-box' });
  const stDate = h('span', { class: 'cs-box' });
  const status = h(
    'div',
    { class: 'cstatus' },
    stUser,
    h('span', { class: 'cs-box cs-host', text: 'billing.zaitunengineers.com' }),
    h('span', { class: 'cs-box', text: `Version : ${VERSION}` }),
    stDate,
    h('span', { class: 'cs-box cs-gst', text: 'GST Mode' })
  );
  const el = h('div', { class: 'cshell', 'data-route': 'home' }, h('div', { class: 'ctitle' }, titleName, menuToggle), menuBar, phoneMenu, strip, view, status);

  function paintStrip() {
    const f = firm();
    boxName.textContent = state.me.firmName || 'Zaitun Engineers';
    boxPan.textContent = f.pan ? `PAN : ${f.pan}` : 'PAN :';
    boxGstin.textContent = f.gstin ? `GSTIN : ${f.gstin}` : 'GSTIN :';
    const fy = getFy();
    boxFy.textContent = `F.Y. : ${fyLabel(fy)}`;
    boxFy.classList.toggle('old', fy !== currentFy());
    stUser.textContent = `User : ${state.me.username}`;
    stDate.textContent = `Date : ${statusDate()}`;
  }
  paintStrip();
  const offFy = onFyChange(paintStrip);

  // ---------- running an item ----------
  async function run(item) {
    closeAll();
    closePhone();
    if (item.grey || item.stage) {
      ctx.toast(whyNot(item), 'info', 4500);
      return;
    }
    if (item.to) {
      if (location.hash === item.to) ctx.reload();
      else ctx.navigate(item.to);
      return;
    }
    switch (item.action) {
      case 'logout': {
        const sure = await choiceDialog({ title: 'Exit', message: 'Log out of Zaitun Billing?', actions: [{ label: 'Stay', value: false }, { label: 'Log out', value: true, kind: 'primary' }] });
        if (sure) ctx.logout();
        break;
      }
      case 'theme':
        ctx.setTheme(item.arg);
        break;
      case 'newyear':
        await infoDialog('New Year', 'In this app a new financial year opens by itself on 1 April. Nothing to carry forward and no licence to unlock. Use Change Firm/Year (F4) to look at any year.');
        break;
      case 'whatsnew':
        await infoDialog("What's New", WHATS_NEW.map(([v, t]) => `${v}: ${t}`).join('\n\n'));
        break;
      case 'about':
        await infoDialog('About', `Zaitun Billing ${VERSION}\nZaitun Engineers billing, built to work like the Aeon Billing it replaces.\nbilling.zaitunengineers.com`);
        break;
      default:
        break;
    }
  }

  // ---------- desktop menu bar ----------
  let openTop = null;
  const tops = [];

  function itemRow(item) {
    const hasKids = !!item.kids;
    const row = h(
      'li',
      { class: `cm-item${item.grey || item.stage ? ' dim' : ''}${hasKids ? ' has-kids' : ''}`, role: 'none' },
      h('button', { type: 'button', class: 'cm-btn', role: 'menuitem', 'aria-haspopup': hasKids ? 'true' : null, 'aria-disabled': item.grey || item.stage ? 'true' : null },
        h('span', { class: 'cm-label', text: item.label }),
        item.sc ? h('span', { class: 'cm-sc', text: item.sc }) : null,
        hasKids ? h('span', { class: 'cm-arrow', text: '▸' }) : null)
    );
    const btn = row.firstChild;
    if (hasKids) {
      const sub = h('ul', { class: 'cm-list cm-sub', role: 'menu' }, item.kids.map(itemRow));
      row.append(sub);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        row.classList.toggle('open');
      });
    } else {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        run(item);
      });
    }
    return row;
  }

  for (const top of MENU) {
    const hot = HOT[top.label];
    const btn = h('button', { type: 'button', class: 'cm-top', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'data-hot': hot.toLowerCase() }, labelWithHot(top.label, hot), h('span', { class: 'cm-caret', text: ' ▾' }));
    const list = h('ul', { class: 'cm-list', role: 'menu', hidden: true }, top.kids.map(itemRow));
    const wrap = h('div', { class: 'cm-wrap' }, btn, list);
    const open = () => {
      closeAll();
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      wrap.classList.add('open');
      openTop = { btn, list, wrap };
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (openTop && openTop.btn === btn) closeAll();
      else open();
    });
    btn.addEventListener('mouseenter', () => {
      if (openTop && openTop.btn !== btn) open();
    });
    tops.push({ btn, open, hot: hot.toLowerCase() });
    menuBar.append(wrap);
  }

  function closeAll() {
    if (!openTop) return;
    openTop.list.hidden = true;
    openTop.btn.setAttribute('aria-expanded', 'false');
    openTop.wrap.classList.remove('open');
    for (const r of openTop.list.querySelectorAll('.open')) r.classList.remove('open');
    openTop = null;
  }
  const onDocClick = (e) => {
    if (openTop && !openTop.wrap.contains(e.target)) closeAll();
  };
  document.addEventListener('click', onDocClick);

  // ---------- phone menu ----------
  function phoneItem(item, depth) {
    const hasKids = !!item.kids;
    const btn = h('button', { type: 'button', class: `pm-btn d${depth}${item.grey || item.stage ? ' dim' : ''}`, 'aria-expanded': hasKids ? 'false' : null },
      h('span', { text: item.label }), item.sc ? h('span', { class: 'pm-sc', text: item.sc }) : null, hasKids ? h('span', { class: 'pm-arrow', text: '▾' }) : null);
    if (!hasKids) {
      btn.addEventListener('click', () => run(item));
      return btn;
    }
    const kids = h('div', { class: 'pm-kids', hidden: true }, item.kids.map((k) => phoneItem(k, depth + 1)));
    btn.addEventListener('click', () => {
      kids.hidden = !kids.hidden;
      btn.setAttribute('aria-expanded', String(!kids.hidden));
    });
    return h('div', { class: 'pm-group' }, btn, kids);
  }
  phoneMenu.append(...MENU.map((t) => phoneItem(t, 0)));
  function closePhone() {
    phoneMenu.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  }
  menuToggle.addEventListener('click', () => {
    phoneMenu.hidden = !phoneMenu.hidden;
    menuToggle.setAttribute('aria-expanded', String(!phoneMenu.hidden));
  });

  // ---------- keys ----------
  const onKey = (e) => {
    if (document.querySelector('.overlay')) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if (e.key === 'Escape' && openTop) {
      closeAll();
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
      const k = e.key.toLowerCase();
      if (k === 'x') {
        e.preventDefault();
        run({ action: 'logout' });
        return;
      }
      const t = tops.find((x) => x.hot === k);
      if (t) {
        e.preventDefault();
        t.open();
        t.btn.focus();
        return;
      }
    }
    if (e.key === 'F2' && ctx.f2 && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      ctx.f2();
      return;
    }
    if (KEYS[e.key] && !typing && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (location.hash === KEYS[e.key]) ctx.reload();
      else ctx.navigate(KEYS[e.key]);
    } else if (e.key === 'Insert' && !typing && !e.ctrlKey && !e.altKey && (location.hash === '#/home' || location.hash === '' || location.hash === '#')) {
      e.preventDefault();
      ctx.navigate('#/sales/new');
    }
  };
  document.addEventListener('keydown', onKey);

  return {
    el,
    view,
    paintStrip,
    markActive(key) {
      el.setAttribute('data-route', key);
      closeAll();
      closePhone();
    },
    destroy() {
      offFy();
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    },
  };
}
