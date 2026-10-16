export interface SalesOrderLine {
  /** The order row's name, which delivery and invoice lines point back to. */
  row: string;
  code: string;
  name: string;
  uom: string;
  qty: number;
  deliveredQty: number;
  /** Stock units in one of the row's units. */
  conversionFactor: number;
  /** Company currency. */
  rate: number;
  amount: number;
  isStock: boolean;
}

export interface SalesOrderDetail {
  name: string;
  customer: string;
  customerName: string;
  docstatus: number;
  /** ERPNext's order status: "To Deliver and Bill", "Completed", "Closed", "On Hold"… */
  status: string;
  deliveryStatus: string;
  billingStatus: string;
  date: string;
  deliveryDate: string | null;
  /** The quotation it was made from, if any. */
  quotation: string | null;
  /** Company currency, rounded as ERPNext owes it. */
  total: number;
  lines: SalesOrderLine[];
}

export interface OrderFromQuotationRequest {
  /** Madar's idempotency reference, kept in the order's `utm_content` (it has no remarks field). */
  reference: string;
  quotation: string;
  deliveryDate: string;
}

/** Closed, held, completed or cancelled: ERPNext refuses deliveries and date changes. */
export const orderOpen = (order: SalesOrderDetail) =>
  order.docstatus === 1 && !['Closed', 'On Hold', 'Completed', 'Cancelled'].includes(order.status);

export interface DeliveryRequest {
  /** Madar's idempotency reference, kept in the delivery note's `utm_content`. */
  reference: string;
  order: string;
  warehouse: string;
  /** Only rows delivering something; qty is in the row's unit. */
  lines: { row: string; qty: number }[];
}

export interface OrderInvoicePreview {
  lines: { code: string; name: string; qty: number; amount: number; isStock: boolean }[];
  /** Company currency, what the invoice will be owed. */
  total: number;
}

export interface OrderInvoiceRequest {
  /** Madar's idempotency reference, kept in the invoice's remarks. */
  reference: string;
  order: string;
  /** The company currency, which the result's amounts are given in. */
  currency: string;
  /** The total the user reviewed; the invoice is refused if ERPNext would now bill another amount. */
  total: number;
}

export interface OrderInvoiceResult {
  name: string;
  total: number;
  outstanding: number;
}

// Rounded so 1 − 0.9 reads 0.1, not 0.09999999999999998.
export const toDeliver = (line: SalesOrderLine) =>
  Math.max(Math.round((line.qty - line.deliveredQty) * 1e6) / 1e6, 0);
