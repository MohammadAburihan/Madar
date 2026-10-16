import { Translator } from '../../../core/i18n/translator';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import { SiteBalance } from '../data-access/project.models';
import { qty, supplyUnits } from './supply-view';

const ordered = (balance: SiteBalance) => balance.pendingOrders.reduce((sum, o) => sum + o.qty, 0);

/** "8 delivered · 0 used", as on the materials-at-site mock. */
export function siteChip(balance: SiteBalance, tr: Translator): string {
  return tr.t('project.site.chip', {
    delivered: qty(balance.delivered),
    used: qty(balance.consumed),
  });
}

/** Delivered, consumed and available at site, then what open orders still bring. */
export function siteRows(balance: SiteBalance, tr: Translator): TotalRow[] {
  return [
    { label: tr.t('project.site.rows.delivered'), value: supplyUnits(balance.delivered, tr) },
    { label: tr.t('project.site.rows.consumed'), value: supplyUnits(balance.consumed, tr) },
    {
      label: tr.t('project.site.rows.atSite'),
      value: supplyUnits(balance.atSite, tr),
      accent: true,
    },
    ...balance.pendingOrders.map((o) => ({
      label: tr.t('project.site.rows.pending', { order: o.name }),
      value: tr.t('project.site.rows.pendingValue', { qty: qty(o.qty) }),
      text: true,
    })),
  ];
}

/** "At site before 8 · After confirming use 3 at site · 5 consumed". */
export function useRows(balance: SiteBalance, using: number, tr: Translator): TotalRow[] {
  return [
    { label: tr.t('project.site.before'), value: supplyUnits(balance.atSite, tr) },
    {
      label: tr.t('project.site.afterUse'),
      value: tr.t('project.site.afterUseValue', {
        left: qty(balance.atSite - using),
        consumed: qty(balance.consumed + using),
      }),
      accent: true,
      text: true,
    },
  ];
}

export function useAdvice(balance: SiteBalance, using: number, tr: Translator) {
  const values = {
    qty: qty(using),
    before: qty(balance.atSite),
    after: qty(balance.atSite - using),
  };
  return {
    title: tr.t('project.site.useAdvice.title'),
    message: tr.t(
      ordered(balance) > 0
        ? 'project.site.useAdvice.messagePending'
        : 'project.site.useAdvice.message',
      values,
    ),
  };
}

/** "5 used · 3 at site", as on the usage-recorded mock. */
export function usedChip(balance: SiteBalance, tr: Translator): string {
  return tr.t('project.site.usedChip', { used: qty(balance.consumed), left: qty(balance.atSite) });
}

export function balanceRows(balance: SiteBalance, tr: Translator): TotalRow[] {
  return [
    { label: tr.t('project.site.returnRows.delivered'), value: supplyUnits(balance.delivered, tr) },
    { label: tr.t('project.site.returnRows.consumed'), value: supplyUnits(balance.consumed, tr) },
    {
      label: tr.t('project.site.returnRows.atSite'),
      value: supplyUnits(balance.atSite, tr),
      accent: true,
    },
  ];
}

/** "Site balance after return 3 → 1 · Main warehouse after return 0 → 2". */
export function returnRows(
  balance: SiteBalance,
  target: { name: string; qty: number },
  returning: number,
  tr: Translator,
): TotalRow[] {
  return [
    {
      label: tr.t('project.site.siteAfter'),
      value: `${qty(balance.atSite)} → ${qty(balance.atSite - returning)}`,
    },
    {
      label: tr.t('project.site.warehouseAfter', { warehouse: target.name }),
      value: `${qty(target.qty)} → ${qty(target.qty + returning)}`,
    },
  ];
}

export function returnAdvice(
  balance: SiteBalance,
  target: { name: string },
  returning: number,
  tr: Translator,
) {
  return {
    title: tr.t('project.site.returnAdvice.title'),
    message: tr.t('project.site.returnAdvice.message', {
      units: supplyUnits(returning, tr),
      warehouse: target.name,
      consumed: qty(balance.consumed),
    }),
  };
}

/** "PO-2049 still has 4 units pending receipt." per open order. */
export function pendingNotes(balance: SiteBalance, tr: Translator): string[] {
  return balance.pendingOrders.map((o) =>
    tr.t('project.site.pendingNote', { order: o.name, units: supplyUnits(o.qty, tr) }),
  );
}

/** The posted return against the balance after it, as on the return-posted mock. */
export function returnedView(
  balance: SiteBalance,
  target: { warehouse: string; name: string; qty: number },
  returned: number,
  tr: Translator,
) {
  const order = balance.pendingOrders[0] ?? null;
  return {
    chip: tr.t('project.site.returnedChip', { qty: qty(returned) }),
    card: {
      title: tr.t('project.site.returnedCard.title'),
      message:
        balance.atSite > 0
          ? tr.t('project.site.returnedCard.message', { units: supplyUnits(balance.atSite, tr) })
          : tr.t('project.site.returnedCard.messageNone'),
    },
    rows: [
      {
        label: tr.t('project.site.returnedRows.delivered'),
        value: supplyUnits(balance.delivered, tr),
      },
      {
        label: tr.t('project.site.returnedRows.consumed'),
        value: supplyUnits(balance.consumed, tr),
      },
      {
        label: tr.t('project.site.returnedRows.returned', { warehouse: target.name }),
        value: supplyUnits(balance.returnedTo[target.warehouse] ?? 0, tr),
      },
      {
        label: tr.t('project.site.returnedRows.atSite'),
        value: supplyUnits(balance.atSite, tr),
        accent: true,
      },
      {
        label: tr.t('project.site.returnedRows.warehouse', { warehouse: target.name }),
        value: supplyUnits(target.qty, tr),
      },
    ] as TotalRow[],
    pending: order
      ? {
          order: order.name,
          title: tr.t('project.site.pendingCard', {
            order: order.name,
            units: supplyUnits(order.qty, tr),
          }),
          message: tr.t('project.site.pendingCardMessage', {
            delivered: qty(balance.delivered),
            used: qty(balance.consumed),
            returned: qty(balance.returned),
            left: qty(balance.atSite),
            ordered: qty(ordered(balance)),
          }),
        }
      : null,
  };
}
