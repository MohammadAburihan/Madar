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
  },
};

// Moving stock needs three ERPNext v16 permissions; a role list for each (from the doctypes' permissions).
// Purchase Order create and submit in v16.
const ORDER_PURCHASES_ROLES = ['Purchase User', 'Purchase Manager'];

// Receiving reads the Purchase Order and creates and submits a Purchase Receipt (v16 permissions).
const RECEIVE_GOODS_NEEDS = [
  ['Purchase User', 'Purchase Manager', 'Stock User'], // read Purchase Order
  ['Purchase User', 'Stock User', 'Stock Manager'], // create and submit Purchase Receipt
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
  };
}
