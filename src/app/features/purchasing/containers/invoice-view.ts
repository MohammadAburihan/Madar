import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import {
  InvoicePreview,
  OrderDetail,
  OrderInvoice,
  SupplierInvoice,
  paymentStatus,
} from '../data-access/purchase.models';
import { CardView } from './purchase-view';

const qtyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const qty = (value: number) => qtyFormat.format(Math.round(value * 1e6) / 1e6);

export interface Chip {
  label: string;
  tone: 'tint' | 'warning';
}

export function invoiceFormHeading(order: OrderDetail, tr: Translator) {
  return {
    title: tr.t('purchase.invoice.title'),
    subtitle: tr.t('purchase.invoice.subtitle', {
      order: order.name,
      supplier: order.supplierName,
    }),
  };
}

/** "6 units received": what the invoice will bill. */
export function billingChip(preview: InvoicePreview, tr: Translator): string {
  const count = preview.lines.reduce((sum, l) => sum + l.qty, 0);
  return tr.t('purchase.invoice.receivedChip', {
    units: tr.plural('purchase.receive.units', count, { count: qty(count) }),
  });
}

/** One card per item and price, adding up the rows ERPNext keeps per receipt. */
export function billingCards(preview: InvoicePreview, tr: Translator): CardView[] {
  const merged = new Map<string, InvoicePreview['lines'][number]>();
  for (const line of preview.lines) {
    const key = `${line.code}|${line.rate}`;
    const seen = merged.get(key);
    merged.set(key, seen ? { ...seen, qty: seen.qty + line.qty } : line);
  }
  return [...merged.values()].map((l) => ({
    title: l.name,
    meta: tr.t('purchase.receive.lineMeta', { code: l.code, uom: l.uom }),
    detail: tr.t('purchase.invoice.lineDetail', {
      qty: qty(l.qty),
      rate: formatMoney(l.rate, preview.currency),
    }),
    kind: 'product',
  }));
}

/** Invoice total, amount paid and outstanding, as on the invoice mocks. */
export function invoiceTotals(
  total: number,
  outstanding: number,
  currency: string,
  tr: Translator,
): TotalRow[] {
  return [
    { label: tr.t('purchase.invoice.total'), value: formatMoney(total, currency) },
    { label: tr.t('purchase.invoice.paid'), value: formatMoney(total - outstanding, currency) },
    {
      label: tr.t('purchase.invoice.outstanding'),
      value: formatMoney(outstanding, currency),
      accent: outstanding > 0.005,
    },
  ];
}

export interface InvoiceView {
  title: string;
  subtitle: string;
  chips: Chip[];
  totals: TotalRow[];
  payments: { title: string; message: string }[];
}

/**
 * A recorded invoice: "Supplier invoice recorded" right after recording it, "Supplier invoice PINV-0068"
 * when opened later. The order chip needs the order; without it the chip is left out.
 */
export function invoiceView(
  invoice: SupplierInvoice,
  order: OrderDetail | null,
  recorded: boolean,
  tr: Translator,
): InvoiceView {
  const ref = invoice.billNo ? tr.t('purchase.invoice.supplierRef', { ref: invoice.billNo }) : null;
  const status = paymentStatus(invoice);
  const chips: Chip[] = [
    {
      label: tr.t(invoice.cancelled ? 'purchase.invoice.cancelled' : 'purchase.invoice.confirmed'),
      tone: invoice.cancelled ? 'warning' : 'tint',
    },
    {
      label: tr.t(`purchase.invoice.payment.${status}`),
      tone: status === 'paid' ? 'tint' : 'warning',
    },
  ];
  if (invoice.opening) {
    chips.push({ label: tr.t('purchase.invoice.opening'), tone: 'tint' });
  }
  if (order) {
    chips.push({
      label: tr.t('purchase.invoice.orderChip', {
        received: qty(order.receivedQty),
        ordered: qty(order.orderedQty),
      }),
      tone: order.receivedQty >= order.orderedQty ? 'tint' : 'warning',
    });
  }
  return {
    title: recorded
      ? tr.t('purchase.invoice.recordedTitle')
      : tr.t('purchase.invoice.pageTitle', { invoice: invoice.name }),
    subtitle: [recorded ? invoice.name : invoice.supplierName, ref].filter(Boolean).join(' · '),
    chips,
    totals: invoiceTotals(invoice.total, invoice.outstanding, invoice.currency, tr),
    payments: invoice.payments.map((p) => ({
      title: tr.t('purchase.invoice.linkedPayment', { payment: p.name }),
      message: tr.t('purchase.invoice.linkedPaymentMessage', {
        amount: formatMoney(p.amount, invoice.currency),
        account: p.account,
      }),
    })),
  };
}

/** Received goods not yet billed: what "Record supplier invoice" would bill. */
export function hasUnbilled(order: OrderDetail): boolean {
  // Per line, so a line billed above its value can't hide another line's unbilled goods.
  return order.lines.some((l) => l.receivedQty * l.rate - l.billedAmount > 0.005);
}

/** "Order value · Billed · Invoice paid · Invoice outstanding" on the order page. */
export function orderBillingRows(
  order: OrderDetail,
  invoices: readonly OrderInvoice[],
  tr: Translator,
): TotalRow[] {
  // Billed is this order's share (ERPNext's billed amounts); an invoice made in Desk may bill other orders too.
  const billed = order.lines.reduce((sum, l) => sum + l.billedAmount, 0);
  const total = invoices.reduce((sum, i) => sum + i.total, 0);
  const outstanding = invoices.reduce((sum, i) => sum + i.outstanding, 0);
  const money = (value: number) => formatMoney(value, order.currency);
  return [
    { label: tr.t('purchase.detail.orderValue'), value: money(order.total) },
    { label: tr.t('purchase.detail.billed'), value: money(billed) },
    { label: tr.t('purchase.detail.invoicePaid'), value: money(total - outstanding) },
    { label: tr.t('purchase.detail.invoiceOutstanding'), value: money(outstanding) },
  ];
}

/** An order's invoices as cards, when it has more than one to choose from. */
export function orderInvoiceCard(invoice: OrderInvoice, tr: Translator): CardView {
  return {
    title: invoice.billNo ? `${invoice.name} · ${invoice.billNo}` : invoice.name,
    meta: tr.t(`purchase.invoice.payment.${paymentStatus(invoice)}`),
    detail: tr.t('purchase.invoice.cardDetail', {
      total: formatMoney(invoice.total, invoice.currency),
      outstanding: formatMoney(invoice.outstanding, invoice.currency),
    }),
    kind: 'product',
  };
}

/** The workspace panel's invoice rows: totals across the selected order's invoices. */
export function panelInvoiceRows(invoices: readonly OrderInvoice[], tr: Translator): TotalRow[] {
  if (!invoices.length) {
    return [];
  }
  const total = invoices.reduce((sum, i) => sum + i.total, 0);
  const outstanding = invoices.reduce((sum, i) => sum + i.outstanding, 0);
  return invoiceTotals(total, outstanding, invoices[0].currency, tr);
}
