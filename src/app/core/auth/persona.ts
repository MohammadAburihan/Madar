export type Persona = 'owner' | 'salesperson' | 'storeAssociate' | 'warehouse' | 'purchasing';

const OWNER_ROLES = ['System Manager', 'Accounts Manager'];
const SALES_ROLES = ['Sales User', 'Sales Manager'];
const STOCK_ROLES = ['Stock User', 'Stock Manager'];
const PURCHASE_ROLES = ['Purchase User', 'Purchase Manager'];

// Role names are ERPNext defaults; the mapping is documented in docs/PERMISSIONS.md.
export function personaFor(roles: readonly string[]): Persona {
  const has = (candidates: string[]) => candidates.some((role) => roles.includes(role));
  if (has(OWNER_ROLES)) {
    return 'owner';
  }
  // Purchasing officers also hold Stock User (to receive) and Accounts User (supplier invoices).
  if (has(PURCHASE_ROLES)) {
    return 'purchasing';
  }
  if (has(SALES_ROLES) && has(STOCK_ROLES)) {
    return 'storeAssociate';
  }
  if (has(SALES_ROLES)) {
    return 'salesperson';
  }
  if (has(STOCK_ROLES)) {
    return 'warehouse';
  }
  return 'owner';
}

/** Personas whose Home and sales views are limited to their own documents. */
export const OWN_SALES_ONLY: readonly Persona[] = ['salesperson', 'storeAssociate'];
