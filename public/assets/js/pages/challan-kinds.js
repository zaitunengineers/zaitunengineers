// The five kinds of challan screens: names, routes and what each one asks for. Used by the list, the entry screen and the bulk print screen.

export const KINDS = {
  general: { key: 'general', kind: 'general', route: '#/dc/general', title: 'Delivery Challan (General)', single: 'challan', plural: 'challans', cap: 'Challan', noLabel: 'Challan No.', file: 'Challan-General', tax: false, auto: true, register: false },
  issue: { key: 'issue', kind: 'jw_issue', route: '#/dc/issue', title: 'Delivery Challan Issue (Jobwork)', single: 'challan', plural: 'challans', cap: 'Challan', noLabel: 'Challan No.', file: 'Challan-Jobwork-Issue', tax: true, auto: true, register: true },
  receive: { key: 'receive', kind: 'jw_receive', route: '#/dc/receive', title: 'Delivery Challan Receive (Jobwork)', single: 'challan', plural: 'challans', cap: 'Challan', noLabel: "Party's Challan No.", file: 'Challan-Jobwork-Receive', tax: true, auto: false, register: true },
  opening: { key: 'opening', kind: 'jw_opening', route: '#/dc/opening', title: 'Opening Delivery Challan Issue (Jobwork)', single: 'challan', plural: 'challans', cap: 'Challan', noLabel: 'Original Challan No.', file: 'Challan-Jobwork-Opening', tax: true, auto: false, register: true },
  proforma: { key: 'proforma', kind: 'proforma', route: '#/proforma', title: 'Proforma Invoice (Sales)', single: 'proforma invoice', plural: 'proforma invoices', cap: 'Proforma', noLabel: 'Proforma No.', file: 'Proforma', tax: true, auto: true, register: false },
};
