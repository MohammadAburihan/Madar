export interface WarehouseInfo {
  id: string;
  name: string;
}

export interface StockItem {
  code: string;
  name: string;
  uom: string;
  /** Actual quantity per warehouse id. */
  stock: Record<string, number>;
  /** Some warehouse is at or below its reorder level. */
  low: boolean;
}

export interface Movement {
  voucherType: string;
  voucher: string;
  postingDate: string;
  postingTime: string;
  /**
   * One line per warehouse the voucher touched: positive in, negative out, and the balance after. A stock
   * count (Stock Reconciliation) records 0 as its change; only `after` says what was counted.
   */
  lines: { warehouse: string; qty: number; after: number }[];
}

export interface InventoryOverview {
  warehouses: WarehouseInfo[];
  items: StockItem[];
  /** Submitted stock entries posted today; null when the role can't read them. */
  movesToday: number | null;
}

export interface TransferRequest {
  reference: string;
  company: string;
  item: string;
  uom: string;
  qty: number;
  from: string;
  to: string;
}

export interface TransferResult {
  entry: string;
  postingDate: string;
  postingTime: string;
  /** Balances after the move, read back from ERPNext; null when they couldn't be read. */
  fromQty: number | null;
  toQty: number | null;
  totalQty: number | null;
}

export function totalStock(item: Pick<StockItem, 'stock'>): number {
  return Object.values(item.stock).reduce((sum, qty) => sum + qty, 0);
}

/** A stock count sets a location's quantity to what was counted; damage or loss writes some off. */
export type AdjustKind = 'count' | 'damage';

export type DamageType = 'damaged' | 'lost' | 'expired';

export interface AdjustRequest {
  kind: AdjustKind;
  reference: string;
  company: string;
  item: string;
  uom: string;
  warehouse: string;
  /** The location's quantity as the user saw it; a count posts the difference from it. */
  systemQty: number;
  /** Count: the quantity counted. Damage: the quantity written off. */
  qty: number;
  /** Damage or loss only. */
  damageType: DamageType | null;
  reason: string;
}

export interface AdjustResult {
  entry: string;
  postingDate: string;
  postingTime: string;
  /** Balances after the adjustment, read back from ERPNext; null when they couldn't be read. */
  warehouseQty: number | null;
  totalQty: number | null;
}

/** What a request changes at its location: positive adds stock, negative takes it out. */
export function adjustChange(request: Pick<AdjustRequest, 'kind' | 'qty' | 'systemQty'>): number {
  return request.kind === 'count' ? request.qty - request.systemQty : -request.qty;
}

/** Stock that comes in without a purchase: what the business had when it started, or grew or made. */
export type AddStockReason = 'opening' | 'made';

export interface AddStockRequest {
  reference: string;
  company: string;
  warehouse: string;
  reason: AddStockReason;
  /** `rate` null takes the item's own cost (its opening cost or last valuation). */
  lines: { item: string; name: string; uom: string; qty: number; rate: number | null }[];
}

export interface AddStockResult {
  entry: string;
  postingDate: string;
  postingTime: string;
}
