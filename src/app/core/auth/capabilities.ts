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
}

const SALES_ROLE: Capabilities = {
  sell: true,
  sellToWalkIn: true,
  editPrice: false,
  maxDiscount: 10,
  paymentModes: ['Cash', 'Credit Card'],
  collect: true,
  money: 'own',
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
  },
  salesperson: SALES_ROLE,
  storeAssociate: SALES_ROLE,
  warehouse: {
    sell: false,
    sellToWalkIn: false,
    editPrice: false,
    maxDiscount: 0,
    paymentModes: [],
    collect: false,
    money: 'none',
  },
};

export function capabilitiesFor(persona: Persona): Capabilities {
  return CAPABILITIES[persona];
}
