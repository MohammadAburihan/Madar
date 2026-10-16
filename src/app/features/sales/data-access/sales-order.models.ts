export interface SalesOrderLine {
  /** The order row's name, which delivery and invoice lines point back to. */
  row: string;
  code: string;
  name: string;
  uom: string;
  qty: number;
  deliveredQty: number;
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
