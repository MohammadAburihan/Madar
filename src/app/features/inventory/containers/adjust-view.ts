import { Translator } from '../../../core/i18n/translator';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import {
  AdjustKind,
  AdjustResult,
  DamageType,
  StockItem,
  WarehouseInfo,
  totalStock,
} from '../data-access/inventory.models';
import { qtyText } from './inventory-view';

const num = (qty: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(qty);
/** "−2", "+3": a signed whole difference with a true minus sign. */
const signed = (qty: number) => (qty > 0 ? `+${num(qty)}` : qty < 0 ? `−${num(-qty)}` : '0');

export const DAMAGE_TYPES: readonly DamageType[] = ['damaged', 'lost', 'expired'];

export function locationOptions(
  item: StockItem | null,
  warehouses: readonly WarehouseInfo[],
  tr: Translator,
) {
  return warehouses.map((w) => ({
    value: w.id,
    label: item
      ? tr.t('adjust.locationOption', { warehouse: w.name, qty: num(item.stock[w.id] ?? 0) })
      : w.name,
  }));
}

export function damageTypeOptions(tr: Translator) {
  return DAMAGE_TYPES.map((type) => ({ value: type, label: tr.t(`adjust.damage.types.${type}`) }));
}

/** Before and after at the location and for the company, for a change of `change` units. */
function balances(item: StockItem, warehouse: WarehouseInfo, change: number) {
  const before = item.stock[warehouse.id] ?? 0;
  const total = totalStock(item);
  return { before, after: before + change, totalBefore: total, totalAfter: total + change };
}

/** The entry step's effect card: what posting would do, or that a count matches. */
export function effectCard(
  kind: AdjustKind,
  item: StockItem,
  warehouse: WarehouseInfo,
  change: number,
  tr: Translator,
): { tone: 'tint' | 'warning'; title: string; message: string } {
  if (kind === 'damage') {
    return {
      tone: 'warning',
      title: tr.t('adjust.damage.effect.title'),
      message: tr.t('adjust.damage.effect.message'),
    };
  }
  if (change === 0) {
    return {
      tone: 'tint',
      title: tr.t('adjust.count.same.title'),
      message: tr.t('adjust.count.same.message'),
    };
  }
  const b = balances(item, warehouse, change);
  return {
    tone: 'warning',
    title: tr.t(change < 0 ? 'adjust.count.fall' : 'adjust.count.rise', {
      qty: num(Math.abs(change)),
    }),
    message: tr.t('adjust.count.effect', {
      warehouse: warehouse.name,
      before: num(b.before),
      after: num(b.after),
      totalBefore: num(b.totalBefore),
      totalAfter: num(b.totalAfter),
    }),
  };
}

/** Damage: the location's and the company's quantity before and after the write-off. */
export function writeOffRows(
  item: StockItem,
  warehouse: WarehouseInfo,
  change: number,
  tr: Translator,
): TotalRow[] {
  const b = balances(item, warehouse, change);
  const arrow = (before: number, after: number) =>
    tr.t('adjust.beforeAfter', { before: num(before), after: qtyText(after, item.uom, tr) });
  return [
    { label: warehouse.name, value: arrow(b.before, b.after) },
    { label: tr.t('adjust.companyTotal'), value: arrow(b.totalBefore, b.totalAfter), accent: true },
  ];
}

/** The review step's card: "Count variance −2" or "Write off 1 Nos · Damaged", and what changes. */
export function reviewCard(
  kind: AdjustKind,
  item: StockItem,
  warehouse: WarehouseInfo,
  qty: number,
  change: number,
  damageType: DamageType,
  reason: string,
  tr: Translator,
): { title: string; message: string } {
  const b = balances(item, warehouse, change);
  const figures = {
    warehouse: warehouse.name,
    before: num(b.before),
    after: num(b.after),
    totalBefore: num(b.totalBefore),
    totalAfter: num(b.totalAfter),
    reason,
  };
  return kind === 'count'
    ? {
        title: tr.t('adjust.count.variance', { change: signed(change) }),
        message: tr.t('adjust.count.reviewMessage', {
          ...figures,
          system: num(b.before),
          counted: num(qty),
        }),
      }
    : {
        title: tr.t('adjust.damage.heading', {
          qty: qtyText(qty, item.uom, tr),
          type: tr.t(`adjust.damage.types.${damageType}`),
        }),
        message: tr.t('adjust.damage.reviewMessage', figures),
      };
}

/** The done step's message, from the balances ERPNext reports after posting. */
export function doneMessage(
  kind: AdjustKind,
  result: AdjustResult,
  warehouse: string,
  item: { name: string; uom: string },
  tr: Translator,
): string {
  if (result.warehouseQty === null || result.totalQty === null) {
    return tr.t('adjust.doneUnread');
  }
  return tr.t(`adjust.${kind}.doneMessage`, {
    warehouse,
    qty: qtyText(result.warehouseQty, item.uom, tr),
    item: item.name,
    total: num(result.totalQty),
  });
}
