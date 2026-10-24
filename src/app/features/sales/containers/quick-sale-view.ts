import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import {
  CatalogItem,
  CustomerOption,
  PaymentStatus,
  SaleLine,
  lineTotal,
} from '../data-access/sale.models';

export interface CardView {
  title: string;
  message: string;
}

export interface ItemView {
  title: string;
  meta: string | null;
  detail: string | null;
  kind: 'product' | 'service';
}

export interface PersonView {
  title: string;
  meta: string | null;
  balance: string;
}

export interface TotalsInput {
  total: number;
  paid: number;
  outstanding: number;
}

/** Amounts in the design drop the currency inside "2 × 85.00" but keep it in totals. */
const plain = (amount: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amount,
  );

export function stepSubtitle(step: number, label: string, tr: Translator): string {
  return tr.t('sale.step', { step, label });
}

export function customerView(
  customer: CustomerOption,
  currency: string,
  tr: Translator,
): PersonView {
  return {
    title: customer.name,
    meta: [customer.phone, customer.city].filter(Boolean).join(' · ') || null,
    balance:
      customer.outstanding > 0
        ? tr.t('sale.customer.outstanding', { amount: formatMoney(customer.outstanding, currency) })
        : tr.t('sale.customer.noUnpaid'),
  };
}

export function catalogItemView(
  item: CatalogItem,
  available: number,
  currency: string,
  tr: Translator,
): ItemView {
  const price = formatMoney(item.price, currency);
  return {
    title: item.name,
    meta: tr.t('sale.items.meta', { code: item.code, uom: item.uom }),
    detail: item.isStock
      ? tr.t('sale.items.detailProduct', { price, count: available })
      : tr.t('sale.items.detailService', { price }),
    kind: item.isStock ? 'product' : 'service',
  };
}

export function basketSummary(
  lines: readonly SaleLine[],
  total: number,
  currency: string,
  tr: Translator,
): CardView {
  const units = lines.reduce((sum, line) => sum + line.qty, 0);
  const contents = lines
    .map((line) => `${tr.isolate(line.qty)} × ${tr.isolate(line.item.name)}`)
    .join(' + ');
  return {
    title: tr.plural('sale.items.basket', units),
    message: `${contents}\n${tr.t('sale.items.basketTotal', { amount: formatMoney(total, currency) })}`,
  };
}

export function basketLineView(
  line: SaleLine,
  available: number,
  currency: string,
  tr: Translator,
): ItemView {
  const price = formatMoney(line.rate, currency);
  const total = formatMoney(lineTotal(line), currency);
  const discount =
    line.discount > 0 ? tr.t('sale.basket.discount', { discount: line.discount }) : '';
  return {
    title: line.item.name,
    meta: line.item.isStock
      ? tr.t('sale.basket.metaProduct', { code: line.item.code, price })
      : tr.t('sale.basket.metaService', { code: line.item.code, price, uom: line.item.uom }),
    detail:
      (line.item.isStock
        ? tr.t('sale.basket.detailProduct', {
            qty: line.qty,
            rate: plain(line.rate),
            total,
            count: available,
          })
        : tr.t('sale.basket.detailService', { qty: line.qty, rate: plain(line.rate), total })) +
      discount,
    kind: line.item.isStock ? 'product' : 'service',
  };
}

/** Compact line for the desktop "Your sale" panel and the review summary. */
export function panelLineView(
  line: SaleLine,
  currency: string,
  tr: Translator,
  withCurrency = true,
): ItemView {
  return {
    title: line.item.name,
    meta: tr.t('sale.workspace.panelMeta', {
      qty: line.qty,
      price: withCurrency ? formatMoney(line.rate, currency) : plain(line.rate),
    }),
    detail: formatMoney(lineTotal(line), currency),
    kind: line.item.isStock ? 'product' : 'service',
  };
}

export function totalsRows(
  { total, paid, outstanding }: TotalsInput,
  currency: string,
  tr: Translator,
) {
  return [
    { label: tr.t('sale.review.invoiceTotal'), value: formatMoney(total, currency) },
    { label: tr.t('sale.review.amountPaid'), value: formatMoney(paid, currency) },
    { label: tr.t('sale.review.outstanding'), value: formatMoney(outstanding, currency) },
  ];
}

export interface CreatesInput extends TotalsInput {
  lines: readonly SaleLine[];
  status: PaymentStatus;
  accountLabel: string | null;
  warehouseName: string | null;
}

/** "What confirmation creates": spells out every document the confirmation will create. */
export function createsMessage(input: CreatesInput, currency: string, tr: Translator): string {
  const stockLines = input.lines.filter((line) => line.item.isStock);
  const items = stockLines
    .map((line) => `${tr.isolate(line.qty)} × ${tr.isolate(line.item.name)}`)
    .join(' + ');
  const total = formatMoney(input.total, currency);
  const paid = formatMoney(input.paid, currency);
  const pays = input.status !== 'unpaid' && input.paid > 0 && !!input.accountLabel;
  const values = {
    total,
    paid,
    account: input.accountLabel ?? '',
    items,
    warehouse: input.warehouseName ?? '',
  };
  if (pays && stockLines.length) {
    return tr.t('sale.review.createsPaymentDelivery', values);
  }
  if (pays) {
    return tr.t('sale.review.createsPayment', values);
  }
  return tr.t(
    stockLines.length ? 'sale.review.createsDelivery' : 'sale.review.createsInvoice',
    values,
  );
}

export function servicesNote(
  lines: readonly SaleLine[],
  outstanding: number,
  currency: string,
  tr: Translator,
): string | null {
  const services = lines.filter((line) => !line.item.isStock).map((line) => line.item.name);
  const parts = [
    services.length
      ? tr.t('sale.review.servicesNote', {
          services: services.map((v) => tr.isolate(v)).join(' · '),
        })
      : null,
    outstanding > 0
      ? tr.t('sale.review.owes', { amount: formatMoney(outstanding, currency) })
      : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

export function paymentStatusOf(paid: number, total: number): PaymentStatus {
  return paid <= 0 ? 'unpaid' : paid >= total ? 'paid' : 'partial';
}
