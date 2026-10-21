import { Capabilities } from '../auth/capabilities';
import { OWN_SALES_ONLY, Persona } from '../auth/persona';
import { DraftKind } from './draft-kind';

/**
 * Madar's side of docs/PERMISSIONS.md "Delete a draft": a draft the role could make, and for salespeople and
 * store associates only their own sales drafts. ERPNext's own delete right is checked separately.
 */
export function mayDeleteDraft(
  kind: DraftKind,
  caps: Pick<Capabilities, 'sell' | 'orderPurchases' | 'paySuppliers'>,
  persona: Persona,
  mine: boolean,
): boolean {
  switch (kind) {
    case 'sale':
    case 'quotation':
    case 'order':
      return caps.sell && (mine || !OWN_SALES_ONLY.includes(persona));
    case 'purchase':
      return caps.orderPurchases;
    case 'payment':
      return caps.paySuppliers;
  }
}
