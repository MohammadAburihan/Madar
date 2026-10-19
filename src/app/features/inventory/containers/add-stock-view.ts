import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import { AddStockReason, AddStockRequest } from '../data-access/inventory.models';

const num = (qty: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(qty);

export const ADD_REASONS: readonly AddStockReason[] = ['opening', 'made'];

export function reasonOptions(tr: Translator) {
  return ADD_REASONS.map((r) => ({ value: r, label: tr.t(`addStock.reasons.${r}`) }));
}

/**
 * What the request brings in: "Add 2 items · 15 units", each line with its cost where one was set, and the value
 * of the costed lines (only shown to roles that see costs, who are the only ones to set one).
 */
export function addStockSummary(
  request: Pick<AddStockRequest, 'lines'>,
  currency: string,
  withCosts: boolean,
  tr: Translator,
) {
  const units = request.lines.reduce((sum, l) => sum + l.qty, 0);
  const lines = request.lines.map((l) =>
    withCosts && l.rate !== null
      ? tr.t('addStock.lineCost', {
          item: l.name,
          qty: num(l.qty),
          uom: l.uom,
          rate: formatMoney(l.rate, currency),
        })
      : tr.t('addStock.line', { item: l.name, qty: num(l.qty), uom: l.uom }),
  );
  const costed = request.lines.filter((l) => l.rate !== null);
  const value = costed.reduce((sum, l) => sum + l.qty * (l.rate ?? 0), 0);
  return {
    title: tr.plural('addStock.heading', request.lines.length, { units: num(units) }),
    message: [
      ...lines,
      withCosts && costed.length
        ? tr.t(costed.length === request.lines.length ? 'addStock.value' : 'addStock.valueSome', {
            amount: formatMoney(value, currency),
          })
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
