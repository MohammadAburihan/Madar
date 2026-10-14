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
  },
  salesperson: SALES_ROLE,
  storeAssociate: { ...SALES_ROLE, transferStock: true },
  warehouse: {
    sell: false,
    sellToWalkIn: false,
    editPrice: false,
    maxDiscount: 0,
    paymentModes: [],
    collect: false,
    money: 'none',
    transferStock: true,
  },
};

// ERPNext v16 lets only these roles create a Stock Entry.
const STOCK_ENTRY_ROLES = [
  'Stock User',
  'Stock Manager',
  'Manufacturing User',
  'Manufacturing Manager',
];

/**
 * The persona's rules, narrowed by the user's actual ERPNext roles where a persona can hold users who can't
 * do the task (an owner who is only an Accounts Manager can't move stock).
 */
export function capabilitiesFor(persona: Persona, roles?: readonly string[]): Capabilities {
  const caps = CAPABILITIES[persona];
  if (!roles || !caps.transferStock) {
    return caps;
  }
  return { ...caps, transferStock: STOCK_ENTRY_ROLES.some((role) => roles.includes(role)) };
}
