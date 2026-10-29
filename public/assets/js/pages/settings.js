import { api, ApiError } from '/assets/js/api.js';
import { h, icon, field, setFieldError, passwordInput, strengthMeter, formatDateTime, setButtonLoading } from '/assets/js/ui.js';

const VERSION = 'v0.5.0';

function crumb() {
  return h('a', { class: 'crumb', href: '#/settings' }, icon('back'), 'Settings');
}

// ---------- settings index ----------
export default async function render(box) {
  const theme = h(
    'select',
    { class: 'select', id: 'theme', 'aria-label': 'Theme' },
    h('option', { value: 'system', text: 'Same as my device' }),
    h('option', { value: 'light', text: 'Light' }),
    h('option', { value: 'dark', text: 'Dark' })
  );
  let saved = 'system';
  try {
    saved = localStorage.getItem('zb_theme') || 'system';
  } catch { /* storage blocked */ }
  theme.value = ['light', 'dark'].includes(saved) ? saved : 'system';
  theme.addEventListener('change', () => {
    try {
      if (theme.value === 'system') localStorage.removeItem('zb_theme');
      else localStorage.setItem('zb_theme', theme.value);
    } catch { /* storage blocked: applies for this visit only */ }
    if (theme.value === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme.value);
  });

  const link = (href, ic, title, desc) =>
    h('a', { class: 'linkcard', href }, h('div', { class: 'ico' }, icon(ic)), h('div', null, h('div', { class: 't', text: title }), h('div', { class: 'd', text: desc })), h('span', { class: 'go' }, icon('chevron')));

  box.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', { text: 'Settings' }))),
    h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'linklist' },
        link('#/settings/firm', 'building', 'Firm details', 'Name, GSTIN, address, bank, logo and signature'),
        link('#/settings/transporters', 'truck', 'Transporters', "Names shown in the bill's Transporter box"),
        link('#/gensetting', 'settings', 'General Setting', 'Bill headings, discount and charges, copy names, Classic or Modern look'),
        link('#/groups', 'list', 'Item groups', 'Groups for sorting your items'),
        link('#/settings/import', 'upload', 'Import from Aeon', 'Bring in your client and item lists from Excel'),
        link('#/settings/password', 'lock', 'Change password', 'Other devices are logged out when you change it'),
        link('#/settings/activity', 'list', 'Activity', 'Every login, wrong password and change')
      ),
      h('div', { class: 'card' }, h('div', { class: 'row-between' }, h('div', null, h('h2', { text: 'Theme' }), h('p', { class: 'hint', text: 'Light or dark. Saved on this device.' })), h('div', { class: 'field' }, theme))),
      h('p', { class: 'hint', text: `Zaitun Billing ${VERSION}` })
    )
  );
}

// ---------- change password ----------
export async function password(box, ctx) {
  const cur = passwordInput({ id: 'cur', name: 'current', autocomplete: 'current-password' });
  const nw = passwordInput({ id: 'nw', name: 'new', autocomplete: 'new-password' });
  const cf = passwordInput({ id: 'cf', name: 'confirm', autocomplete: 'new-password' });
  const curF = field('Current password', cur.input, { wrap: cur.wrap });
  const nwF = field('New password', nw.input, { wrap: nw.wrap, hint: 'At least 10 characters. Not your username, not a common password.' });
  const cfF = field('Confirm new password', cf.input, { wrap: cf.wrap });
  const meter = strengthMeter();
  nwF.insertBefore(meter.el, nwF.querySelector('.hint'));
  nw.input.addEventListener('input', () => meter.update(nw.input.value));

  const status = h('div', { class: 'alert', role: 'status', hidden: true });
  const btn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Change password');
  const form = h('form', { class: 'form-stack', novalidate: true }, status, curF, nwF, cfF, h('div', null, btn));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.hidden = true;
    for (const f of [curF, nwF, cfF]) setFieldError(f, '');
    if (!cur.input.value) return setFieldError(curF, 'Enter your current password.'), cur.input.focus();
    if (nw.input.value.length < 10) return setFieldError(nwF, 'Password must be at least 10 characters.'), nw.input.focus();
    if (nw.input.value !== cf.input.value) return setFieldError(cfF, 'The two passwords are not the same.'), cf.input.focus();
    setButtonLoading(btn, true, 'Saving');
    try {
      await api('POST', '/api/password', { currentPassword: cur.input.value, newPassword: nw.input.value });
      cur.input.value = nw.input.value = cf.input.value = '';
      meter.update('');
      status.className = 'alert alert-success';
      status.textContent = 'Password changed. Other devices were logged out.';
      status.hidden = false;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      if (err instanceof ApiError && err.status === 403) setFieldError(curF, msg);
      else {
        status.className = 'alert alert-danger';
        status.textContent = msg;
        status.hidden = false;
      }
    }
    setButtonLoading(btn, false, 'Change password');
  });

  box.append(
    crumb(),
    h('div', { class: 'page-head' }, h('div', null, h('h1', { text: 'Change password' }))),
    h('div', { class: 'card' }, form)
  );
}

// ---------- activity ----------
const LABELS = {
  setup: 'Owner account created',
  reset: 'Password reset with setup key',
  login_ok: 'Logged in',
  login_fail: 'Wrong password',
  logout: 'Logged out',
  password_change: 'Password changed',
  firm_update: 'Firm details changed',
  lockout: 'Locked after too many tries',
  client_add: 'Client added',
  client_edit: 'Client changed',
  client_hide: 'Client hidden',
  client_show: 'Client shown again',
  client_delete: 'Client deleted',
  item_add: 'Item added',
  item_edit: 'Item changed',
  item_hide: 'Item hidden',
  item_show: 'Item shown again',
  item_delete: 'Item deleted',
  transporter_add: 'Transporter added',
  transporter_edit: 'Transporter changed',
  transporter_delete: 'Transporter deleted',
  import_clients: 'Clients imported',
  import_items: 'Items imported',
  bill_add: 'Bill made',
  bill_edit: 'Bill changed',
  bill_cancel: 'Bill cancelled',
  bill_delete: 'Bill deleted',
  bill_print: 'Bill printed or shared',
  challan_add: 'Challan made',
  challan_edit: 'Challan changed',
  challan_cancel: 'Challan cancelled',
  challan_delete: 'Challan deleted',
  challan_print: 'Challan printed or shared',
  settings_edit: 'General Setting changed',
  group_add: 'Item group added',
  group_edit: 'Item group renamed',
  group_delete: 'Item group deleted',
};

const FIELD_NAMES = {
  name: 'name', address1: 'address 1', address2: 'address 2', city: 'city', pincode: 'pincode', state_code: 'state',
  gstin: 'GSTIN', pan: 'PAN', phone: 'phone', mobile: 'mobile', email: 'email', bank_name: 'bank name',
  bank_account: 'account no.', bank_ifsc: 'IFSC', bank_branch: 'branch', terms: 'terms', logo_png: 'logo', signature_png: 'signature',
  address: 'address', notes: 'notes', code: 'HSN/SAC', kind: 'type', uom: 'unit', rate: 'rate', gst_bp: 'GST %', description: 'description',
  active: 'hidden or shown', sort: 'order',
};

function describe(row) {
  let d = null;
  try {
    d = row.details ? JSON.parse(row.details) : null;
  } catch { /* ignore bad details */ }
  let what = LABELS[row.action] || row.action;
  let det = '';
  if (row.action === 'login_fail' && d && d.where === 'setup') what = 'Wrong setup key';
  if (row.action === 'lockout' && d && d.where === 'setup') what = 'Setup locked after too many tries';
  if (row.action === 'firm_update' && d && Array.isArray(d.fields)) det = d.fields.map((f) => FIELD_NAMES[f] || f).join(', ');
  if (d && d.name && /^(client|item|transporter)_/.test(row.action)) {
    det = d.name;
    if (Array.isArray(d.fields) && d.fields.length) det += ` (${d.fields.map((f) => FIELD_NAMES[f] || f).join(', ')})`;
  }
  if (d && row.action.startsWith('import_')) {
    det = [`${d.added || 0} added`, `${d.updated || 0} updated`, `${d.skipped || 0} skipped`, `${d.errors || 0} not imported`].join(', ');
  }
  if (/^challan_/.test(row.action) && d) {
    const kn = d.kind_name || 'Challan';
    if (row.action === 'challan_print') {
      what = `${{ print: 'Printed', pdf: 'PDF made', whatsapp: 'Shared on WhatsApp', email: 'Sent by email', bulk: 'Bulk printed' }[d.how] || 'Printed'}: ${kn}`;
      det = [Array.isArray(d.nos) ? (d.nos.length > 4 ? `${d.nos.length} documents` : `No. ${d.nos.join(', ')}`) : '', d.party || ''].filter(Boolean).join(', ');
    } else {
      what = `${{ challan_add: 'Made', challan_edit: 'Changed', challan_cancel: 'Cancelled', challan_delete: 'Deleted' }[row.action]}: ${kn}`;
      det = [d.no ? `No. ${d.no}` : '', d.party || '', d.net && d.net !== '0.00' ? `net ${d.net}` : ''].filter(Boolean).join(', ');
    }
  } else if (row.action === 'bill_print' && d) {
    what = { print: 'Bill printed', pdf: 'PDF made', whatsapp: 'Shared on WhatsApp', email: 'Sent by email', bulk: 'Bulk bills printed' }[d.how] || what;
    det = [Array.isArray(d.bill_nos) ? (d.bill_nos.length > 4 ? `${d.bill_nos.length} bills (no. ${d.bill_nos[0]} to ${d.bill_nos[d.bill_nos.length - 1]})` : `Bill no. ${d.bill_nos.join(', ')}`) : '', d.party || ''].filter(Boolean).join(', ');
  } else if (/^bill_/.test(row.action) && d) {
    det = [d.bill_no ? `Bill no. ${d.bill_no}` : '', d.party || '', d.net ? `net ${d.net}` : '', d.new_net ? `now ${d.new_net}` : ''].filter(Boolean).join(', ');
  }
  if (row.action === 'settings_edit' && d && Array.isArray(d.fields)) det = d.fields.join(', ');
  if (/^group_/.test(row.action) && d && d.name) det = d.name;
  if (row.action === 'login_fail' && d && d.username && d.username !== '(unknown)') det = `Username: ${d.username}`;
  const bad = ['login_fail', 'lockout'].includes(row.action);
  return { what, det, bad };
}

export async function activity(box) {
  const list = h('div');
  const more = h('button', { type: 'button', class: 'btn btn-secondary', hidden: true }, 'Load more');
  const empty = h('p', { class: 'hint', text: 'Nothing yet.', hidden: true });
  let next = null;

  async function load() {
    const q = next ? `?before=${next}` : '';
    const data = await api('GET', `/api/activity${q}`);
    for (const row of data.items) {
      const { what, det, bad } = describe(row);
      list.append(
        h(
          'div',
          { class: `act-row${bad ? ' bad' : ''}` },
          h('div', { class: 'meta', text: formatDateTime(row.at) }),
          h('div', null, h('div', { class: 'what', text: what }), det ? h('div', { class: 'det', text: det }) : null),
          h('div', { class: 'meta ip', text: row.ip || '' })
        )
      );
    }
    next = data.next;
    more.hidden = !next;
    empty.hidden = list.childElementCount > 0;
  }

  more.addEventListener('click', async () => {
    setButtonLoading(more, true, 'Loading');
    try {
      await load();
    } finally {
      setButtonLoading(more, false, 'Load more');
    }
  });

  await load();
  box.append(
    crumb(),
    h('div', { class: 'page-head' }, h('div', null, h('h1', { text: 'Activity' }), h('p', { class: 'sub', text: 'Times are shown in Indian time (IST).' }))),
    h('div', { class: 'card' }, list, empty, h('div', { class: 'row-between' }, more))
  );
}
