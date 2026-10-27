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
  /** Bought for a project's shortfall; booked on the order and its lines. */
  project?: string | null;
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
  /** The business, Madar's `PUR-…` reference and project: what decides whether the draft can be continued. */
  company?: string;
  reference?: string | null;
  project?: string | null;
}

/** A saved draft purchase order, read back so the order can be continued under its own reference. */
export interface DraftOrder {
  name: string;
  reference: string;
  supplier: string;
  project: string | null;
  lines: OrderLine[];
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
  /** Set when Madar can't bill these receipts exactly; the invoice must be recorded in ERPNext. */
  blocked: 'sharedReceipt' | 'charges' | null;
}

export interface InvoiceRequest {
  reference: string;
  order: string;
  /** The supplier's own invoice number. */
  billNo: string;
  receipts: string[];
  /** The total the user was shown, which the invoice must still come to. */
  total: number;
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
  supplier: string;
  supplierName: string;
  order: string | null;
  currency: string;
  total: number;
  outstanding: number;
  /** Submitted, so it can be paid; a draft can't. */
  submitted: boolean;
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

/** A supplier invoice that still owes something, as offered on "Pay supplier". */
export interface UnpaidSupplierInvoice {
  name: string;
  billNo: string | null;
  total: number;
  outstanding: number;
}

export interface SupplierPaymentRequest {
  reference: string;
  invoice: string;
  amount: number;
  /** The Mode of Payment and its account the money is paid from. */
  account: { mode: string; account: string; label: string };
}

/** A saved draft supplier payment, read back so it can be continued under its own reference. */
export interface DraftPayment {
  name: string;
  reference: string;
  invoice: string;
  amount: number;
  /** The Mode of Payment it was drafted with. */
  mode: string | null;
}

export interface SupplierPayment {
  name: string;
  docstatus: number;
  supplierName: string;
  amount: number;
  /** The account's name, e.g. "Main bank". */
  paidFrom: string;
  /** The supplier invoices it paid, with the amount allocated to each. */
  invoices: { invoice: string; allocated: number }[];
  /** The business, Madar's `PAYS-…` reference and whether it pays a supplier: what lets a draft be continued. */
  company?: string;
  reference?: string | null;
  toSupplier?: boolean;
}

export function paymentStatus(invoice: { total: number; outstanding: number }): PaymentStatus {
  if (invoice.outstanding <= 0.005) {
    return 'paid';
  }
  return invoice.outstanding < invoice.total - 0.005 ? 'partlyPaid' : 'unpaid';
}

export interface PurchasingOverview {
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
