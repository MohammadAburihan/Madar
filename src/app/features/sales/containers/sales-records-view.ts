import { formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { InvoiceRecord, OrderRecord, QuoteRecord } from '../data-access/sales-records.models';

export interface RecordCard {
  id: string;
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
  const payment =
    invoice.docstatus === 0 || invoice.isReturn
      ? null
      : invoice.outstanding <= 0.005
        ? t('paid')
        : invoice.outstanding < invoice.total - 0.005
          ? t('partlyPaid')
          : t('unpaid');
  const goods =
    invoice.docstatus === 0
      ? null
      : invoice.isReturn
        ? invoice.delivered
          ? t('goodsReturned')
          : null
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
    title: t('title', { name: invoice.name, customer: invoice.customer }),
    message: `${status}\n${[goods, amount].filter(Boolean).join(' · ')}`,
    openable: true,
    cells: [invoice.name, invoice.customer, [status, goods].filter(Boolean).join(' · '), amount],
  };
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
  const status = order.docstatus === 0 ? t('draftOrder') : `${delivery} · ${billing}`;
  return {
    id: order.name,
    title: t('title', { name: order.name, customer: order.customer }),
    message:
      order.docstatus === 0
        ? `${t('draftOrder')} · ${formatMoney(order.total, currency)}`
        : `${t('confirmedOrder', { items })}\n${delivery} · ${billing}`,
    openable: false,
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
    title: t('title', { name: quote.name, customer: quote.customer }),
    message: [`${state} · ${formatMoney(quote.total, currency)}`, valid].filter(Boolean).join('\n'),
    openable: false,
    cells: [
      quote.name,
      quote.customer,
      [state, valid].filter(Boolean).join(' · '),
      formatMoney(quote.total, currency),
    ],
  };
}

function quoteState(status: string): 'open' | 'ordered' | 'lost' | 'expired' {
  return status === 'Ordered' || status === 'Partially Ordered'
    ? 'ordered'
    : status === 'Lost'
      ? 'lost'
      : status === 'Expired'
        ? 'expired'
        : 'open';
}
