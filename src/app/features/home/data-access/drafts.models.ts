import { DraftKind } from '../../../core/drafts/draft-kind';

export type { DraftKind };

/** One unfinished document, from any area, as the Unfinished work page lists it. */
export interface DraftEntry {
  kind: DraftKind;
  /** The ERPNext document's name. */
  name: string;
  /** The customer or supplier. */
  party: string;
  modified: string;
  /** The document's total in its own currency. */
  total: number;
  currency: string;
  /** Item quantities added up; null for a payment. */
  units: number | null;
  /** Madar made it and can finish it. Anything else is only opened. */
  continuable: boolean;
  /** For a payment, the supplier invoice it pays. */
  invoice: string | null;
  /** Who made it. */
  owner: string;
  /** ERPNext lets the user's roles delete it, and Madar's rules agree. */
  deletable: boolean;
}

export interface DraftsScope {
  company: string;
  userId: string;
  /** Salespeople and store associates list only their own sales documents. */
  ownSalesOnly: boolean;
  sell: boolean;
  orderPurchases: boolean;
  paySuppliers: boolean;
}

export interface DraftsLoadResult {
  entries: DraftEntry[];
  /** Every query was refused, which is what an expired session looks like. */
  allForbidden: boolean;
}
