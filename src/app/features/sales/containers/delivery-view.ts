import { Translator } from '../../../core/i18n/translator';
import {
  DeliveryRequest,
  SalesOrderDetail,
  SalesOrderLine,
  toDeliver,
} from '../data-access/sales-order.models';

const qtyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const qty = (value: number) => qtyFormat.format(value);

type Quantities = Record<string, number>;
export type QtyError = 'invalid' | 'tooMany' | 'noStock';

/** "Deliver order" / "SO-0187 · Lina Haddad". */
export function deliveryHeading(order: SalesOrderDetail, tr: Translator) {
  return {
    title: tr.t('sales.deliver.title'),
    subtitle: tr.t('sales.deliver.subtitle', { order: order.name, customer: order.customerName }),
  };
}

/** Goods: "Ordered 2 · Previously delivered 0" / "Available 24 · Deliver now 2"; services: work done so far. */
export function deliveryLineCard(
  line: SalesOrderLine,
  available: number | null,
  now: number,
  tr: Translator,
) {
  const t = (key: string, params: Record<string, unknown>) => tr.t(`sales.deliver.${key}`, params);
  const counts = { ordered: qty(line.qty), delivered: qty(line.deliveredQty), now: qty(now || 0) };
  return line.isStock
    ? {
        title: line.name,
        meta: t('goodsMeta', counts),
        detail: t('goodsDetail', { ...counts, available: qty(available ?? 0) }),
      }
    : { title: line.name, meta: t('serviceMeta', counts), detail: t('serviceDetail', counts) };
}

/** One goods row reads "Quantity to deliver"; several, or a service, name their item code. */
export function deliveryQtyLabel(line: SalesOrderLine, lineCount: number, tr: Translator) {
  if (!line.isStock) {
    return tr.t('sales.deliver.workDoneFor', { code: line.code });
  }
  return lineCount > 1
    ? tr.t('sales.deliver.qtyFor', { code: line.code })
    : tr.t('sales.deliver.qty');
}

export function deliveryQtyError(
  error: QtyError | null,
  line: SalesOrderLine,
  available: number | null,
  warehouse: string,
  tr: Translator,
): string | null {
  if (!error) {
    return null;
  }
  return error === 'noStock'
    ? tr.t('sales.deliver.noStock', { available: qty(available ?? 0), warehouse })
    : tr.t('sales.deliver.qtyError', { max: qty(toDeliver(line)) });
}

const listed = (lines: readonly SalesOrderLine[], quantities: Quantities) =>
  lines
    .filter((l) => (quantities[l.row] || 0) > 0)
    .map((l) => `${qty(quantities[l.row])} × ${l.name}`)
    .join(' + ');

/** "Deliver 2 × Olive tree from Main warehouse. This creates a delivery record; it does not record payment." */
export function deliveryReview(
  lines: readonly SalesOrderLine[],
  quantities: Quantities,
  warehouse: string,
  tr: Translator,
): string {
  const goods = listed(
    lines.filter((l) => l.isStock),
    quantities,
  );
  const services = listed(
    lines.filter((l) => !l.isStock),
    quantities,
  );
  const parts = [
    goods ? tr.t('sales.deliver.reviewGoods', { goods, warehouse }) : null,
    services ? tr.t('sales.deliver.reviewServices', { services }) : null,
    tr.t('sales.deliver.reviewNote'),
  ];
  return parts.filter(Boolean).join(' ');
}

/** "Delivered · 2 of 2" or "Partly delivered · 1 of 2", counting the whole order after this delivery. */
export function deliveryDone(
  order: SalesOrderDetail,
  sent: DeliveryRequest,
  warehouse: string,
  tr: Translator,
) {
  const now = new Map(sent.lines.map((l) => [l.row, l.qty]));
  const ordered = order.lines.reduce((sum, l) => sum + l.qty, 0);
  const done = order.lines.reduce((sum, l) => sum + l.deliveredQty + (now.get(l.row) ?? 0), 0);
  const complete = done >= ordered - 1e-9;
  return {
    title: tr.t('sales.deliver.doneTitle'),
    subtitle: tr.t('sales.deliver.subtitle', { order: order.name, customer: order.customerName }),
    cardTitle: tr.t(complete ? 'sales.deliver.doneAll' : 'sales.deliver.donePart', {
      done: qty(done),
      ordered: qty(ordered),
    }),
    cardMessage: tr.t('sales.deliver.doneMessage', { warehouse }),
  };
}
