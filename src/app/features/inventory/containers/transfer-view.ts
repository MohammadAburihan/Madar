import { formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import { StockItem, TransferResult, WarehouseInfo } from '../data-access/inventory.models';
import { qtyText } from './inventory-view';

const qtyFormat = (qty: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(qty);

export function locationOptions(
  item: StockItem | null,
  warehouses: readonly WarehouseInfo[],
  side: 'from' | 'to',
  tr: Translator,
) {
  return warehouses.map((w) => ({
    value: w.id,
    label: item
      ? tr.t(side === 'from' ? 'transfer.fromOption' : 'transfer.toOption', {
          warehouse: w.name,
          qty: qtyFormat(item.stock[w.id] ?? 0),
        })
      : w.name,
  }));
}

/** The review card: each balance before and after the move, and the unchanged company total. */
export function reviewCard(
  item: StockItem,
  from: WarehouseInfo,
  to: WarehouseInfo,
  qty: number,
  tr: Translator,
): { heading: string; rows: TotalRow[] } {
  const total = Object.values(item.stock).reduce((sum, value) => sum + value, 0);
  const change = (before: number, after: number) =>
    tr.t('transfer.beforeAfter', { before: qtyFormat(before), after: qtyFormat(after) });
  const fromQty = item.stock[from.id] ?? 0;
  const toQty = item.stock[to.id] ?? 0;
  return {
    heading: tr.t('transfer.heading', {
      qty: qtyText(qty, item.uom, tr),
      from: from.name,
      to: to.name,
    }),
    rows: [
      { label: from.name, value: change(fromQty, fromQty - qty) },
      { label: to.name, value: change(toQty, toQty + qty) },
      { label: tr.t('transfer.companyTotal'), value: change(total, total), accent: true },
    ],
  };
}

/** The balances after the move, as ERPNext reports them. */
export function doneRows(
  result: TransferResult,
  item: { uom: string },
  from: string,
  to: string,
  language: Language,
  tr: Translator,
): TotalRow[] {
  const qty = (value: number | null) => (value === null ? '—' : qtyText(value, item.uom, tr));
  return [
    { label: tr.t('transfer.fromRow', { warehouse: from }), value: qty(result.fromQty) },
    { label: tr.t('transfer.toRow', { warehouse: to }), value: qty(result.toQty) },
    { label: tr.t('transfer.companyTotal'), value: qty(result.totalQty), accent: true },
    {
      label: tr.t('transfer.posted'),
      value: tr.t('transfer.postedValue', {
        date: formatShortDate(result.postingDate, language),
        time: clockTime(result.postingTime),
      }),
    },
  ];
}

/** "HH:MM" from Frappe's time, which list reads return unpadded ("3:17:2.52915"). */
export function clockTime(time: string): string {
  const [hours = '0', minutes = '0'] = time.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}
