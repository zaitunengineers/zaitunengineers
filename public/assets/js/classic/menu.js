// The whole Aeon menu tree in one place. The menu bar, the phone menu and the Home buttons are all drawn from it.
// W = works now (opens a screen). S(n) = switches on in Stage n. G = shown but not planned (greyed).
// Switching an item on later is a one-line change here.

const W = (label, to, sc, extra) => ({ label, to, sc, ...extra });
const S = (label, stage, sc) => ({ label, stage, sc });
const G = (label, sc) => ({ label, grey: true, sc });
const M = (label, kids, sc) => ({ label, kids, sc });
const A = (label, action, sc, arg) => ({ label, action, sc, arg });
const greyKids = (label, names) => M(label, names.map((n) => G(n)));

export const MENU = [
  {
    label: 'Master',
    kids: [
      W('Account Master', '#/accounts', 'F3'),
      G('Sub-Group Master'),
      W('Item/Service Master', '#/itemmaster'),
      W('Item/Service Group Master', '#/groups'),
      greyKids('Opening Balance', ['Account Opening Balance', 'Item Opening Stock']),
      W('Firm Master', '#/settings/firm', 'F2'),
      W('Bill Book Master', '#/billbook'),
      G('eCommerce Operator'),
      W('Transport Master', '#/transport'),
      G('Other Party Master'),
      G('Customized Master'),
      G('Agent Master'),
      G('Area Master'),
      M('New Year', [A('Years open by themselves on 1 April', 'newyear')]),
      W('Change Firm/Year', '#/fy', 'F4'),
      A('Exit', 'logout', 'Alt+X'),
    ],
  },
  {
    label: 'Transaction',
    kids: [
      M('Sale', [
        W('Sale', '#/sales', 'F5'),
        G('Sale Return'),
        W('Sale (Cancel)', '#/sales/cancelled'),
        G('Sales of Service'),
        W('Jobwork/Service with Goods', '#/sales/newjw'),
        G('Reverse Charge Self Bill'),
        G('Other Outward Supply'),
        G('Proforma Invoice (Simple)'),
        W('Proforma Invoice (Sales)', '#/proforma'),
        G('Proforma Invoice (Export)'),
      ]),
      M('Purchase', [G('Purchase', 'F6'), G('Purchase Return'), G('Other Inward Supply (Multi)')]),
      M('Payment/Receipt', [G('General', 'F7'), G('GST', 'F8'), G('Setup')]),
      greyKids('Journal', ['Journal Entry', 'Debit Note', 'Credit Note']),
      G('Production'),
      G('Stock Journal'),
      M('Delivery Challan', [
        W('Delivery Challan (General)', '#/dc/general'),
        W('Opening Delivery Challan Issue (Jobwork) IR', '#/dc/opening'),
        W('Delivery Challan Issue (Jobwork) IR', '#/dc/issue'),
        W('Delivery Challan Receive (Jobwork) IR', '#/dc/receive'),
        W('Pending/Over/All Register', '#/dc/register'),
        G('Delivery Challan (Sales)'),
        G('Delivery Challan (Branch Transfer)'),
        G('Setup'),
      ]),
      greyKids('Quick Entry', ['Quick Sale', 'Quick Purchase', 'Quick Receipt']),
    ],
  },
  {
    label: 'Report',
    kids: [
      greyKids('Account Books', ['Cash Book', 'Bank Book', 'Ledger', 'Day Book']),
      greyKids('Financial Report', ['Trial Balance', 'Profit & Loss', 'Balance Sheet']),
      greyKids('Stock Report', ['Stock Ledger', 'Stock Summary']),
      greyKids('Outstanding', ['Receivable', 'Payable']),
      M('Register', [
        S('Sale Register', 7),
        S('Jobwork Register', 7),
        S('Delivery Challan (Jobwork/Branch Transfer/General)', 7),
        S('Monthly Summary', 7),
        S('GST Ratewise Pivot Report', 7),
        G('Purchase Register'),
      ]),
      M('Analysis Report', [S('Sale/Purchase Analysis', 7), G('Item-wise Analysis')]),
      greyKids('TDS/TCS', ['TDS Report', 'TCS Report']),
      greyKids('Other Reports', ['Other Report']),
      G('Cover/Label Printing'),
    ],
  },
  {
    label: 'Flexible Reports',
    kids: [S('Master Report', 7), S('Sales Report', 7), S('Jobwork Report', 7), M('Delivery Challan', [S('Delivery Challan Report', 7)]), G('Purchase Report'), G('Account Report')],
  },
  {
    label: 'GST',
    kids: [
      S('GSTR-1 (Monthly)', 7),
      S('GSTR-1 (Quarterly)', 7),
      M('Summary Register', [S('Summary Register', 7)]),
      M('GST Register', [S('GST Register', 7)]),
      G('GSTR-2A/2B Reconciliation'),
      G('GSTR-3B'),
    ],
  },
  {
    label: 'Tools',
    kids: [
      G('Calculator'),
      G('Register'),
      M('Backup/Restore', [S('Backup', 7), S('Restore', 7)]),
      W('Saved Documents', '#/saveddocs', 'F9'),
      W('Digital Signature', '#/digisign'),
      G('Parameter Setting'),
      G('Cheque Printing'),
      M('Update', [G('Update')]),
      G('Data Integrity'),
      S('Data Freeze', 7),
      G('In-Active Account Delete'),
      G('Account Merging'),
      G('Item Merging'),
      W('Activity Log', '#/settings/activity', 'F10'),
    ],
  },
  {
    label: 'Settings',
    kids: [
      W('Password', '#/settings/password'),
      G('User Creation'),
      W('General Setting', '#/gensetting'),
      M('Application Theme', [A('Classic (Aeon style)', 'theme', null, 'classic'), A('Modern', 'theme', null, 'modern')]),
      W('Email/WhatsApp/ftp Settings', '#/msgsetting'),
      M('E-Way/E-Invoice Settings', [G('E-Way Settings'), G('E-Invoice Settings')]),
      W('Import from Aeon', '#/settings/import'),
    ],
  },
  {
    label: 'Help',
    kids: [A("What's New", 'whatsnew'), A('About', 'about')],
  },
];

// Buttons down the right of Home, in Aeon's order.
export const HOME_BUTTONS = [
  { label: 'Firm Master', sc: 'F2', to: '#/settings/firm', key: 'F' },
  { label: 'Account Master', sc: 'F3', to: '#/accounts', key: 'A' },
  { label: 'Change Firm/Year', sc: 'F4', to: '#/fy', key: 'C' },
  { label: 'Sale', sc: 'F5', to: '#/sales', key: 'S' },
  { label: 'Purchase', sc: 'F6', grey: true, key: 'P' },
  { label: 'Payment/Receipt (General)', grey: true, key: 'R' },
  { label: 'New Transaction', sc: 'Ins', to: '#/sales/new', key: 'N' },
  { label: 'Saved Documents', sc: 'F9', to: '#/saveddocs', key: 'D' },
  { label: 'Activity Log', sc: 'F10', to: '#/settings/activity', key: 'L' },
  { label: 'Mail To Client', to: '#/sales', key: 'M', note: 'Pick a bill, then press Email.' },
  { label: 'General Setting', to: '#/gensetting', key: 'G' },
];

export const STAGE_NAMES = { 4: 'printing and PDFs', 7: 'reports, backup and Data Freeze' };

export function whyNot(item) {
  if (item.stage) return `Not ready yet. This arrives in Stage ${item.stage} (${STAGE_NAMES[item.stage] || 'later'}).`;
  return 'Not in this app yet. Tell me if you need it.';
}

// Key shortcuts that open a screen from anywhere (when not typing in a box).
export const KEYS = { F2: '#/settings/firm', F3: '#/accounts', F4: '#/fy', F5: '#/sales', F9: '#/saveddocs', F10: '#/settings/activity' };
