// Shared checks. The same GSTIN logic is repeated in public/assets/js/gstin.js for instant feedback on screen.

export const STATES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu (old)', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh (old)', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function gstinChecksumOk(gstin) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARS.indexOf(gstin[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === gstin[14];
}

export function isValidGstin(gstin) {
  return typeof gstin === 'string' && GSTIN_RE.test(gstin) && gstinChecksumOk(gstin);
}

export const isValidPan = (v) => typeof v === 'string' && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
export const isValidPincode = (v) => typeof v === 'string' && /^[1-9][0-9]{5}$/.test(v);
export const isValidIfsc = (v) => typeof v === 'string' && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
export const isValidEmail = (v) => typeof v === 'string' && v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
export const isValidPhone = (v) => typeof v === 'string' && v.length <= 20 && /^[0-9 +\-]{5,20}$/.test(v);
export const isValidBankAccount = (v) => typeof v === 'string' && /^[0-9]{6,24}$/.test(v);

// ---------- username and password ----------

export function validateUsername(u) {
  if (typeof u !== 'string') return 'Enter a username.';
  const name = u.trim();
  if (name.length < 3 || name.length > 32) return 'Username must be 3 to 32 characters.';
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return 'Username can use letters, numbers, dot, dash and underscore only.';
  return null;
}

const COMMON = new Set(
  (
    'password,password1,password12,password123,password1234,passw0rd,p@ssw0rd,p@ssword,123456,1234567,12345678,123456789,' +
    '1234567890,12345678910,0123456789,0987654321,1111111111,0000000000,1234512345,qwerty,qwerty123,qwertyuiop,qwerty12345,' +
    'asdfghjkl,asdfghjk,zxcvbnm,1q2w3e4r,1q2w3e4r5t,1qaz2wsx,q1w2e3r4,iloveyou,iloveyou1,welcome,welcome1,welcome123,' +
    'admin,admin123,admin1234,administrator,letmein,letmein123,monkey,dragon,master,sunshine,princess,football,baseball,' +
    'superman,batman,trustno1,abc123,abcd1234,abc12345,abcdefgh,abcdefghij,test1234,testing123,changeme,changeme123,' +
    'default,guest,guest123,login,login123,secret,secret123,hello123,hello1234,india123,india@123,india1234,bharat123,' +
    'mumbai123,delhi123,krishna123,ganesh123,shivaji,sachin123,cricket123,zaitun,zaitun123,zaitun1234,zaitun@123,' +
    'engineers,engineers123,billing,billing123,billing1234,invoice123,account123,accounts123,gst12345,gstbilling,' +
    'user1234,root1234,pass1234,pass12345,mypassword,mypassword1,qazwsxedc,zaq12wsx,passpass,aaaaaaaaaa,1234qwer,qwer1234'
  ).split(',')
);

export function validatePassword(password, username = '') {
  if (typeof password !== 'string') return 'Enter a password.';
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (password.length > 200) return 'Password is too long (200 characters at most).';
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'That password is too common. Choose something harder to guess.';
  const name = String(username || '').trim().toLowerCase();
  if (name.length >= 3 && lower.includes(name)) return 'Password must not contain your username.';
  if (/^(.)\1+$/.test(password)) return 'Password cannot be one character repeated.';
  return null;
}

// ---------- firm details ----------

const TEXT_FIELDS = [
  'name', 'address1', 'address2', 'city', 'pincode', 'state_code', 'gstin', 'pan', 'phone', 'mobile', 'email',
  'bank_name', 'bank_account', 'bank_ifsc', 'bank_branch', 'terms', 'signatory_name', 'signatory_desig', 'bill_title',
];
const IMAGE_FIELDS = ['logo_png', 'signature_png'];
export const FIRM_FIELDS = [...TEXT_FIELDS, ...IMAGE_FIELDS];

const MAX_LEN = {
  name: 120, address1: 120, address2: 120, city: 60, pincode: 6, state_code: 2, gstin: 15, pan: 10,
  phone: 20, mobile: 20, email: 120, bank_name: 80, bank_account: 24, bank_ifsc: 11, bank_branch: 80, terms: 2000, signatory_name: 80, signatory_desig: 60, bill_title: 40,
};
const UPPER = new Set(['gstin', 'pan', 'bank_ifsc']);
const IMAGE_MAX = 300 * 1024;

function imageError(v) {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+=*)$/.exec(v);
  if (!m) return 'Use a PNG or JPG image.';
  if (v.length > IMAGE_MAX) return 'Image is too big (300 KB at most).';
  const body = m[2];
  if (m[1] === 'png' && !body.startsWith('iVBORw0KGgo')) return 'That file is not a real PNG image.';
  if (m[1] === 'jpeg' && !body.startsWith('/9j/')) return 'That file is not a real JPG image.';
  return null;
}

// input: what the browser sent. old: the saved firm row.
// A field that is missing keeps its old value; null or empty clears it.
export function validateFirm(input, old) {
  const value = {};
  const errors = {};

  for (const f of TEXT_FIELDS) {
    if (input[f] === undefined) {
      value[f] = old ? old[f] ?? null : null;
      continue;
    }
    if (input[f] !== null && typeof input[f] !== 'string') {
      errors[f] = 'This must be text.';
      continue;
    }
    let v = input[f] === null ? '' : input[f].trim();
    if (UPPER.has(f)) v = v.toUpperCase();
    if (f === 'email') v = v.toLowerCase();
    if (v.length > MAX_LEN[f]) {
      errors[f] = `Too long (${MAX_LEN[f]} characters at most).`;
      continue;
    }
    value[f] = v === '' ? null : v;
  }

  for (const f of IMAGE_FIELDS) {
    if (input[f] === undefined) {
      value[f] = old ? old[f] ?? null : null;
    } else if (input[f] === null || input[f] === '') {
      value[f] = null;
    } else if (typeof input[f] !== 'string') {
      errors[f] = 'Use a PNG or JPG image.';
    } else {
      const e = imageError(input[f]);
      if (e) errors[f] = e;
      else value[f] = input[f];
    }
  }

  if (!value.name) errors.name = 'Enter the firm name.';
  if (value.state_code && !STATES[value.state_code]) errors.state_code = 'Choose a state from the list.';
  if (value.pincode && !isValidPincode(value.pincode)) errors.pincode = 'Pincode must be 6 digits.';
  if (value.pan && !isValidPan(value.pan)) errors.pan = 'PAN looks like ABCDE1234F.';
  if (value.bank_ifsc && !isValidIfsc(value.bank_ifsc)) errors.bank_ifsc = 'IFSC looks like HDFC0001234.';
  if (value.bank_account && !isValidBankAccount(value.bank_account)) errors.bank_account = 'Account number must be 6 to 24 digits.';
  if (value.email && !isValidEmail(value.email)) errors.email = 'Enter a valid email address.';
  if (value.phone && !isValidPhone(value.phone)) errors.phone = 'Use digits, spaces, + and - only.';
  if (value.mobile && !isValidPhone(value.mobile)) errors.mobile = 'Use digits, spaces, + and - only.';

  if (value.gstin && !errors.gstin) {
    if (!isValidGstin(value.gstin)) {
      errors.gstin = 'This GSTIN is not valid. Check every character.';
    } else {
      if (!value.state_code) {
        errors.state_code = 'Choose the state that matches the GSTIN.';
      } else if (value.gstin.slice(0, 2) !== value.state_code) {
        errors.state_code = 'State does not match the first 2 digits of the GSTIN.';
      }
      const panPart = value.gstin.slice(2, 12);
      if (!value.pan) value.pan = panPart;
      else if (!errors.pan && value.pan !== panPart) errors.pan = 'PAN does not match the GSTIN.';
    }
  }

  return { value, errors };
}
