// The chosen financial year, remembered on this device. fy = the starting year (2026 = 2026-2027).

export const FIRST_FY = 2016;

// Today's date in India as YYYY-MM-DD.
export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function fyOfIso(iso) {
  const y = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
}

export const currentFy = () => fyOfIso(todayIST());
export const fyLabel = (fy) => `${fy}-${fy + 1}`;
export const fyStart = (fy) => `${fy}-04-01`;
export const fyEnd = (fy) => `${fy + 1}-03-31`;

let chosen = null;
const listeners = new Set();

export function getFy() {
  if (chosen === null) {
    let saved = null;
    try {
      saved = Number(localStorage.getItem('zb_fy'));
    } catch { /* storage blocked */ }
    chosen = Number.isInteger(saved) && saved >= FIRST_FY && saved <= currentFy() + 1 ? saved : currentFy();
  }
  return chosen;
}

export function setFy(fy) {
  chosen = fy;
  try {
    localStorage.setItem('zb_fy', String(fy));
  } catch { /* storage blocked: applies for this visit only */ }
  for (const fn of listeners) fn(fy);
}

export const onFyChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Default bill date: today when it is inside the chosen year, otherwise the last day of that year.
export function defaultBillDate(fy = getFy()) {
  const t = todayIST();
  if (t >= fyStart(fy) && t <= fyEnd(fy)) return t;
  return t < fyStart(fy) ? fyStart(fy) : fyEnd(fy);
}

export const ddmmyyyy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekday = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? DAYS[new Date(iso + 'T00:00:00Z').getUTCDay()] : '');
