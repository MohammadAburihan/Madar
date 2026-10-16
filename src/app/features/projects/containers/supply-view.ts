import { Translator } from '../../../core/i18n/translator';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import { SupplyPlan } from '../data-access/project.models';

const qtyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
export const qty = (value: number) => qtyFormat.format(Math.round(value * 1e6) / 1e6);
export const supplyUnits = (count: number, tr: Translator) =>
  tr.plural('project.supply.units', count, { count: qty(count) });

const pendingTotal = (plan: SupplyPlan) => plan.pendingOrders.reduce((sum, o) => sum + o.qty, 0);

/** "Project requirement 12 units · Main warehouse stock 8 available · Shortfall to buy 4 units". */
export function planRows(
  plan: SupplyPlan,
  source: { name: string; qty: number } | null,
  shortfall: number,
  tr: Translator,
): TotalRow[] {
  const rows: TotalRow[] = [
    { label: tr.t('project.supply.rows.need'), value: supplyUnits(plan.need, tr) },
  ];
  if (source) {
    rows.push({
      label: tr.t('project.supply.rows.stock', { warehouse: source.name }),
      value: tr.t('project.supply.available', { qty: qty(source.qty) }),
    });
  }
  if (plan.atSite > 0) {
    rows.push({ label: tr.t('project.supply.rows.atSite'), value: supplyUnits(plan.atSite, tr) });
  }
  if (pendingTotal(plan) > 0) {
    rows.push({
      label: tr.t('project.supply.rows.pending'),
      value: supplyUnits(pendingTotal(plan), tr),
    });
  }
  rows.push({
    label: tr.t('project.supply.rows.shortfall'),
    value: supplyUnits(shortfall, tr),
    accent: shortfall > 0,
  });
  return rows;
}

/** "Supply in two parts: move 8 now, buy 4 more", the rest in another delivery, or all of it now. */
export function supplyAdvice(
  sending: number,
  shortfall: number,
  elsewhere: number,
  tr: Translator,
) {
  if (shortfall > 0) {
    return {
      tone: 'warning' as const,
      title: tr.t('project.supply.twoParts.title'),
      message:
        elsewhere > 0
          ? tr.t('project.supply.twoParts.messageElsewhere', {
              now: qty(sending),
              rest: qty(elsewhere),
              later: qty(shortfall),
            })
          : tr.t('project.supply.twoParts.message', { now: qty(sending), later: qty(shortfall) }),
    };
  }
  if (elsewhere > 0) {
    return {
      tone: 'tint' as const,
      title: tr.t('project.supply.elsewhere.title'),
      message: tr.t('project.supply.elsewhere.message', {
        now: qty(sending),
        rest: qty(elsewhere),
      }),
    };
  }
  return {
    tone: 'tint' as const,
    title: tr.t('project.supply.allNow.title'),
    message: tr.t('project.supply.allNow.message', { now: supplyUnits(sending, tr) }),
  };
}

/** "Main warehouse 8 → 0 · Project site 0 → 8 · Required 12 · 4 still to buy", as on the review mock. */
export function reviewRows(
  plan: SupplyPlan,
  source: { name: string; qty: number },
  sending: number,
  shortfall: number,
  tr: Translator,
): TotalRow[] {
  return [
    {
      label: tr.t('project.supply.flow.source', { warehouse: source.name }),
      value: `${qty(source.qty)} → ${qty(source.qty - sending)}`,
    },
    {
      label: tr.t('project.supply.flow.site'),
      value: `${qty(plan.atSite)} → ${qty(plan.atSite + sending)}`,
    },
    {
      label: tr.t('project.supply.flow.required'),
      value:
        shortfall > 0
          ? tr.t('project.supply.flow.requiredValue', {
              need: qty(plan.need),
              left: qty(shortfall),
            })
          : tr.t('project.supply.flow.requiredDone', { need: qty(plan.need) }),
      accent: shortfall > 0,
    },
  ];
}

/** The pending purchase orders, as on the review mock: "PO-2049 · 4 units · pending receipt". */
export function pendingCards(plan: SupplyPlan, tr: Translator) {
  return plan.pendingOrders.map((o) => ({
    title: tr.t('project.supply.pendingCard', { order: o.name, units: supplyUnits(o.qty, tr) }),
    message: tr.t('project.supply.pendingMessage'),
  }));
}
