// Enter moves to the next box, like Aeon. Boxes that take part carry data-nav.

export function navList(root) {
  return [...root.querySelectorAll('[data-nav]')].filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null && el.getAttribute('aria-disabled') !== 'true');
}

export function focusNext(from, root = from.closest('[data-navroot]'), step = 1) {
  if (!root) return null;
  const list = navList(root);
  const i = list.indexOf(from);
  const next = list[i + step];
  if (next) {
    next.focus();
    if (next.select && next.tagName === 'INPUT') next.select();
  }
  return next || null;
}

// Wire Enter on a container. Keys that were already handled (defaultPrevented) are left alone.
export function wireEnter(root) {
  root.setAttribute('data-navroot', '');
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (!t.matches || !t.matches('[data-nav]')) return;
    if (t.tagName === 'TEXTAREA') return;
    if (t.tagName === 'BUTTON') return;
    e.preventDefault();
    focusNext(t, root);
  });
}
