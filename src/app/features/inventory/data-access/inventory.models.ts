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
