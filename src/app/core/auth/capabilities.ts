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
}

const SALES_ROLE: Capabilities = {
  sell: true,
  sellToWalkIn: true,
  editPrice: false,
  maxDiscount: 10,
  paymentModes: ['Cash', 'Credit Card'],
};

const CAPABILITIES: Record<Persona, Capabilities> = {
  owner: { sell: true, sellToWalkIn: true, editPrice: true, maxDiscount: 100, paymentModes: 'all' },
  salesperson: SALES_ROLE,
  storeAssociate: SALES_ROLE,
  warehouse: {
    sell: false,
    sellToWalkIn: false,
    editPrice: false,
    maxDiscount: 0,
    paymentModes: [],
  },
};

export function capabilitiesFor(persona: Persona): Capabilities {
  return CAPABILITIES[persona];
}
