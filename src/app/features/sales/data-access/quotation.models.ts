import { CatalogItem } from './sale.models';

export interface QuoteLine {
  item: CatalogItem;
  qty: number;
  rate: number;
}

export interface QuotationRequest {
  /** Madar's idempotency reference, kept in the quotation's `utm_content` (it has no remarks field). */
  reference: string;
  company: string;
  currency: string;
  customer: string;
  date: string;
  validTill: string;
  lines: { item: string; uom: string; qty: number; rate: number }[];
}

export interface QuotationDetail {
  name: string;
  customer: string;
  customerName: string;
  docstatus: number;
  status: string;
  date: string;
  validTill: string | null;
  /** Company currency, rounded as ERPNext owes it. */
  total: number;
  lines: {
    code: string;
    name: string;
    qty: number;
    uom: string;
    rate: number;
    amount: number;
    isStock: boolean;
  }[];
}

export const quoteTotal = (lines: readonly QuoteLine[]) =>
  Math.round(lines.reduce((sum, l) => sum + l.qty * l.rate, 0) * 100) / 100;
