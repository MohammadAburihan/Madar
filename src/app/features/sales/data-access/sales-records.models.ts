export type RecordKind = 'invoices' | 'orders' | 'quotes';

export interface InvoiceRecord {
  name: string;
  customer: string;
  docstatus: number;
  /** ERPNext's invoice status ("Paid", "Credit Note Issued", …): a credit lowers outstanding as a payment does. */
  status: string;
  isReturn: boolean;
  /** The goods left, with the invoice or a delivery; null when deliveries couldn't be read. */
  delivered: boolean | null;
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
  /** ERPNext's own states: delivery is "Not Applicable" for an order of services only. */
  deliveryStatus: string;
  billingStatus: string;
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
