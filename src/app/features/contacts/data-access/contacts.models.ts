export type ContactKind = 'customers' | 'suppliers';

export interface ContactRow {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  /** Company currency; null where the role may not see it. */
  outstanding: number | null;
}

export interface ContactInfo {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** The primary address, one line per entry. */
  address: string[];
}

export interface CustomerDetail extends ContactInfo {
  /** Null when the role can't read sales invoices. Company currency. */
  totals: { invoiced: number; paid: number; outstanding: number } | null;
  latest: { name: string; date: string; status: string; total: number; outstanding: number } | null;
  /** The newest invoices and payments, newest first. */
  recent: { kind: 'invoice' | 'payment'; name: string; date: string; amount: number }[];
}

export interface SupplierDetail extends ContactInfo {
  /** Company currency; null where the role may not see supplier balances. */
  outstanding: number | null;
  /** The oldest invoice still to pay, for "Pay supplier". */
  unpaid: { name: string; total: number; paid: number; remaining: number } | null;
  /** The newest order still to receive or bill. */
  openOrder: { name: string; ordered: number; received: number; billed: number } | null;
}
