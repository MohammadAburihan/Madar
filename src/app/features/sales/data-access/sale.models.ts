import type { PaymentAccount } from '../../../core/money/payment-accounts.service';
import { round2 } from '../../../core/format/number';

export { parseNumber, round2 } from '../../../core/format/number';
export type {
  CustomerOption,
  NewCustomer,
} from '../../../core/customers/customer-directory.service';
export type { PaymentAccount };

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

/** ERPNext rounds the discounted unit rate first, then multiplies by quantity; match it so totals agree. */
export function lineTotal(line: Pick<SaleLine, 'qty' | 'rate' | 'discount'>): number {
  return round2(line.qty * unitRate(line));
}

export function unitRate(line: Pick<SaleLine, 'rate' | 'discount'>): number {
  return round2(line.rate * (1 - line.discount / 100));
}
