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
  },
  salesperson: SALES_ROLE,
  storeAssociate: { ...SALES_ROLE, transferStock: true, receiveGoods: true },
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
  ['Projects User', 'Projects Manager'], // read, create and write Project and Task
  ['Stock User', 'Stock Manager', 'Purchase User', 'Purchase Manager'], // create and submit Material Request
];

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
  };
}
