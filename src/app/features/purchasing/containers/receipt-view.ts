import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import { Stat } from '../../../shared/ui/stat-card.component';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import {
  OrderDetail,
  OrderLineDetail,
  ReceiptRequest,
  receivable,
} from '../data-access/purchase.models';
import { remainingQty } from '../data-access/receipt.store';
import { CardView } from './purchase-view';

const qtyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const qty = (value: number) => qtyFormat.format(value);
const units = (count: number, tr: Translator) =>
  tr.plural('purchase.receive.units', count, { count: qty(count) });

type Quantities = Record<string, number>;

const receivingNow = (lines: readonly OrderLineDetail[], quantities: Quantities) =>
  lines.reduce((sum, l) => sum + (quantities[l.row] || 0), 0);
const openAfter = (lines: readonly OrderLineDetail[], quantities: Quantities) =>
  lines.reduce((sum, l) => sum + Math.max(remainingQty(l) - (quantities[l.row] || 0), 0), 0);

/** Some goods already arrived, so this is the "Receive remaining items" form. */
export const receivingRemainder = (order: OrderDetail) => order.receivedQty > 0;

export function receiveHeading(
  order: OrderDetail,
  tr: Translator,
): { title: string; subtitle: string } {
  return {
    title: tr.t(
      receivingRemainder(order) ? 'purchase.receive.remainingTitle' : 'purchase.receive.title',
    ),
    subtitle: tr.t('purchase.detail.subtitle', { order: order.name, supplier: order.supplierName }),
  };
}

/** A line on the receive form; its rate only when a currency is given (roles that see costs). */
export function receiveLineCard(
  line: OrderLineDetail,
  currency: string | null,
  tr: Translator,
): CardView {
  const key = line.receivedQty > 0 ? 'lineDetailReceived' : 'lineDetail';
  return {
    title: line.name,
    meta: tr.t('purchase.receive.lineMeta', { code: line.code, uom: line.uom }),
    detail: tr.t(`purchase.receive.${key}${currency === null ? 'NoPrice' : ''}`, {
      ordered: qty(line.qty),
      received: qty(line.receivedQty),
      rate: currency === null ? '' : formatMoney(line.rate, currency),
    }),
    kind: 'product',
  };
}

/** The quantity field's label: one line reads "Received now", several name their item code. */
export function qtyLabel(
  line: OrderLineDetail,
  remainder: boolean,
  lineCount: number,
  tr: Translator,
): string {
  if (remainder) {
    return tr.t('purchase.receive.remainingQty', { code: line.code });
  }
  return lineCount > 1
    ? tr.t('purchase.receive.receivedNowFor', { code: line.code })
    : tr.t('purchase.receive.receivedNowField');
}

export function receiveStats(
  lines: readonly OrderLineDetail[],
  quantities: Quantities,
  tr: Translator,
): Stat[] {
  return [
    { label: tr.t('purchase.receive.receivedNow'), value: qty(receivingNow(lines, quantities)) },
    { label: tr.t('purchase.receive.stillRemaining'), value: qty(openAfter(lines, quantities)) },
  ];
}

/** "6 × ILS 45.00 … ILS 270.00" for each line receiving something. */
export function receiveRows(
  lines: readonly OrderLineDetail[],
  quantities: Quantities,
  currency: string,
): TotalRow[] {
  return lines
    .filter((l) => (quantities[l.row] || 0) > 0)
    .map((l) => ({
      label: `${qty(quantities[l.row])} × ${formatMoney(l.rate, currency)}`,
      value: formatMoney(quantities[l.row] * l.rate, currency),
      accent: true,
    }));
}

/** Whether this receipt leaves anything open on the order. */
export const partialDelivery = (lines: readonly OrderLineDetail[], quantities: Quantities) =>
  openAfter(lines, quantities) > 0;

export function stockNote(
  lines: readonly OrderLineDetail[],
  quantities: Quantities,
  tr: Translator,
): string {
  const now = units(receivingNow(lines, quantities), tr);
  const left = openAfter(lines, quantities);
  return left > 0
    ? tr.t('purchase.receive.notePartial', { now, left: units(left, tr) })
    : tr.t('purchase.receive.noteComplete', { now });
}

export function recordLabel(
  lines: readonly OrderLineDetail[],
  quantities: Quantities,
  tr: Translator,
): string {
  return tr.t('purchase.receive.record', { units: units(receivingNow(lines, quantities), tr) });
}

/** "Previously received 6. Receiving 4 completes 10 of 10. …" for the remaining-items form. */
export function reviewMessage(
  order: OrderDetail,
  lines: readonly OrderLineDetail[],
  quantities: Quantities,
  tr: Translator,
): string {
  const now = receivingNow(lines, quantities);
  const total = order.receivedQty + now;
  return tr.t(
    total >= order.orderedQty
      ? 'purchase.receive.reviewComplete'
      : 'purchase.receive.reviewPartial',
    {
      before: qty(order.receivedQty),
      now: qty(now),
      total: qty(total),
      ordered: qty(order.orderedQty),
    },
  );
}

export function confirmLabel(
  lines: readonly OrderLineDetail[],
  quantities: Quantities,
  tr: Translator,
): string {
  return tr.t('purchase.receive.confirm', { qty: qty(receivingNow(lines, quantities)) });
}

export interface ReceiptDoneView {
  full: boolean;
  title: string;
  subtitle: string;
  cardTitle: string;
  cardMessage: string;
}

/** The result of a posted receipt, from the order as it stood before and what was sent. */
export function receiptDone(
  order: OrderDetail,
  sent: ReceiptRequest,
  warehouseName: string,
  tr: Translator,
): ReceiptDoneView {
  const now = sent.lines.reduce((sum, l) => sum + l.qty, 0);
  const received = order.receivedQty + now;
  const full = received >= order.orderedQty;
  const counts = { received: qty(received), ordered: qty(order.orderedQty) };
  return full
    ? {
        full,
        title: tr.t('purchase.receipt.fullTitle'),
        subtitle: tr.t('purchase.receipt.fullSubtitle', { order: order.name }),
        cardTitle: tr.t('purchase.receipt.fullCard', counts),
        cardMessage: tr.t('purchase.receipt.fullMessage', {
          now: units(now, tr),
          warehouse: warehouseName,
        }),
      }
    : {
        full,
        title: tr.t('purchase.receipt.partialTitle'),
        subtitle: tr.t('purchase.receipt.partialSubtitle', {
          order: order.name,
          warehouse: warehouseName,
        }),
        cardTitle: tr.t('purchase.receipt.partialCard', counts),
        cardMessage: tr.t('purchase.receipt.partialMessage', {
          now: units(now, tr),
          left: qty(order.orderedQty - received),
        }),
      };
}

/** "Receive items" before anything arrived, "Receive remaining 4" after; nothing once all is in. */
export function receiveAction(order: OrderDetail, tr: Translator): string | null {
  if (!receivable(order.progress)) {
    return null;
  }
  if (order.progress === 'awaitingReceipt') {
    return tr.t('purchase.detail.receive');
  }
  return tr.t('purchase.detail.receiveRemaining', {
    qty: qty(Math.max(order.orderedQty - order.receivedQty, 0)),
  });
}

/** An order line once goods have arrived: "POT-30 · 10 ordered · 6 received", "6 billed · 4 remain to receive". */
export function receivedLineCard(line: OrderLineDetail, tr: Translator): CardView {
  const left = remainingQty(line);
  const billed = line.rate > 0 ? Math.round((line.billedAmount / line.rate) * 1e6) / 1e6 : 0;
  const parts = [
    ...(billed > 0 ? [tr.t('purchase.detail.billedQty', { qty: qty(billed) })] : []),
    left > 0
      ? tr.t('purchase.detail.remainToReceive', { qty: qty(left) })
      : tr.t('purchase.detail.allReceived'),
  ];
  return {
    title: line.name,
    meta: tr.t('purchase.detail.receivedMeta', {
      code: line.code,
      ordered: qty(line.qty),
      received: qty(line.receivedQty),
    }),
    detail: parts.join(' · '),
    kind: 'product',
  };
}
