import { round2 } from '../../../core/format/number';

export interface PurchaseItem {
  code: string;
  name: string;
  uom: string;
  kind: 'product' | 'service';
  /** The buying price ERPNext suggests (Buying Settings price list, else the last purchase rate). */
  rate: number;
}

export interface OrderLine {
  item: PurchaseItem;
  qty: number;
  rate: number;
}

export interface OrderRequest {
  reference: string;
  company: string;
  /** The company currency, which Madar's buying prices are in. */
  currency: string;
  supplier: string;
  /** "Required By" on every line; ERPNext rejects an order without it. */
  scheduleDate: string;
  lines: { item: string; uom: string; qty: number; rate: number }[];
}

/** Where an order stands, from ERPNext's received and billed percentages. */
export type OrderProgress =
  'draft' | 'awaitingReceipt' | 'partlyReceived' | 'awaitingInvoice' | 'complete' | 'closed';

export interface OrderSummary {
  name: string;
  supplier: string;
  supplierName: string;
  date: string;
  total: number;
  progress: OrderProgress;
  orderedQty: number;
  receivedQty: number;
}

export interface OrderLineDetail {
  code: string;
  name: string;
  uom: string;
  qty: number;
  receivedQty: number;
  rate: number;
  amount: number;
}

export interface OrderDetail extends OrderSummary {
  lines: OrderLineDetail[];
}

export interface PurchasingOverview {
  orders: OrderSummary[];
  /** Unpaid supplier invoices in company currency; null when the role can't read them. */
  supplierBalance: number | null;
}

export function orderProgress(order: {
  docstatus: number;
  status: string;
  per_received: number;
  per_billed: number;
}): OrderProgress {
  if (order.docstatus === 0) {
    return 'draft';
  }
  if (order.status === 'Closed') {
    return 'closed';
  }
  if (order.per_received <= 0) {
    return 'awaitingReceipt';
  }
  if (order.per_received < 100) {
    return 'partlyReceived';
  }
  return order.per_billed < 100 ? 'awaitingInvoice' : 'complete';
}

/** Still expecting goods or an invoice. */
export function isOpen(progress: OrderProgress): boolean {
  return progress !== 'draft' && progress !== 'complete' && progress !== 'closed';
}

export function linesTotal(lines: readonly { qty: number; rate: number }[]): number {
  return round2(lines.reduce((sum, l) => sum + l.qty * l.rate, 0));
}
