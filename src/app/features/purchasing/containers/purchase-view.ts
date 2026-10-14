import { formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { TableRow } from '../../../shared/ui/data-table.component';
import { Stat } from '../../../shared/ui/stat-card.component';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import {
  OrderDetail,
  OrderLine,
  OrderProgress,
  OrderSummary,
  PurchaseItem,
  PurchasingOverview,
  isOpen,
  linesTotal,
} from '../data-access/purchase.models';

export interface CardView {
  title: string;
  meta: string | null;
  detail: string | null;
  kind: 'product' | 'service';
}

const qtyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const qty = (value: number) => qtyFormat.format(value);

/** "6 received · 4 open", "Awaiting receipt", … for an order. */
export function progressText(order: OrderSummary, tr: Translator): string {
  return tr.t(`purchase.progress.${order.progress}`, {
    received: qty(order.receivedQty),
    open: qty(Math.max(order.orderedQty - order.receivedQty, 0)),
  });
}

/** The labeled status chip for an order: confirmed, partly received, … */
export function progressChip(
  progress: OrderProgress,
  tr: Translator,
): { label: string; tone: 'tint' | 'warning' } {
  return {
    label: tr.t(`purchase.chip.${progress}`),
    tone: progress === 'partlyReceived' || progress === 'draft' ? 'warning' : 'tint',
  };
}

export function workspaceStats(
  overview: PurchasingOverview,
  currency: string,
  tr: Translator,
): Stat[] {
  const open = overview.orders.filter((o) => isOpen(o.progress));
  const stats: Stat[] = [
    { label: tr.t('purchase.stats.open'), value: String(open.length) },
    {
      label: tr.t('purchase.stats.awaitingReceipt'),
      value: String(
        open.filter((o) => o.progress === 'awaitingReceipt' || o.progress === 'partlyReceived')
          .length,
      ),
    },
  ];
  if (overview.supplierBalance !== null) {
    stats.push({
      label: tr.t('purchase.stats.supplierBalance'),
      value: formatMoney(overview.supplierBalance, currency),
    });
  }
  return stats;
}

export function orderRow(
  order: OrderSummary,
  currency: string,
  language: Language,
  tr: Translator,
): TableRow {
  return {
    id: order.name,
    cells: [
      tr.t('purchase.orderLabel', { order: order.name, supplier: order.supplierName }),
      formatShortDate(order.date, language),
      progressText(order, tr),
      formatMoney(order.total, currency),
    ],
  };
}

/** One order in the mobile list. */
export function orderCard(
  order: OrderSummary,
  currency: string,
  language: Language,
  tr: Translator,
): CardView {
  return {
    title: tr.t('purchase.orderLabel', { order: order.name, supplier: order.supplierName }),
    meta: formatShortDate(order.date, language),
    detail: tr.t('purchase.orderDetail', {
      status: progressText(order, tr),
      total: formatMoney(order.total, currency),
    }),
    kind: 'product',
  };
}

/** The workspace's side panel for the selected order. */
export function orderPanel(order: OrderSummary, currency: string, tr: Translator): TotalRow[] {
  return [
    { label: tr.t('purchase.panel.total'), value: formatMoney(order.total, currency) },
    {
      label: tr.t('purchase.panel.received'),
      value: tr.t('purchase.panel.receivedValue', {
        received: qty(order.receivedQty),
        ordered: qty(order.orderedQty),
        open: qty(Math.max(order.orderedQty - order.receivedQty, 0)),
      }),
    },
  ];
}

export function itemResult(item: PurchaseItem, currency: string, tr: Translator): CardView {
  return {
    title: item.name,
    meta: tr.t('purchase.itemMeta', {
      code: item.code,
      kind: tr.t(`purchase.kind.${item.kind}`),
      uom: item.uom,
    }),
    detail: tr.t('purchase.each', { amount: formatMoney(item.rate, currency) }),
    kind: item.kind,
  };
}

/** What was typed in the price fields, for the lines still on the order. */
export function keptRateInputs(
  inputs: Record<string, string>,
  lines: readonly OrderLine[],
): Record<string, string> {
  return Object.fromEntries(
    lines.filter((l) => l.item.code in inputs).map((l) => [l.item.code, inputs[l.item.code]]),
  );
}

/** "10 × ILS 45.00 … ILS 450.00" for each line on the order form. */
export function lineRows(lines: readonly OrderLine[], currency: string): TotalRow[] {
  return lines.map((l) => ({
    label: `${qty(l.qty)} × ${formatMoney(l.rate, currency)}`,
    value: formatMoney(l.qty * l.rate, currency),
    accent: true,
  }));
}

export function reviewCard(line: OrderLine, currency: string, tr: Translator): CardView {
  return {
    title: line.item.name,
    meta: tr.t('purchase.review.lineMeta', {
      code: line.item.code,
      qty: qty(line.qty),
      rate: formatMoney(line.rate, currency),
    }),
    detail: tr.t('purchase.review.lineValue', {
      amount: formatMoney(line.qty * line.rate, currency),
    }),
    kind: line.item.kind,
  };
}

/** What confirming creates, and what it doesn't. */
export function beforeMessage(
  lines: readonly OrderLine[],
  currency: string,
  tr: Translator,
): string {
  const what =
    lines.length === 1
      ? tr.t('purchase.review.oneItem', { qty: qty(lines[0].qty), item: lines[0].item.name })
      : tr.plural('purchase.review.items', lines.length);
  return tr.t('purchase.review.beforeMessage', {
    what,
    total: formatMoney(linesTotal(lines), currency),
  });
}

export function detailLineCard(
  line: OrderDetail['lines'][number],
  currency: string,
  tr: Translator,
): CardView {
  return {
    title: line.name,
    meta: line.code,
    detail: tr.t('purchase.detail.lineDetail', {
      qty: qty(line.qty),
      rate: formatMoney(line.rate, currency),
    }),
    kind: 'product',
  };
}

export function detailStats(order: OrderDetail, tr: Translator): Stat[] {
  return [
    { label: tr.t('purchase.detail.ordered'), value: qty(order.orderedQty) },
    { label: tr.t('purchase.detail.received'), value: qty(order.receivedQty) },
    {
      label: tr.t('purchase.detail.remaining'),
      value: qty(Math.max(order.orderedQty - order.receivedQty, 0)),
    },
  ];
}
