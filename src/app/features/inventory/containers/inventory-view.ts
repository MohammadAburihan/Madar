import { daysUntil, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { TableRow } from '../../../shared/ui/data-table.component';
import { HistoryEntry } from '../../../shared/ui/history-list.component';
import { Movement, StockItem, WarehouseInfo, totalStock } from '../data-access/inventory.models';

export interface ItemView {
  title: string;
  meta: string | null;
  detail: string | null;
  kind: 'product' | 'service';
}

type EventKind =
  'received' | 'moved' | 'sold' | 'returned' | 'adjusted' | 'issued' | 'added' | 'other';

const qtyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

export function qtyText(qty: number, uom: string, tr: Translator): string {
  return tr.t('inventory.qty', { qty: qtyFormat.format(qty), uom });
}

export function stockStatus(item: StockItem): 'available' | 'low' | 'out' {
  return totalStock(item) <= 0 ? 'out' : item.low ? 'low' : 'available';
}

export function warehouseCard(item: StockItem, warehouse: WarehouseInfo, tr: Translator): ItemView {
  return {
    title: warehouse.name,
    meta: item.code,
    detail: tr.t('inventory.warehouseDetail', {
      qty: qtyText(item.stock[warehouse.id] ?? 0, item.uom, tr),
    }),
    kind: 'product',
  };
}

export function itemRow(
  item: StockItem,
  warehouses: readonly WarehouseInfo[],
  tr: Translator,
): TableRow {
  return {
    id: item.code,
    cells: [
      tr.t('inventory.itemHeading', { item: item.name, code: item.code }),
      ...warehouses.map((w) => qtyText(item.stock[w.id] ?? 0, item.uom, tr)),
      tr.t(`inventory.status.${stockStatus(item)}`),
    ],
  };
}

/** Warehouses worth a column: the ones holding any of the listed stock (at least one). */
export function stockedWarehouses(
  items: readonly StockItem[],
  warehouses: readonly WarehouseInfo[],
): WarehouseInfo[] {
  const stocked = warehouses.filter((w) => items.some((i) => (i.stock[w.id] ?? 0) !== 0));
  return stocked.length ? stocked : warehouses.slice(0, 1);
}

function eventKind(movement: Movement): EventKind {
  const net = movement.lines.reduce((sum, line) => sum + line.qty, 0);
  switch (movement.voucherType) {
    case 'Purchase Receipt':
    case 'Purchase Invoice':
      return net >= 0 ? 'received' : 'returned';
    case 'Sales Invoice':
    case 'Delivery Note':
    case 'POS Invoice':
      return net <= 0 ? 'sold' : 'returned';
    case 'Stock Reconciliation':
      return 'adjusted';
    case 'Stock Entry':
      return movement.lines.some((l) => l.qty > 0) && movement.lines.some((l) => l.qty < 0)
        ? 'moved'
        : net >= 0
          ? 'added'
          : 'issued';
    default:
      return 'other';
  }
}

function whenText(isoDate: string, today: Date, language: Language, tr: Translator): string {
  const days = daysUntil(isoDate, today);
  return days === 0
    ? tr.t('inventory.today')
    : days === -1
      ? tr.t('inventory.yesterday')
      : formatShortDate(isoDate, language);
}

function warehouseName(id: string, warehouses: readonly WarehouseInfo[]): string {
  return warehouses.find((w) => w.id === id)?.name ?? id;
}

function moveSides(movement: Movement, warehouses: readonly WarehouseInfo[]) {
  const out = movement.lines.find((l) => l.qty < 0);
  const into = movement.lines.find((l) => l.qty > 0);
  return {
    qty: Math.abs(into?.qty ?? out?.qty ?? 0),
    from: warehouseName(out?.warehouse ?? '', warehouses),
    to: warehouseName(into?.warehouse ?? '', warehouses),
  };
}

/** One line in the mobile "Recent movement history" card. */
export function movementEntry(
  movement: Movement,
  item: StockItem,
  warehouses: readonly WarehouseInfo[],
  today: Date,
  language: Language,
  tr: Translator,
): HistoryEntry {
  const kind = eventKind(movement);
  const when = whenText(movement.postingDate, today, language, tr);
  if (kind === 'moved') {
    const side = moveSides(movement, warehouses);
    return {
      title: tr.t('inventory.event.moved', {
        qty: qtyText(side.qty, item.uom, tr),
        item: item.name,
      }),
      meta: tr.t('inventory.metaMoved', { when, from: side.from, to: side.to }),
    };
  }
  const net = movement.lines.reduce((sum, line) => sum + line.qty, 0);
  const places = [...new Set(movement.lines.map((l) => warehouseName(l.warehouse, warehouses)))];
  const qty =
    kind === 'adjusted' || kind === 'other'
      ? `${net > 0 ? '+' : ''}${qtyFormat.format(net)}`
      : qtyText(Math.abs(net), item.uom, tr);
  return {
    title: tr.t(`inventory.event.${kind}`, { qty, item: item.name, type: movement.voucherType }),
    meta: tr.t('inventory.meta', {
      when,
      warehouse: places.join(', '),
      voucher: movement.voucher,
    }),
  };
}

/** One row of the desktop "Movement history" table. */
export function movementRow(
  movement: Movement,
  item: StockItem,
  warehouses: readonly WarehouseInfo[],
  tr: Translator,
): TableRow {
  const kind = eventKind(movement);
  const net = movement.lines.reduce((sum, line) => sum + line.qty, 0);
  const side = moveSides(movement, warehouses);
  return {
    id: movement.voucher,
    cells: [
      tr.t(`inventory.eventShort.${kind}`, { type: movement.voucherType }),
      kind === 'moved'
        ? tr.t('inventory.movedQty', {
            qty: qtyText(side.qty, item.uom, tr),
            from: side.from,
            to: side.to,
          })
        : tr.t('inventory.signedQty', {
            qty: qtyText(Math.abs(net), item.uom, tr),
            direction: tr.t(net >= 0 ? 'inventory.in' : 'inventory.out'),
          }),
      kind === 'moved'
        ? side.to
        : [...new Set(movement.lines.map((l) => warehouseName(l.warehouse, warehouses)))].join(
            ', ',
          ),
    ],
  };
}
