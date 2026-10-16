import { formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { InvoiceRecord, OrderRecord, QuoteRecord } from '../data-access/sales-records.models';
import { quoteState } from './quotation-view';

export interface RecordCard {
  id: string;
  kind: 'invoices' | 'orders' | 'quotes';
  title: string;
  message: string;
  /** Madar has a page for it. */
  openable: boolean;
  /** The desktop row: Document · Customer · Status · Amount. */
  cells: string[];
}

const qty = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);

/** "Confirmed · Partially paid" / "Goods delivered · ILS 200.00 due", as on the sales records mock. */
export function invoiceCard(invoice: InvoiceRecord, currency: string, tr: Translator): RecordCard {
  const t = (key: string, params?: Record<string, unknown>) => tr.t(`sales.records.${key}`, params);
  const state =
    invoice.docstatus === 0 ? t('draft') : invoice.isReturn ? t('return') : t('confirmed');
  const payment = invoice.docstatus === 0 || invoice.isReturn ? null : paymentState(invoice, t);
  const goods =
    invoice.docstatus === 0
      ? null
      : invoice.isReturn
        ? invoice.delivered
          ? t('goodsReturned')
          : null
        : invoice.delivered === null
          ? null
          : invoice.delivered
            ? t('goodsDelivered')
            : t('invoiceOnly');
  const amount =
    invoice.outstanding > 0.005
      ? t('due', { amount: formatMoney(invoice.outstanding, currency) })
      : formatMoney(invoice.total, currency);
  const status = [state, payment].filter(Boolean).join(' · ');
  return {
    id: invoice.name,
    kind: 'invoices',
    title: t('title', { name: invoice.name, customer: invoice.customer }),
    message: `${status}\n${[goods, amount].filter(Boolean).join(' · ')}`,
    openable: true,
    cells: [invoice.name, invoice.customer, [status, goods].filter(Boolean).join(' · '), amount],
  };
}

/** ERPNext's own state where it says more than the outstanding amount can (a credit note isn't a payment). */
function paymentState(invoice: InvoiceRecord, t: (key: string) => string): string {
  if (invoice.status === 'Credit Note Issued') {
    return t('creditNote');
  }
  if (invoice.status.startsWith('Partly Paid')) {
    return t('partlyPaid');
  }
  if (invoice.status === 'Paid') {
    return t('paid');
  }
  if (invoice.status.startsWith('Unpaid') || invoice.status.startsWith('Overdue')) {
    return t('unpaid');
  }
  return invoice.outstanding <= 0.005
    ? t('paid')
    : invoice.outstanding < invoice.total - 0.005
      ? t('partlyPaid')
      : t('unpaid');
}

/** "Confirmed order · 2 items" / "Delivery pending · Not invoiced". */
export function orderCard(order: OrderRecord, currency: string, tr: Translator): RecordCard {
  const t = (key: string, params?: Record<string, unknown>) => tr.t(`sales.records.${key}`, params);
  const delivery =
    {
      'Fully Delivered': t('delivered'),
      'Partly Delivered': t('partlyDelivered'),
      'Not Applicable': t('servicesOnly'),
      Closed: t('closed'),
    }[order.deliveryStatus] ?? t('deliveryPending');
  const billing =
    {
      'Fully Billed': t('invoiced'),
      'Partly Billed': t('partlyInvoiced'),
      Closed: t('closed'),
    }[order.billingStatus] ?? t('notInvoiced');
  const items = tr.plural('sales.records.items', order.qty, { count: qty(order.qty) });
  // Closing or holding an order changes only its status, not its delivery and billing states.
  const stopped =
    order.status === 'Closed' ? t('closed') : order.status === 'On Hold' ? t('onHold') : null;
  const progress = stopped ?? `${delivery} · ${billing}`;
  const status = order.docstatus === 0 ? t('draftOrder') : progress;
  return {
    id: order.name,
    kind: 'orders',
    title: t('title', { name: order.name, customer: order.customer }),
    message:
      order.docstatus === 0
        ? `${t('draftOrder')} · ${formatMoney(order.total, currency)}`
        : `${t('confirmedOrder', { items })}\n${progress}`,
    openable: true,
    cells: [order.name, order.customer, status, formatMoney(order.total, currency)],
  };
}

/** "Draft · ILS 320.00" / "Valid until 25 Oct 2026". */
export function quoteCard(
  quote: QuoteRecord,
  currency: string,
  language: Language,
  tr: Translator,
): RecordCard {
  const t = (key: string, params?: Record<string, unknown>) => tr.t(`sales.records.${key}`, params);
  const state = quote.docstatus === 0 ? t('draft') : t('quoteStatus.' + quoteState(quote.status));
  const valid = quote.validTill
    ? t('validUntil', { date: formatShortDate(quote.validTill, language) })
    : null;
  return {
    id: quote.name,
    kind: 'quotes',
    title: t('title', { name: quote.name, customer: quote.customer }),
    message: [`${state} · ${formatMoney(quote.total, currency)}`, valid].filter(Boolean).join('\n'),
    openable: true,
    cells: [
      quote.name,
      quote.customer,
      [state, valid].filter(Boolean).join(' · '),
      formatMoney(quote.total, currency),
    ],
  };
}
