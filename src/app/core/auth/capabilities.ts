import { Persona } from './persona';

/** Madar-side rules from docs/PERMISSIONS.md; ERPNext still enforces document permissions on every write. */
export interface Capabilities {
  sell: boolean;
  sellToWalkIn: boolean;
  editPrice: boolean;
  /** Highest discount the role may give, in percent. */
  maxDiscount: number;
  /** Modes of Payment the role may take money into; 'all' for any enabled mode. */
  paymentModes: 'all' | readonly string[];
  /** Receive customer payments against their invoices. */
  collect: boolean;
  /** Payment history on the Money page: every payment, only the user's own, or none. */
  money: 'all' | 'own' | 'none';
  /** Move stock between the business's warehouses. */
  transferStock: boolean;
  /** Create and confirm purchase orders. */
  orderPurchases: boolean;
  /** Record goods arriving against a purchase order. */
  receiveGoods: boolean;
  /** See buying prices, order values and supplier balances. */
  seeCosts: boolean;
  /** Record the supplier's invoice for goods received against an order. */
  recordSupplierInvoices: boolean;
  /** Pay supplier invoices from the business's payment accounts. */
  paySuppliers: boolean;
  /** Record operating expenses paid from the business's payment accounts. */
  recordExpenses: boolean;
  /** See projects, and create and edit them and their material requirements. */
  manageProjects: boolean;
  /** Send stock to a project's site. */
  supplyProjects: boolean;
  /** Profit, money in and out, and statements (docs/PERMISSIONS.md: owner only). */
  seeReports: boolean;
  /** Deliver a sales order's goods and mark its service work done. */
  deliverOrders: boolean;
  /** Invoice what a sales order still has to bill. */
  invoiceOrders: boolean;
  /** Take back sold items against their invoice with a credit note. */
  returnSales: boolean;
  /** Add customers and edit their contact details. */
  editCustomers: boolean;
  /** Add suppliers. */
  addSuppliers: boolean;
  /** Edit suppliers' contact details. */
  editSuppliers: boolean;
  /** See, add and edit workers (Frappe HR Employees). */
  manageWorkers: boolean;
  /** Pay workers an advance from the business's payment accounts. */
  giveAdvances: boolean;
  /** Record what a customer or supplier already owed before Madar, as an opening invoice. */
  recordOpeningBalance: boolean;
  /** The Approvals inbox: steps ERPNext's workflows let the user's roles take. */
  approve: boolean;
  /** See and edit a contact's bank details (a Bank Account in ERPNext; Accounts User or Manager). */
  editBankDetails: boolean;
  /** Also add a bank that isn't in the list (a Bank record; only System Manager may create one). */
  addBanks: boolean;
  /** Add and edit items and services (ERPNext needs Item Manager). */
  manageItems: boolean;
  /** Set an item's selling price while adding or editing it (needs Sales Master Manager too). */
  setItemPrices: boolean;
}

const SALES_ROLE: Capabilities = {
  sell: true,
  sellToWalkIn: true,
  editPrice: false,
  maxDiscount: 10,
  paymentModes: ['Cash', 'Credit Card'],
  collect: true,
  money: 'own',
  transferStock: false,
  orderPurchases: false,
  receiveGoods: false,
  seeCosts: false,
  recordSupplierInvoices: false,
  paySuppliers: false,
  recordExpenses: false,
  manageProjects: false,
  supplyProjects: false,
  seeReports: false,
  deliverOrders: true,
  invoiceOrders: true,
  returnSales: true,
  editCustomers: true,
  addSuppliers: false,
  editSuppliers: false,
  editBankDetails: false,
  addBanks: false,
  manageWorkers: false,
  giveAdvances: false,
  recordOpeningBalance: false,
  approve: false,
  manageItems: false,
  setItemPrices: false,
};

const CAPABILITIES: Record<Persona, Capabilities> = {
  owner: {
    sell: true,
    sellToWalkIn: true,
    editPrice: true,
    maxDiscount: 100,
    paymentModes: 'all',
    collect: true,
    money: 'all',
    transferStock: true,
    orderPurchases: true,
    receiveGoods: true,
    seeCosts: true,
    recordSupplierInvoices: true,
    paySuppliers: true,
    recordExpenses: true,
    manageProjects: true,
    supplyProjects: true,
    seeReports: true,
    deliverOrders: true,
    invoiceOrders: true,
    returnSales: true,
    editCustomers: true,
    addSuppliers: true,
    editSuppliers: true,
    editBankDetails: true,
    addBanks: true,
    manageWorkers: true,
    giveAdvances: true,
    recordOpeningBalance: true,
    approve: true,
    manageItems: true,
    setItemPrices: true,
  },
  salesperson: SALES_ROLE,
  storeAssociate: { ...SALES_ROLE, transferStock: true, receiveGoods: true, supplyProjects: true },
  warehouse: {
    sell: false,
    sellToWalkIn: false,
    editPrice: false,
    maxDiscount: 0,
    paymentModes: [],
    collect: false,
    money: 'none',
    transferStock: true,
    orderPurchases: false,
    receiveGoods: true,
    seeCosts: false,
    recordSupplierInvoices: false,
    paySuppliers: false,
    recordExpenses: false,
    manageProjects: false,
    supplyProjects: true,
    seeReports: false,
    deliverOrders: false,
    invoiceOrders: false,
    returnSales: false,
    editCustomers: false,
    addSuppliers: false,
    editSuppliers: false,
    editBankDetails: false,
    addBanks: false,
    manageWorkers: false,
    giveAdvances: false,
    recordOpeningBalance: false,
    approve: false,
    manageItems: false,
    setItemPrices: false,
  },
  projectManager: {
    sell: false,
    sellToWalkIn: false,
    editPrice: false,
    maxDiscount: 0,
    paymentModes: [],
    collect: false,
    money: 'none',
    transferStock: false,
    orderPurchases: false,
    receiveGoods: false,
    seeCosts: false,
    recordSupplierInvoices: false,
    paySuppliers: false,
    recordExpenses: false,
    manageProjects: true,
    supplyProjects: true,
    seeReports: false,
    deliverOrders: false,
    invoiceOrders: false,
    returnSales: false,
    editCustomers: true,
    addSuppliers: false,
    editSuppliers: false,
    editBankDetails: false,
    addBanks: false,
    manageWorkers: false,
    giveAdvances: false,
    recordOpeningBalance: false,
    approve: false,
    manageItems: false,
    setItemPrices: false,
  },
  purchasing: {
    sell: false,
    sellToWalkIn: false,
    editPrice: false,
    maxDiscount: 0,
    paymentModes: [],
    collect: false,
    money: 'none',
    transferStock: false,
    orderPurchases: true,
    receiveGoods: true,
    seeCosts: true,
    recordSupplierInvoices: true,
    // Accounts User could pay in ERPNext; paying suppliers stays with the Owner (docs/PERMISSIONS.md).
    paySuppliers: false,
    recordExpenses: false,
    manageProjects: false,
    supplyProjects: false,
    seeReports: false,
    deliverOrders: false,
    invoiceOrders: false,
    returnSales: false,
    editCustomers: false,
    addSuppliers: true,
    editSuppliers: true,
    editBankDetails: false,
    addBanks: false,
    manageWorkers: false,
    giveAdvances: false,
    recordOpeningBalance: false,
    approve: false,
    manageItems: true,
    setItemPrices: false,
  },
};

// Moving stock needs three ERPNext v16 permissions; a role list for each (from the doctypes' permissions).
// Purchase Order create and submit in v16.
const ORDER_PURCHASES_ROLES = ['Purchase User', 'Purchase Manager'];

// Receiving reads the Purchase Order and creates and submits a Purchase Receipt (v16 permissions).
const RECEIVE_GOODS_NEEDS = [
  ['Purchase User', 'Purchase Manager', 'Stock User'], // read Purchase Order
  ['Purchase User', 'Stock User', 'Stock Manager'], // create and submit Purchase Receipt
  [
    'Stock User',
    'Item Manager',
    'Sales User',
    'Purchase User',
    'Accounts User',
    'Manufacturing User',
  ], // read Warehouse, to choose where the goods go
];

const MOVE_STOCK_NEEDS = [
  ['Stock User', 'Stock Manager', 'Manufacturing User', 'Manufacturing Manager'], // create Stock Entry
  [
    'Stock User',
    'Stock Manager',
    'Sales User',
    'Sales Manager',
    'Purchase User',
    'Purchase Manager',
  ], // read Bin
  [
    'Stock User',
    'Item Manager',
    'Sales User',
    'Purchase User',
    'Accounts User',
    'Manufacturing User',
  ], // read Warehouse
];

// Billing reads the order and its receipts and creates and submits a Purchase Invoice (v16 permissions).
const RECORD_INVOICE_NEEDS = [
  ['Purchase User', 'Purchase Manager', 'Stock User'], // read Purchase Order
  ['Purchase User', 'Accounts User', 'Stock User', 'Stock Manager'], // read Purchase Receipt
  ['Accounts User', 'Accounts Manager'], // create and submit Purchase Invoice
];

// Paying reads the invoice and the payment accounts and creates and submits a Payment Entry (v16 permissions).
const PAY_SUPPLIERS_NEEDS = [
  ['Accounts User', 'Accounts Manager', 'Purchase User', 'Auditor'], // read Purchase Invoice
  ['Accounts User', 'Accounts Manager'], // read Mode of Payment; create and submit Payment Entry
];

// Recording reads expense and payment accounts and creates and submits a Journal Entry (v16 permissions).
const RECORD_EXPENSES_NEEDS = [
  ['Accounts User', 'Accounts Manager'], // read Account and Mode of Payment; create and submit Journal Entry
];

// Projects and tasks are Projects User/Manager doctypes; requirements are Material Requests (stock or purchase roles).
const MANAGE_PROJECTS_NEEDS = [
  ['Projects User', 'Projects Manager'], // read, create and write Project (tasks need Projects User)
  ['Stock User', 'Stock Manager', 'Purchase User', 'Purchase Manager'], // create and submit Material Request
];

// Supplying reads the project and its requests, and creates and submits a Stock Entry (v16 permissions).
const SUPPLY_PROJECTS_NEEDS = [
  ['Projects User', 'Projects Manager'], // read Project
  ['Stock User', 'Stock Manager'], // read Material Request and Bin; create and submit Stock Entry
  ['Stock User', 'Accounts Manager'], // read Stock Ledger Entry (the project's site stock); Stock Manager can't
];

// Delivering reads the order, warehouses and their stock, and creates and submits a Delivery Note (v16 permissions).
const DELIVER_ORDERS_NEEDS = [
  ['Sales User', 'Sales Manager', 'Accounts User', 'Stock User', 'Maintenance User'], // read Sales Order
  ['Sales User', 'Stock User', 'Stock Manager', 'Delivery User', 'Delivery Manager'], // create and submit Delivery Note
  [
    'Stock User',
    'Stock Manager',
    'Sales User',
    'Sales Manager',
    'Purchase User',
    'Purchase Manager',
  ], // read Bin
  [
    'Stock User',
    'Item Manager',
    'Sales User',
    'Purchase User',
    'Accounts User',
    'Manufacturing User',
  ], // read Warehouse
];

// Invoicing an order reads it and creates and submits a Sales Invoice (v16 permissions).
const INVOICE_ORDERS_NEEDS = [
  ['Sales User', 'Sales Manager', 'Accounts User', 'Stock User', 'Maintenance User'], // read Sales Order
  ['Accounts User', 'Accounts Manager'], // create and submit Sales Invoice
];

// A return reads the invoice and the warehouses, and creates and submits a credit note (v16 permissions).
const RETURN_SALES_NEEDS = [
  ['Accounts User', 'Accounts Manager'], // read, create and submit Sales Invoice
  [
    'Stock User',
    'Item Manager',
    'Sales User',
    'Purchase User',
    'Accounts User',
    'Manufacturing User',
  ], // read Warehouse
];

// Customers are created and edited by sales roles, with their Contact and Address (v16 permissions).
const EDIT_CUSTOMERS_NEEDS = [['Sales User', 'Sales Master Manager']];
// Only Purchase Master Manager may create suppliers in v16; Purchase Manager may edit them.
const ADD_SUPPLIERS_NEEDS = [['Purchase Master Manager']];
const EDIT_SUPPLIERS_NEEDS = [['Purchase Manager', 'Purchase Master Manager']];

// A contact's bank details are a Bank Account (Accounts User/Manager); the bank list is read with select permission.
const EDIT_BANK_DETAILS_NEEDS = [['Accounts User', 'Accounts Manager']];
// Bank (the record behind the list) can be created by System Manager only.
const ADD_BANKS_ROLES = ['System Manager'];

// Workers are Employees, with their Department and Designation; only HR User/Manager may read them in Frappe HR.
const HR_ROLES = ['HR User', 'HR Manager'];

// An advance is an Employee Advance (only Expense Approver may submit it) paid by a Payment Entry (accounts roles).
const GIVE_ADVANCES_NEEDS = [HR_ROLES, ['Expense Approver'], ['Accounts User', 'Accounts Manager']];

// An opening invoice is a Sales or Purchase Invoice created and submitted against a Temporary account (v16 permissions).
const RECORD_OPENING_BALANCE_NEEDS = [['Accounts User', 'Accounts Manager']];

// Reports read the general ledger and the chart of accounts (v16 permissions).
const SEE_REPORTS_NEEDS = [['Accounts User', 'Accounts Manager', 'Auditor']];

/**
 * The persona's rules, narrowed by the user's actual ERPNext roles where a persona can hold users who can't
 * do the task (an owner who is only an Accounts Manager can't move stock).
 */
export function capabilitiesFor(persona: Persona, roles?: readonly string[]): Capabilities {
  const caps = CAPABILITIES[persona];
  if (!roles) {
    return caps;
  }
  return {
    ...caps,
    transferStock:
      caps.transferStock &&
      MOVE_STOCK_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    orderPurchases:
      caps.orderPurchases && ORDER_PURCHASES_ROLES.some((role) => roles.includes(role)),
    receiveGoods:
      caps.receiveGoods &&
      RECEIVE_GOODS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    recordSupplierInvoices:
      caps.recordSupplierInvoices &&
      RECORD_INVOICE_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    paySuppliers:
      caps.paySuppliers &&
      PAY_SUPPLIERS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    recordExpenses:
      caps.recordExpenses &&
      RECORD_EXPENSES_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    manageProjects:
      caps.manageProjects &&
      MANAGE_PROJECTS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    supplyProjects:
      caps.supplyProjects &&
      SUPPLY_PROJECTS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    seeReports:
      caps.seeReports &&
      SEE_REPORTS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    deliverOrders:
      caps.deliverOrders &&
      DELIVER_ORDERS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    invoiceOrders:
      caps.invoiceOrders &&
      INVOICE_ORDERS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    returnSales:
      caps.returnSales &&
      RETURN_SALES_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    editCustomers:
      caps.editCustomers &&
      EDIT_CUSTOMERS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    addSuppliers:
      caps.addSuppliers &&
      ADD_SUPPLIERS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    editSuppliers:
      caps.editSuppliers &&
      EDIT_SUPPLIERS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    editBankDetails:
      caps.editBankDetails &&
      EDIT_BANK_DETAILS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    addBanks:
      caps.addBanks &&
      EDIT_BANK_DETAILS_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))) &&
      ADD_BANKS_ROLES.some((role) => roles.includes(role)),
    // HR is added to any role (docs/PERMISSIONS.md): the HR roles alone decide it.
    manageWorkers: HR_ROLES.some((role) => roles.includes(role)),
    giveAdvances:
      caps.giveAdvances &&
      GIVE_ADVANCES_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    recordOpeningBalance:
      caps.recordOpeningBalance &&
      RECORD_OPENING_BALANCE_NEEDS.every((allowed) => allowed.some((role) => roles.includes(role))),
    // HR roles decide leave there; ERPNext's workflows decide what else each role may approve.
    approve: caps.approve || HR_ROLES.some((role) => roles.includes(role)),
    manageItems: caps.manageItems && roles.includes('Item Manager'),
    // ERPNext creates and changes the price as an Item Price, which needs Sales Master Manager; the selling
    // price list it goes on is read from Selling Settings, open only to System Manager and Sales Manager.
    setItemPrices:
      caps.setItemPrices &&
      roles.includes('Item Manager') &&
      roles.includes('Sales Master Manager') &&
      (roles.includes('System Manager') || roles.includes('Sales Manager')),
  };
}
