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
  /** Not disabled in ERPNext: listed, and can be sold to or bought from. */
  active: boolean;
  /** What they supply, or who they are; null when empty. */
  about: string | null;
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

export interface ContactFormValue {
  name: string;
  phone: string;
  email: string;
  address: string;
  /** Free text on what they supply or who they are; empty means none. */
  about: string;
}

export interface HistoryEntry {
  kind: 'invoice' | 'return' | 'payment' | 'delivery';
  name: string;
  date: string;
  /** Company currency; null for deliveries, or where the role may not see money. */
  amount: number | null;
  /** Invoices: what is still owed. Company currency. */
  outstanding: number;
  /** Invoices: what credit notes took off it, which isn't money paid. Company currency. */
  credited: number;
  /** Credit notes: the invoice they reduce, and by how much (company currency); `withCredits` adds it up. */
  creditFor?: string;
  creditAmount?: number;
  /** Invoices: ERPNext's status. */
  status: string;
  /** Payments: the account it went to or came from; deliveries: the warehouse. */
  place: string | null;
  /** Payments: the invoices it settled. */
  invoices: string[];
  /** Deliveries: how many units left or arrived. */
  qty: number;
}

/** A contact's bank details as typed: all three empty means none. */
export interface BankDetails {
  bank: string;
  iban: string;
  accountNo: string;
}

/** The party's Bank Account as ERPNext holds it; `modified` guards the next save against a change made elsewhere. */
export interface BankAccountRecord extends BankDetails {
  name: string;
  modified: string;
  disabled: boolean;
}
