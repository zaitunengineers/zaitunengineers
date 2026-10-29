// Shared screen helpers: element builder, icons, toasts, dialogs, form bits.
// Everything is built with createElement and textContent, never innerHTML, so data cannot inject code.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null || k === 'style') continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------- icons (hand-drawn, 24x24, 1.75 stroke) ----------
const ICONS = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6'],
  bills: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6M9 17h6'],
  clients: ['M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6', 'M16 4.5a3.5 3.5 0 0 1 0 7', 'M18 14.5c2 .7 3.5 2.6 3.5 5.5', 'circle:9,8,3.5'],
  items: ['M21 8 12 3 3 8v8l9 5 9-5z', 'M3 8l9 5 9-5M12 13v8'],
  settings: ['M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1', 'circle:16,6,2.2', 'circle:10,12,2.2', 'circle:18,18,2.2'],
  more: ['circle:5,12,1.2', 'circle:12,12,1.2', 'circle:19,12,1.2'],
  plus: ['M12 5v14M5 12h14'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'circle:12,12,3'],
  eyeoff: ['M3 3l18 18', 'M10.6 6.1A9.6 9.6 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6C3.7 9.4 2 12 2 12s3.5 6 10 6c1.6 0 3-.4 4.3-.9', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5M21 12H9'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  alert: ['circle:12,12,9', 'M12 8v5M12 16.5h.01'],
  lock: ['M5 11h14v10H5z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  clock: ['circle:12,12,9', 'M12 7v5l3 2'],
  upload: ['M12 16V4M7 9l5-5 5 5', 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3'],
  trash: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
  building: ['M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16', 'M14 10h5a1 1 0 0 1 1 1v10M2 21h20M8 8h2M8 12h2M8 16h2'],
  key: ['circle:8,15,4', 'M10.8 12.2 20 3M17 6l3 3M14 9l2 2'],
  list: ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
  chevron: ['M9 6l6 6-6 6'],
  back: ['M15 6l-6 6 6 6'],
  search: ['circle:11,11,6.5', 'M16 16l5 5'],
  truck: ['M2 6h11v10H2z', 'M13 10h4l3 3v3h-7', 'circle:6,18,2', 'circle:17,18,2'],
  down: ['M6 9l6 6 6-6'],
  up: ['M6 15l6-6 6 6'],
  close: ['M6 6l12 12M18 6L6 18'],
  sheet: ['M4 4h16v16H4z', 'M4 9h16M9 4v16'],
};
const NS = 'http://www.w3.org/2000/svg';

export function icon(name) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', name === 'more' ? 'icon fill' : 'icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const spec of ICONS[name] || []) {
    if (spec.startsWith('circle:')) {
      const [cx, cy, r] = spec.slice(7).split(',');
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', cx);
      c.setAttribute('cy', cy);
      c.setAttribute('r', r);
      svg.append(c);
    } else {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', spec);
      svg.append(p);
    }
  }
  return svg;
}

// ---------- toasts ----------
function toastBox() {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' });
    document.body.append(box);
  }
  return box;
}

export function toast(message, kind = 'info', ms = 4000) {
  const el = h('div', { class: `toast ${kind}`, role: 'status' }, kind === 'info' ? null : icon(kind === 'success' ? 'check' : 'alert'), h('span', { text: message }));
  toastBox().append(el);
  if (ms > 0) setTimeout(() => el.remove(), ms);
  return el;
}

// ---------- dialog (never alert/confirm) ----------
export function confirmDialog({ title, message, confirmText = 'OK', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const ok = h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: confirmText });
    const no = h('button', { type: 'button', class: 'btn btn-secondary', text: cancelText });
    const dlg = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', { text: title }), h('p', { text: message }), h('div', { class: 'actions' }, no, ok));
    const overlay = h('div', { class: 'overlay' }, dlg);
    const close = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (previous && previous.focus) previous.focus();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Tab') {
        const items = [no, ok];
        const i = items.indexOf(document.activeElement);
        e.preventDefault();
        items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
      }
    };
    ok.addEventListener('click', () => close(true));
    no.addEventListener('click', () => close(false));
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    no.focus();
  });
}

// A dialog with more than two choices. actions: [{label, value, kind: 'primary'|'secondary'|'danger'}].
// Escape or a tap outside gives back null (meaning: do nothing).
export function choiceDialog({ title, message, actions }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const buttons = actions.map((a) => h('button', { type: 'button', class: `btn btn-${a.kind || 'secondary'}`, text: a.label, onclick: () => close(a.value) }));
    const dlg = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', { text: title }), h('p', { text: message }), h('div', { class: 'actions' }, buttons));
    const overlay = h('div', { class: 'overlay' }, dlg);
    const close = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (previous && previous.focus) previous.focus();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      } else if (e.key === 'Tab') {
        const i = buttons.indexOf(document.activeElement);
        e.preventDefault();
        buttons[(i + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
      }
    };
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    buttons[buttons.length - 1].focus();
  });
}

// A panel for a short form: slides up from the bottom on a phone, centred on a laptop.
// requestClose is asked before Escape, the X button or a tap outside closes it (return false to keep it open).
export function sheet({ title, body, footer, requestClose }) {
  const previous = document.activeElement;
  let closed = false;
  const closeBtn = h('button', { type: 'button', class: 'sheet-x', 'aria-label': 'Close' }, icon('close'));
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'grab' }),
    h('div', { class: 'sheet-head' }, h('h2', { text: title }), closeBtn),
    h('div', { class: 'sheet-body' }, body),
    footer ? h('div', { class: 'sheet-foot' }, footer) : null
  );
  const overlay = h('div', { class: 'overlay sheet-overlay' }, panel);
  const api = {
    el: panel,
    close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (previous && previous.focus) previous.focus();
    },
  };
  const ask = async () => {
    if (closed) return;
    if (requestClose && (await requestClose()) === false) return;
    api.close();
  };
  const onKey = (e) => {
    if (e.key !== 'Escape' || document.querySelector('.overlay:not(.sheet-overlay)')) return;
    e.preventDefault();
    ask();
  };
  closeBtn.addEventListener('click', ask);
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) ask(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  const first = panel.querySelector('input, select, textarea');
  if (first) first.focus();
  return api;
}

// Small coloured label. kind: '' | 'muted' | 'warn' | 'good' | 'bad'
export const badge = (text, kind = '') => h('span', { class: `badge${kind ? ' ' + kind : ''}`, text });

// A row of tap buttons where one is chosen (like radio buttons). options: [{value, label}]
export function chips({ options, value, onChange, label }) {
  let current = value;
  const wrap = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': label || '' });
  const paint = () => {
    for (const b of wrap.children) b.setAttribute('aria-checked', String(b.dataset.value === String(current)));
  };
  const add = (o) => {
    const b = h('button', { type: 'button', class: 'chip', role: 'radio', 'data-value': String(o.value), text: o.label });
    b.addEventListener('click', () => {
      current = o.value;
      paint();
      onChange && onChange(current);
    });
    wrap.append(b);
    paint();
    return b;
  };
  options.forEach(add);
  return {
    el: wrap,
    get: () => current,
    set(v) {
      current = v;
      if (![...wrap.children].some((b) => b.dataset.value === String(v)) && v !== undefined && v !== null) {
        const o = options.find((x) => x.value === v);
        add(o || { value: v, label: String(v) });
      }
      paint();
    },
    add,
  };
}

// ---------- form pieces ----------
// control: the input/select/textarea. wrap: optional element that already holds the control (e.g. password box with eye).
export function field(label, control, { hint, required, wrap } = {}) {
  const id = control.id;
  const err = h('div', { class: 'err', id: `${id}-err`, role: 'alert' });
  control.setAttribute('aria-describedby', `${id}-err`);
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label, required ? h('span', { class: 'req', text: ' *' }) : null),
    wrap || control,
    hint ? h('div', { class: 'hint', text: hint }) : null,
    err
  );
}

export function setFieldError(fieldEl, message) {
  const err = fieldEl.querySelector('.err');
  if (err) err.textContent = message || '';
  const control = fieldEl.querySelector('input, select, textarea');
  if (control) control.setAttribute('aria-invalid', message ? 'true' : 'false');
}

export function passwordInput({ id, name, autocomplete }) {
  const input = h('input', { class: 'input', id, name, type: 'password', autocomplete, autocapitalize: 'none', spellcheck: 'false', required: true });
  const eye = h('button', { type: 'button', class: 'eye', 'aria-label': 'Show password' }, icon('eye'));
  eye.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    eye.replaceChildren(icon(show ? 'eyeoff' : 'eye'));
  });
  return { input, wrap: h('div', { class: 'pw' }, input, eye) };
}

// Adds the show/hide eye to a password box that is already in the page.
export function wireEye(input, eye) {
  eye.replaceChildren(icon('eye'));
  eye.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    eye.replaceChildren(icon(show ? 'eyeoff' : 'eye'));
  });
}

export function strengthScore(pw) {
  if (!pw) return 0;
  let variety = 0;
  if (/[a-z]/.test(pw)) variety++;
  if (/[A-Z]/.test(pw)) variety++;
  if (/[0-9]/.test(pw)) variety++;
  if (/[^A-Za-z0-9]/.test(pw)) variety++;
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (variety >= 3) score++;
  if (pw.length >= 18 || variety === 4) score++;
  return pw.length < 10 ? Math.min(score, 1) : Math.max(score, 1);
}

export function strengthMeter() {
  const label = h('div', { class: 'hint', text: 'Use at least 10 characters.' });
  const bar = h('div', { class: 'meter', 'data-score': '0' }, h('i'), h('i'), h('i'), h('i'));
  const words = ['Use at least 10 characters.', 'Too weak', 'Okay', 'Good', 'Strong'];
  return {
    el: h('div', null, bar, label),
    update(pw) {
      const s = strengthScore(pw);
      bar.setAttribute('data-score', String(s));
      label.textContent = pw ? words[s] : words[0];
    },
  };
}

// ---------- formatting ----------
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});
export const formatDateTime = (ms) => dateTimeFmt.format(new Date(ms));

export function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// paise (whole number) -> "₹1,25,000.00"
export function inr(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
}

export function setButtonLoading(btn, loading, label) {
  btn.disabled = loading;
  if (loading) btn.replaceChildren(h('span', { class: 'spinner' }), label || 'Please wait');
  else btn.replaceChildren(label);
}
