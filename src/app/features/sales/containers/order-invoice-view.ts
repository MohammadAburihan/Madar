import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import {
  OrderInvoicePreview,
  OrderInvoiceResult,
  SalesOrderDetail,
} from '../data-access/sales-order.models';

const qty = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
const amount = (value: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  );

/** "Invoice only · ILS 320.00" / "2 × Olive tree 170.00 + 1 × Garden consultation 150.00. … Due 320.00." */
export function invoiceReview(
  order: SalesOrderDetail,
  preview: OrderInvoicePreview,
  currency: string,
  tr: Translator,
) {
  const t = (key: string, params?: Record<string, unknown>) =>
    tr.t(`sales.orderInvoice.${key}`, params);
  const lines = preview.lines
    .map((l) => `${qty(l.qty)} × ${l.name} ${amount(l.amount)}`)
    .join(' + ');
  const billsGoods = preview.lines.some((l) => l.isStock);
  const goodsDelivered = order.lines
    .filter((l) => l.isStock)
    .every((l) => l.deliveredQty >= l.qty - 1e-9);
  const goods = billsGoods ? t(goodsDelivered ? 'goodsDelivered' : 'goodsLater') : null;
  return {
    title: t('reviewTitle'),
    subtitle: t('subtitle', { order: order.name, customer: order.customerName }),
    cardTitle: t('reviewCard', { total: formatMoney(preview.total, currency) }),
    cardMessage: [
      `${lines}.`,
      goods,
      t('reviewDue', { received: amount(0), due: amount(preview.total) }),
    ]
      .filter(Boolean)
      .join(' '),
  };
}

/** "Order invoice recorded" / "SI-1043 · SO-0187" / "Unpaid · ILS 320.00". */
export function invoiceDone(
  order: string,
  invoice: OrderInvoiceResult,
  currency: string,
  tr: Translator,
) {
  const t = (key: string, params?: Record<string, unknown>) =>
    tr.t(`sales.orderInvoice.${key}`, params);
  const state =
    invoice.outstanding <= 0.005
      ? 'paid'
      : invoice.outstanding < invoice.total - 0.005
        ? 'partlyPaid'
        : 'unpaid';
  return {
    title: t('doneTitle'),
    subtitle: t('doneSubtitle', { invoice: invoice.name, order }),
    cardTitle: t('doneCard', {
      state: tr.t(`sales.records.${state}`),
      total: formatMoney(invoice.total, currency),
    }),
    cardMessage: t('doneMessage', {
      order,
      received: amount(Math.max(invoice.total - invoice.outstanding, 0)),
    }),
  };
}
