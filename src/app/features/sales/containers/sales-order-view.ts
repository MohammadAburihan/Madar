import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import { SalesOrderDetail, SalesOrderLine } from '../data-access/sales-order.models';

export type ChipTone = 'tint' | 'warning' | 'danger';

const qty = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);

/** "Sales order SO-0187" / "Lina Haddad · From QT-0084". */
export function orderHeading(order: SalesOrderDetail, tr: Translator) {
  return {
    title: tr.t('sales.order.title', { name: order.name }),
    subtitle: order.quotation
      ? tr.t('sales.order.fromQuotation', {
          customer: order.customerName,
          quotation: order.quotation,
        })
      : order.customerName,
  };
}

/** "Order: Confirmed", "Delivery: Pending", "Invoice: Not issued", as ERPNext reports them. */
export function orderChips(
  order: SalesOrderDetail,
  tr: Translator,
): { label: string; tone: ChipTone }[] {
  const t = (key: string) => tr.t(`sales.order.${key}`);
  const chip = (kind: string, state: string, tone: ChipTone) => ({
    label: tr.t('sales.order.chip', { kind: t(`kind.${kind}`), state: t(`${kind}.${state}`) }),
    tone,
  });
  const stage =
    order.docstatus === 0
      ? chip('order', 'draft', 'warning')
      : order.docstatus === 2
        ? chip('order', 'cancelled', 'danger')
        : order.status === 'Closed'
          ? chip('order', 'closed', 'warning')
          : order.status === 'On Hold'
            ? chip('order', 'onHold', 'warning')
            : order.status === 'Completed'
              ? chip('order', 'completed', 'tint')
              : chip('order', 'confirmed', 'tint');
  if (order.docstatus !== 1) {
    return [stage];
  }
  const delivery =
    order.deliveryStatus === 'Fully Delivered'
      ? chip('delivery', 'delivered', 'tint')
      : order.deliveryStatus === 'Partly Delivered'
        ? chip('delivery', 'partly', 'warning')
        : order.deliveryStatus === 'Not Applicable'
          ? chip('delivery', 'notNeeded', 'tint')
          : order.deliveryStatus === 'Closed'
            ? chip('delivery', 'closed', 'warning')
            : chip('delivery', 'pending', 'warning');
  const invoice =
    order.billingStatus === 'Fully Billed'
      ? chip('invoice', 'invoiced', 'tint')
      : order.billingStatus === 'Partly Billed'
        ? chip('invoice', 'partly', 'warning')
        : order.billingStatus === 'Closed'
          ? chip('invoice', 'closed', 'warning')
          : chip('invoice', 'notIssued', 'warning');
  return [stage, delivery, invoice];
}

/** Goods: "2 ordered · 0 delivered"; a service: "SRV-GARDEN · 1 Visit" and whether the work is done. */
export function orderLineCard(line: SalesOrderLine, currency: string, tr: Translator) {
  const amount = formatMoney(line.amount, currency);
  if (line.isStock) {
    return {
      title: line.name,
      meta: tr.t('sales.order.goodsProgress', {
        ordered: qty(line.qty),
        delivered: qty(line.deliveredQty),
      }),
      detail: amount,
    };
  }
  const done = line.deliveredQty >= line.qty - 1e-9;
  return {
    title: line.name,
    meta: `${line.code} · ${qty(line.qty)} ${line.uom}`,
    detail: `${amount} · ${tr.t(done ? 'sales.order.serviceDone' : 'sales.order.servicePending')}`,
  };
}
