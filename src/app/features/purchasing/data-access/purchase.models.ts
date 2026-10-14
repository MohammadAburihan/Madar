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
  | 'draft'
  | 'awaitingReceipt'
  | 'partlyReceived'
  | 'awaitingInvoice'
  | 'complete'
  | 'onHold'
  | 'closed'
  | 'cancelled';

export interface OrderSummary {
  name: string;
  supplier: string;
  supplierName: string;
  date: string;
  /** The order's own currency, which its rates and total are in. */
  currency: string;
  total: number;
  progress: OrderProgress;
  orderedQty: number;
  receivedQty: number;
}

export interface OrderLineDetail {
  /** The order row's name, which a receipt line points back to. */
  row: string;
  code: string;
  name: string;
  uom: string;
  qty: number;
  receivedQty: number;
  rate: number;
  amount: number;
  /** What supplier invoices have billed for this row so far, in the order's currency. */
  billedAmount: number;
  /** Where the order expects the goods. */
  warehouse: string | null;
}

export interface OrderDetail extends OrderSummary {
  lines: OrderLineDetail[];
}

export interface ReceiptRequest {
  reference: string;
  order: string;
  warehouse: string;
  /** Only rows receiving something; qty is in the row's unit. */
  lines: { row: string; qty: number }[];
}

export interface InvoiceLine {
  code: string;
  name: string;
  uom: string;
  qty: number;
  rate: number;
}

/** What recording a supplier invoice now would bill: the received goods not yet invoiced. */
export interface InvoicePreview {
  receipts: string[];
  lines: InvoiceLine[];
  currency: string;
  total: number;
}

export interface InvoiceRequest {
  reference: string;
  order: string;
  /** The supplier's own invoice number. */
  billNo: string;
  receipts: string[];
}

export type PaymentStatus = 'unpaid' | 'partlyPaid' | 'paid';

export interface LinkedPayment {
  name: string;
  amount: number;
  account: string;
}

export interface SupplierInvoice {
  name: string;
  billNo: string | null;
  supplierName: string;
  order: string | null;
  currency: string;
  total: number;
  outstanding: number;
  cancelled: boolean;
  payments: LinkedPayment[];
}

/** One supplier invoice for an order, as listed on the order page and in the workspace. */
export interface OrderInvoice {
  name: string;
  billNo: string | null;
  currency: string;
  total: number;
  outstanding: number;
}

export function paymentStatus(invoice: { total: number; outstanding: number }): PaymentStatus {
  if (invoice.outstanding <= 0.005) {
    return 'paid';
  }
  return invoice.outstanding < invoice.total - 0.005 ? 'partlyPaid' : 'unpaid';
}

export interface PurchasingOverview {
  /** The most recent orders, for the table. */
  orders: OrderSummary[];
  /** Counted over every order, not just the listed ones. */
  openOrders: number;
  awaitingReceipt: number;
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
  if (order.docstatus === 2) {
    return 'cancelled';
  }
  if (order.status === 'Closed') {
    return 'closed';
  }
  if (order.status === 'On Hold') {
    return 'onHold';
  }
  if (order.per_received <= 0) {
    return 'awaitingReceipt';
  }
  if (order.per_received < 100) {
    return 'partlyReceived';
  }
  return order.per_billed < 100 ? 'awaitingInvoice' : 'complete';
}

/** ERPNext accepts receipts only for submitted orders that aren't on hold, closed or complete. */
export const receivable = (progress: OrderProgress) =>
  progress === 'awaitingReceipt' || progress === 'partlyReceived';

/** On hold, closed or cancelled: ERPNext refuses receipts whatever is still open. */
export const stopped = (progress: OrderProgress) =>
  progress === 'onHold' || progress === 'closed' || progress === 'cancelled';

export function linesTotal(lines: readonly { qty: number; rate: number }[]): number {
  return round2(lines.reduce((sum, l) => sum + l.qty * l.rate, 0));
}
