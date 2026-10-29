// App settings (stored in the `settings` table). These copy Aeon's General Setting for this firm.

export const SETTING_DEFAULTS = {
  ui_theme: 'classic',
  lbl_x1: 'PO NO 1',
  lbl_x2: 'SUPPLIER CODE',
  lbl_x3: 'PO NO 2',
  lbl_x4: 'PO NO 3',
  lbl_po_date: 'PO DATE',
  sw_disc: '0',
  lbl_disc: 'Discount',
  sw_a1: '0', lbl_a1: 'Packing',
  sw_a2: '0', lbl_a2: 'Transport/Packing & Forwarding',
  sw_a3: '0', lbl_a3: 'Loading',
  sw_a4: '0', lbl_a4: 'Insurance',
  sw_a5: '0', lbl_a5: 'Other-1',
  sw_a6: '0', lbl_a6: 'Other-2',
  sw_l2: '0', lbl_l2: 'Other (Less)',
  copy1: 'ORIGINAL',
  copy2: 'DUPLICATE',
  copy3: 'TRIPLICATE',
  copy4: 'QUADRUPLICATE',
  hsn_edit: '1',
  print_double_colon: '0',
  print_signature: '1',
  print_logo: '1',
  print_wrap: 'char',
  wa_msg: 'Dear Sir/Madam, please find attached our Tax Invoice No. {billno} dated {date} for Rs. {amount}. Regards, {firm}',
  mail_subject: 'Tax Invoice No. {billno} dated {date} - {firm}',
  mail_body: 'Dear Sir/Madam,\n\nPlease find attached our Tax Invoice No. {billno} dated {date} for Rs. {amount}.\n\nRegards,\n{firm}',
};

const MESSAGES = { wa_msg: 500, mail_subject: 150, mail_body: 500 };

const SWITCHES = new Set(['sw_disc', 'sw_a1', 'sw_a2', 'sw_a3', 'sw_a4', 'sw_a5', 'sw_a6', 'sw_l2', 'hsn_edit', 'print_double_colon', 'print_signature', 'print_logo']);

export function validateSetting(key, raw) {
  if (!(key in SETTING_DEFAULTS)) return { error: 'Unknown setting.' };
  if (key === 'ui_theme') return raw === 'classic' || raw === 'modern' ? { value: raw } : { error: 'Choose Classic or Modern.' };
  if (SWITCHES.has(key)) {
    if (raw === true || raw === 1 || raw === '1') return { value: '1' };
    if (raw === false || raw === 0 || raw === '0') return { value: '0' };
    return { error: 'Choose Yes or No.' };
  }
  if (key === 'print_wrap') return raw === 'char' || raw === 'word' ? { value: raw } : { error: 'Choose Character or Word.' };
  if (typeof raw !== 'string') return { error: 'This must be text.' };
  if (key in MESSAGES) {
    const m = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
    if (key === 'mail_subject' && /\n/.test(m)) return { error: 'The subject must be on one line.' };
    if (!m) return { error: 'This cannot be empty.' };
    if (m.length > MESSAGES[key]) return { error: `Use ${MESSAGES[key]} characters or fewer.` };
    return { value: m };
  }
  const v = raw.replace(/\s+/g, ' ').trim();
  if (!v || v.length > 40) return { error: 'Enter 1 to 40 characters.' };
  return { value: v };
}

export async function loadSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const out = { ...SETTING_DEFAULTS };
  for (const r of results) if (r.key in SETTING_DEFAULTS && r.value !== null) out[r.key] = r.value;
  return out;
}
