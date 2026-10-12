export type Persona = 'owner' | 'salesperson' | 'warehouse';

const OWNER_ROLES = ['System Manager', 'Accounts Manager'];
const SALES_ROLES = ['Sales User', 'Sales Manager'];
const STOCK_ROLES = ['Stock User', 'Stock Manager'];

// Role names are ERPNext defaults; the final permission matrix is still an open product decision.
export function personaFor(roles: readonly string[]): Persona {
  const has = (candidates: string[]) => candidates.some((role) => roles.includes(role));
  if (has(OWNER_ROLES)) {
    return 'owner';
  }
  if (has(SALES_ROLES)) {
    return 'salesperson';
  }
  if (has(STOCK_ROLES)) {
    return 'warehouse';
  }
  return 'owner';
}
