export type ItemKind = 'product' | 'service';

/** One line of the catalog: a stocked product or a service. */
export interface CatalogItem {
  code: string;
  name: string;
  group: string;
  uom: string;
  kind: ItemKind;
  /** Selling price on the business's selling price list; null when none is set or the role can't read prices. */
  price: number | null;
  /** On hand across the business's locations; null for services or when stock can't be read. */
  onHand: number | null;
}

export interface ItemDetail extends CatalogItem {
  barcode: string;
  /** Buying cost (ERPNext's valuation rate). */
  cost: number;
  /** Per location; null for services or when stock can't be read. */
  stock: { warehouse: string; qty: number }[] | null;
  /** False when the role can't read prices: no price shown, rather than "not set". */
  priceReadable: boolean;
  /** When ERPNext last saved it: an edit saved over a later change is refused. */
  modified: string;
}

export interface ItemFormValue {
  kind: ItemKind;
  name: string;
  code: string;
  barcode: string;
  group: string;
  uom: string;
  /** Set only by roles that may set selling prices. */
  price: number | null;
  /** Products only, from roles that see costs. */
  cost: number | null;
}

export interface ItemOptions {
  groups: string[];
  uoms: string[];
}
