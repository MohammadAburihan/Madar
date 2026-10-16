export type RecordKind = 'invoices' | 'orders' | 'quotes';

export interface InvoiceRecord {
  name: string;
  customer: string;
  docstatus: number;
  isReturn: boolean;
  /** Stock left with the invoice itself (a quick sale), rather than through a delivery. */
  delivered: boolean;
  /** Company currency. */
  total: number;
  outstanding: number;
  date: string;
}

export interface OrderRecord {
  name: string;
  customer: string;
  docstatus: number;
  status: string;
  qty: number;
  /** Percent delivered and invoiced, as ERPNext keeps them. */
  delivered: number;
  billed: number;
  total: number;
  date: string;
}

export interface QuoteRecord {
  name: string;
  customer: string;
  docstatus: number;
  status: string;
  total: number;
  validTill: string | null;
  date: string;
}
