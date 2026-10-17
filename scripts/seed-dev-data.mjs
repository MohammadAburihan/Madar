#!/usr/bin/env node
// Seeds a throwaway ERPNext site with data mirroring the design mocks (Rehan Nursery).
// Usage: node scripts/seed-dev-data.mjs --url http://localhost:8081 [--user Administrator --password admin]
import { argv, exit } from 'node:process';

const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : fallback;
};

const BASE = arg('url');
const COMPANY = 'Rehan Nursery';
const ABBR = 'RN';
const DEV_PASSWORD = 'Madar-Dev-2026';
if (!BASE) {
  console.error('Pass --url explicitly, e.g. --url http://localhost:8081');
  exit(1);
}

let cookie = '';
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}
const call = (method, args = {}) =>
  api('POST', `/api/method/${method}`, args).then((r) => r.message);
const list = (doctype, filters = {}, fields = ['name']) =>
  api(
    'GET',
    `/api/resource/${encodeURIComponent(doctype)}?filters=${encodeURIComponent(JSON.stringify(filters))}&fields=${encodeURIComponent(JSON.stringify(fields))}&limit_page_length=0`,
  ).then((r) => r.data);
const insert = (doc) => call('frappe.client.insert', { doc });
const submit = (doc) => call('frappe.client.submit', { doc });
async function ensure(doctype, filters, doc) {
  const [existing] = await list(doctype, filters);
  if (existing) return existing.name;
  return (await insert({ doctype, ...doc })).name;
}

await api('POST', '/api/method/login', {
  usr: arg('user', 'Administrator'),
  pwd: arg('password', 'admin'),
});

// Dates must follow the site's time zone, not UTC, or ERPNext rejects "required by" dates as past.
const { time_zone: timeZone } = await call('frappe.client.get_value', {
  doctype: 'System Settings',
  fieldname: 'time_zone',
});
const today = new Date();
const iso = (d) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
const plusDays = (n) => iso(new Date(today.getTime() + n * 86400000));

const companies = (await list('Company')).map((c) => c.name);
if (companies.some((c) => c !== COMPANY) || !companies.includes(COMPANY)) {
  console.error(
    `Refusing to seed: expected only "${COMPANY}", found ${JSON.stringify(companies)}.`,
  );
  exit(1);
}

const warehouse = await ensure(
  'Warehouse',
  { warehouse_name: 'Main warehouse', company: COMPANY },
  {
    warehouse_name: 'Main warehouse',
    company: COMPANY,
    parent_warehouse: `All Warehouses - ${ABBR}`,
  },
);

// A second warehouse, so the quick sale's warehouse choice and stock check have somewhere to go.
const gardenShop = await ensure(
  'Warehouse',
  { warehouse_name: 'Garden shop', company: COMPANY },
  { warehouse_name: 'Garden shop', company: COMPANY, parent_warehouse: `All Warehouses - ${ABBR}` },
);

for (const uom of ['Unit', 'Visit']) {
  await ensure('UOM', { uom_name: uom }, { uom_name: uom });
}

// Mirrors the catalogue in the quick-sale mocks (OLV-20, POT-30, SRV-GARDEN), plus two low-stock items for Home.
const items = [
  { item_code: 'OLV-20', item_name: 'Olive tree · 20 L', rate: 85, stock: 24, shop: 6, reorder: 5 },
  { item_code: 'POT-30', item_name: 'Ceramic planter', rate: 45, stock: 8, shop: 0, reorder: 20 },
  {
    item_code: 'GREEN-CLAY',
    item_name: 'Green clay 10 kg',
    rate: 25,
    stock: 3,
    shop: 0,
    reorder: 10,
  },
  {
    item_code: 'POTTING-SOIL',
    item_name: 'Potting soil 20 L',
    rate: 18,
    stock: 4,
    shop: 0,
    reorder: 12,
  },
];
for (const i of items) {
  await ensure(
    'Item',
    { item_code: i.item_code },
    {
      item_code: i.item_code,
      item_name: i.item_name,
      item_group: 'Products',
      stock_uom: 'Unit',
      is_stock_item: 1,
      standard_rate: i.rate,
      valuation_rate: i.rate / 2,
      reorder_levels: [
        {
          warehouse,
          warehouse_reorder_level: i.reorder,
          warehouse_reorder_qty: i.reorder,
          material_request_type: 'Purchase',
        },
      ],
    },
  );
}
await ensure(
  'Item',
  { item_code: 'SRV-GARDEN' },
  {
    item_code: 'SRV-GARDEN',
    item_name: 'Garden consultation',
    item_group: 'Services',
    stock_uom: 'Visit',
    is_stock_item: 0,
    standard_rate: 150,
  },
);
for (const [item_code, price_list_rate] of [
  ...items.map((i) => [i.item_code, i.rate]),
  ['SRV-GARDEN', 150],
]) {
  await ensure(
    'Item Price',
    { item_code, price_list: 'Standard Selling' },
    { item_code, price_list: 'Standard Selling', price_list_rate },
  );
}

const [receipt] = await list('Stock Entry', { remarks: 'Madar seed opening stock', docstatus: 1 });
if (!receipt) {
  const entry = await insert({
    doctype: 'Stock Entry',
    stock_entry_type: 'Material Receipt',
    company: COMPANY,
    remarks: 'Madar seed opening stock',
    items: items.flatMap((i) => [
      { item_code: i.item_code, qty: i.stock, t_warehouse: warehouse, basic_rate: i.rate / 2 },
      ...(i.shop
        ? [{ item_code: i.item_code, qty: i.shop, t_warehouse: gardenShop, basic_rate: i.rate / 2 }]
        : []),
    ]),
  });
  await submit(entry);
}

// ERPNext creates the primary contact and address from these quick-entry fields.
const { country } = await call('frappe.client.get_value', {
  doctype: 'Company',
  filters: COMPANY,
  fieldname: 'country',
});
const customers = [
  {
    customer_name: 'Lina Haddad',
    mobile_no: '059-000-0142',
    address_line1: 'Ramallah',
    city: 'Ramallah',
  },
  {
    customer_name: 'Samir Nasser',
    mobile_no: '059-000-0177',
    address_line1: 'Hebron',
    city: 'Hebron',
  },
  // Anonymous counter sales go to this shared customer (decided for release 1).
  { customer_name: 'Walk-in Customer' },
];
for (const c of customers) {
  await ensure(
    'Customer',
    { customer_name: c.customer_name },
    {
      customer_type: 'Individual',
      customer_group: 'Individual',
      territory: 'All Territories',
      ...(c.address_line1 ? { country } : {}),
      ...c,
    },
  );
}

// Card payments go to a bank account; cash keeps the setup wizard's "Cash - RN".
const bank = await ensure(
  'Account',
  { account_name: 'Main bank', company: COMPANY },
  {
    account_name: 'Main bank',
    company: COMPANY,
    parent_account: `Bank Accounts - ${ABBR}`,
    account_type: 'Bank',
    account_currency: 'ILS',
  },
);
const card = await call('frappe.client.get', { doctype: 'Mode of Payment', name: 'Credit Card' });
if (!card.accounts.some((a) => a.company === COMPANY)) {
  card.accounts.push({ company: COMPANY, default_account: bank });
  await call('frappe.client.save', { doc: card });
}
await ensure(
  'Supplier',
  { supplier_name: 'Green Clay' },
  { supplier_name: 'Green Clay', supplier_group: 'All Supplier Groups' },
);
const project = await ensure(
  'Project',
  { project_name: 'Garden installation' },
  { project_name: 'Garden installation', company: COMPANY, status: 'Open' },
);

const invoice = (customer, rate, extra = {}) => ({
  doctype: 'Sales Invoice',
  company: COMPANY,
  customer,
  posting_date: iso(today),
  set_posting_time: 1,
  taxes_and_charges: '',
  taxes: [],
  items: [{ item_code: 'SRV-GARDEN', qty: 1, rate }],
  ...extra,
});

const payInFull = async (invoiceName) => {
  const payment = await call(
    'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry',
    { dt: 'Sales Invoice', dn: invoiceName },
  );
  // With a bank account present ERPNext defaults to it, and bank payments need a reference; pay into cash.
  payment.mode_of_payment = 'Cash';
  payment.paid_to = `Cash - ${ABBR}`;
  await submit(await insert(payment));
};

if (!(await list('Sales Invoice', { docstatus: 1 })).length) {
  await payInFull(
    (await submit(await insert(invoice('Lina Haddad', 640, { due_date: iso(today) })))).name,
  );
}
if (!(await list('Sales Order', { customer: 'Samir Nasser', docstatus: 0 })).length) {
  await insert({
    doctype: 'Sales Order',
    company: COMPANY,
    customer: 'Samir Nasser',
    delivery_date: plusDays(3),
    taxes_and_charges: '',
    taxes: [],
    items: [{ item_code: 'OLV-20', qty: 2, rate: 85, warehouse }],
  });
}

if (!(await list('Purchase Order', { supplier: 'Green Clay', docstatus: 1 })).length) {
  await submit(
    await insert({
      doctype: 'Purchase Order',
      company: COMPANY,
      supplier: 'Green Clay',
      schedule_date: iso(today),
      taxes_and_charges: '',
      taxes: [],
      items: [{ item_code: 'POT-30', qty: 10, rate: 20, warehouse, schedule_date: iso(today) }],
    }),
  );
}

if (
  !(await list('Material Request', { material_request_type: 'Material Transfer', docstatus: 1 }))
    .length
) {
  await submit(
    await insert({
      doctype: 'Material Request',
      company: COMPANY,
      material_request_type: 'Material Transfer',
      schedule_date: iso(today),
      set_from_warehouse: warehouse,
      set_warehouse: `Stores - ${ABBR}`,
      items: [
        {
          item_code: 'POT-30',
          qty: 12,
          schedule_date: iso(today),
          from_warehouse: warehouse,
          warehouse: `Stores - ${ABBR}`,
          project,
        },
      ],
    }),
  );
}

// The project workspace mock: goods delivered to the shared project-site warehouse and a purchase booked to the project.
const siteWarehouse = await ensure(
  'Warehouse',
  { warehouse_name: 'Project sites', company: COMPANY },
  {
    warehouse_name: 'Project sites',
    company: COMPANY,
    parent_warehouse: `All Warehouses - ${ABBR}`,
  },
);
if (!(await list('Stock Entry', { remarks: 'Madar seed site delivery', docstatus: 1 })).length) {
  await submit(
    await insert({
      doctype: 'Stock Entry',
      stock_entry_type: 'Material Transfer',
      company: COMPANY,
      project,
      remarks: 'Madar seed site delivery',
      items: [
        {
          item_code: 'POT-30',
          qty: 3,
          s_warehouse: warehouse,
          t_warehouse: siteWarehouse,
          project,
        },
      ],
    }),
  );
}
if (!(await list('Purchase Order Item', { project }, ['parent'])).length) {
  await submit(
    await insert({
      doctype: 'Purchase Order',
      company: COMPANY,
      supplier: 'Green Clay',
      schedule_date: plusDays(5),
      project,
      taxes_and_charges: '',
      taxes: [],
      items: [
        { item_code: 'POT-30', qty: 4, rate: 20, warehouse, schedule_date: plusDays(5), project },
      ],
    }),
  );
}

// Workers & HR (Frappe HR): the workers, today's attendance and leave of the Workers mocks.
const holidayList = await ensure(
  'Holiday List',
  { holiday_list_name: `${COMPANY} ${today.getFullYear()}` },
  {
    holiday_list_name: `${COMPANY} ${today.getFullYear()}`,
    from_date: `${today.getFullYear()}-01-01`,
    to_date: `${today.getFullYear()}-12-31`,
  },
);
// Frappe HR v16 takes holiday lists from submitted assignments, not the company's default.
if (!(await list('Holiday List Assignment', { assigned_to: COMPANY, docstatus: 1 })).length) {
  await submit(
    await insert({
      doctype: 'Holiday List Assignment',
      applicable_for: 'Company',
      assigned_to: COMPANY,
      holiday_list: holidayList,
      from_date: `${today.getFullYear()}-01-01`,
    }),
  );
}
const departments = {};
for (const name of ['Field team', 'Garden shop']) {
  departments[name] = await ensure(
    'Department',
    { department_name: name, company: COMPANY },
    { department_name: name, company: COMPANY, parent_department: 'All Departments' },
  );
}
for (const name of ['Gardener', 'Cashier', 'Driver']) {
  await ensure('Designation', { name }, { designation_name: name });
}
const workers = [
  ['Khaled', 'Omar', 'Male', '1990-05-14', '2025-03-03', 'Gardener', 'Field team', '059-000-0177'],
  ['Rana', 'Saleh', 'Female', '1994-08-02', '2024-09-15', 'Cashier', 'Garden shop', '059-000-0181'],
  ['Yousef', 'Darwish', 'Male', '1988-01-20', '2023-04-01', 'Driver', 'Field team', '059-000-0190'],
  [
    'Huda',
    'Nasser',
    'Female',
    '1992-11-09',
    '2022-02-01',
    'Cashier',
    'Garden shop',
    '059-000-0163',
  ],
];
const employee = {};
for (const [first, last, gender, birth, joined, designation, department, phone] of workers) {
  employee[first] = await ensure(
    'Employee',
    { first_name: first, last_name: last, company: COMPANY },
    {
      first_name: first,
      last_name: last,
      gender,
      date_of_birth: birth,
      date_of_joining: joined,
      designation,
      department: departments[department],
      cell_number: phone,
      company: COMPANY,
      ...(first === 'Huda' ? { status: 'Left', relieving_date: '2026-06-30' } : {}),
    },
  );
}
if (
  !(await list('Attendance', { employee: employee.Khaled, attendance_date: iso(today) })).length
) {
  await submit(
    await insert({
      doctype: 'Attendance',
      employee: employee.Khaled,
      attendance_date: iso(today),
      status: 'Present',
      company: COMPANY,
    }),
  );
}
for (const first of ['Khaled', 'Rana', 'Yousef']) {
  if (
    !(
      await list('Leave Allocation', {
        employee: employee[first],
        leave_type: 'Privilege Leave',
        docstatus: 1,
      })
    ).length
  ) {
    await submit(
      await insert({
        doctype: 'Leave Allocation',
        employee: employee[first],
        leave_type: 'Privilege Leave',
        from_date: `${today.getFullYear()}-01-01`,
        to_date: `${today.getFullYear()}-12-31`,
        new_leaves_allocated: 14,
      }),
    );
  }
}
if (!(await list('Leave Application', { employee: employee.Rana })).length) {
  await submit(
    await insert({
      doctype: 'Leave Application',
      employee: employee.Rana,
      leave_type: 'Privilege Leave',
      from_date: plusDays(-1),
      to_date: plusDays(3),
      status: 'Approved',
      company: COMPANY,
    }),
  );
}

// Advances: ERPNext's default Employee Advances account must be receivable, as Frappe HR requires.
await call('frappe.client.set_value', {
  doctype: 'Account',
  name: `Employee Advances - ${ABBR}`,
  fieldname: 'account_type',
  value: 'Receivable',
});
if (!(await list('Employee Advance', { employee: employee.Khaled, docstatus: 1 })).length) {
  const advance = await insert({
    doctype: 'Employee Advance',
    employee: employee.Khaled,
    posting_date: iso(today),
    purpose: 'Medical bill',
    advance_amount: 300,
    company: COMPANY,
    currency: 'ILS',
    advance_account: `Employee Advances - ${ABBR}`,
    mode_of_payment: 'Cash',
    docstatus: 1,
  });
  const payment = await api(
    'GET',
    `/api/method/hrms.overrides.employee_payment_entry.get_payment_entry_for_employee?dt=Employee%20Advance&dn=${advance.name}`,
  ).then((r) => r.message);
  await insert({ ...payment, reference_no: 'Madar seed', reference_date: iso(today), docstatus: 1 });
}

// Shifts for the Assign shift mock: Khaled works mornings.
for (const [name, start, end] of [
  ['Morning', '07:00:00', '15:00:00'],
  ['Evening', '13:00:00', '21:00:00'],
]) {
  await ensure('Shift Type', { name }, { __newname: name, name, start_time: start, end_time: end });
}
if (!(await list('Shift Assignment', { employee: employee.Khaled, docstatus: 1 })).length) {
  await insert({
    doctype: 'Shift Assignment',
    employee: employee.Khaled,
    shift_type: 'Morning',
    start_date: `${today.getFullYear()}-01-01`,
    company: COMPANY,
    status: 'Active',
    docstatus: 1,
  });
}

const users = [
  {
    email: 'rehan@rehan.example',
    first_name: 'Rehan',
    last_name: 'Mansour',
    roles: [
      'System Manager',
      'Accounts Manager',
      'Sales Manager',
      'Purchase Manager',
      'Stock Manager',
      'Projects Manager',
      'HR Manager',
      'Expense Approver',
    ],
  },
  {
    email: 'lina@rehan.example',
    first_name: 'Lina',
    last_name: 'Saleh',
    roles: ['Sales User', 'Accounts User'],
  },
  { email: 'omar@rehan.example', first_name: 'Omar', last_name: 'Khalil', roles: ['Stock User'] },
  {
    email: 'sami@rehan.example',
    first_name: 'Sami',
    last_name: 'Odeh',
    // Store associate: sells at the counter and handles stock (see docs/PERMISSIONS.md).
    roles: ['Sales User', 'Accounts User', 'Stock User'],
  },
  {
    email: 'nadia@rehan.example',
    first_name: 'Nadia',
    last_name: 'Barakat',
    // Purchasing officer; Accounts User lets her record supplier invoices (see docs/PERMISSIONS.md).
    roles: ['Purchase User', 'Stock User', 'Accounts User'],
  },
  {
    email: 'yara@rehan.example',
    first_name: 'Yara',
    last_name: 'Nasser',
    // Project manager: runs projects and requests and supplies their materials.
    roles: ['Projects User', 'Stock User'],
  },
];
for (const u of users) {
  const [existing] = await list('User', { name: u.email });
  if (!existing) {
    await insert({
      doctype: 'User',
      email: u.email,
      first_name: u.first_name,
      last_name: u.last_name,
      send_welcome_email: 0,
      new_password: DEV_PASSWORD,
      user_type: 'System User',
    });
  }
  const doc = await call('frappe.client.get', { doctype: 'User', name: u.email });
  const have = new Set(doc.roles.map((r) => r.role));
  const missing = u.roles.filter((r) => !have.has(r));
  if (missing.length || existing) {
    doc.roles = [...doc.roles, ...missing.map((role) => ({ role }))];
    doc.new_password = DEV_PASSWORD;
    await call('frappe.client.save', { doc });
  }
}

// Created as the salesperson so their own sales (ILS 640 of today's ILS 1,280), draft, and
// follow-up invoice match the salesperson mock.
await api('POST', '/api/method/login', { usr: 'lina@rehan.example', pwd: DEV_PASSWORD });
if (!(await list('Sales Invoice', { owner: 'lina@rehan.example' })).length) {
  await submit(await insert(invoice('Samir Nasser', 460, { due_date: plusDays(1) })));
  const walkIn = await submit(await insert(invoice('Lina Haddad', 180, { due_date: iso(today) })));
  await insert(invoice('Lina Haddad', 320, { due_date: plusDays(7) }));
  await api('POST', '/api/method/login', {
    usr: arg('user', 'Administrator'),
    pwd: arg('password', 'admin'),
  });
  await payInFull(walkIn.name);
}

console.log(
  `Seeded ${COMPANY} at ${BASE}. Users (password ${DEV_PASSWORD}): ${users.map((u) => u.email).join(', ')}`,
);
