import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import { Breakdown, PeopleFigures } from '../data-access/breakdowns-api.service';

/** Lists show the top five, then the rest as one line. */
export const TOP = 5;

const qty = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);

/** A breakdown card: heading with the total, the top lines, then "Other (n)". */
export function breakdownCard(
  key: 'items' | 'customers' | 'suppliers' | 'stock',
  data: Breakdown,
  currency: string,
  tr: Translator,
) {
  const money = (v: number) => formatMoney(v, currency);
  const top = data.rows.slice(0, TOP);
  const rest = data.rows.slice(TOP);
  return {
    key,
    heading: `${tr.t(`reports.breakdowns.${key}`)} · ${money(data.total)}`,
    rows: data.rows.length
      ? rowsOf()
      : [{ label: tr.t('reports.breakdowns.none'), value: '', text: true }],
  };

  function rowsOf(): TotalRow[] {
    return [
      ...top.map((r) => ({
        label:
          r.qty === null
            ? r.label
            : tr.t('reports.breakdowns.sold', { item: r.label, qty: qty(r.qty) }),
        value: money(r.amount),
      })),
      ...(rest.length
        ? [
            {
              label: tr.t('reports.breakdowns.other', { count: rest.length }),
              value: money(rest.reduce((s, r) => s + r.amount, 0)),
            },
          ]
        : []),
    ];
  }
}

/** The period's figures at a glance: sales, with purchases, stock, pay and attendance as the role can read them. */
export function breakdownSummary(
  sales: Breakdown,
  purchases: Breakdown,
  stock: Breakdown,
  people: PeopleFigures | null,
  currency: string,
  tr: Translator,
): { label: string; amount: string; rows: TotalRow[] } {
  const money = (v: number) => formatMoney(v, currency);
  const t = (key: string) => tr.t(`reports.breakdowns.${key}`);
  return {
    label: t('salesTotal'),
    amount: money(sales.total),
    rows: [
      { label: t('purchases'), value: money(purchases.total) },
      { label: t('stockValue'), value: money(stock.total) },
      ...(people
        ? [
            { label: t('pay'), value: money(people.net) },
            { label: t('days'), value: qty(people.daysPresent) },
          ]
        : []),
    ],
  };
}
