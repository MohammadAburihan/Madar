export interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  /** Unpaid balance on submitted invoices, in company currency. */
  outstanding: number;
}

export interface NewCustomer {
  name: string;
  phone: string;
  email: string;
  address: string;
}

export interface CatalogItem {
  code: string;
  name: string;
  uom: string;
  isStock: boolean;
  /** Selling price from the active price list. */
  price: number;
  /** Actual quantity per warehouse id; empty for services. */
  stock: Record<string, number>;
}

export interface SaleLine {
  item: CatalogItem;
  qty: number;
  /** Unit price before discount. */
  rate: number;
  /** Discount in percent. */
  discount: number;
}

export interface WarehouseOption {
  id: string;
  name: string;
}

export interface PaymentAccount {
  mode: string;
  account: string;
  label: string;
  /** Bank modes need a reference number and date on the payment. */
  isBank: boolean;
}

export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface SaleRequest {
  /** Madar's reference, stored on the invoice and payment so a timed-out confirmation can be found again. */
  reference: string;
  company: string;
  customer: string;
  warehouse: string;
  lines: SaleLine[];
  amountPaid: number;
  account: PaymentAccount | null;
}

export interface SaleResult {
  invoice: string;
  postingDate: string;
  total: number;
  paid: number;
  outstanding: number;
  payment: string | null;
  /** The invoice was confirmed but its payment could not be recorded. */
  paymentFailed: boolean;
}

export function lineTotal(line: Pick<SaleLine, 'qty' | 'rate' | 'discount'>): number {
  return round2(line.qty * line.rate * (1 - line.discount / 100));
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
