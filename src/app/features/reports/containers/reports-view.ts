import { formatMoney, formatShortDate, toIsoDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { TableRow } from '../../../shared/ui/data-table.component';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import { DateRange, PeriodFigures } from '../data-access/report.models';

export type PeriodKind = 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';
export const PERIOD_KINDS: readonly PeriodKind[] = ['thisMonth', 'lastMonth', 'thisYear', 'custom'];

/** Most months the by-month view reads, one ledger query each. */
export const MONTH_LIMIT = 12;

const amount = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const plain = (value: number) => (value < 0 ? `−${amount.format(-value)}` : amount.format(value));
const locale = (language: Language) => (language === 'ar' ? 'ar-u-nu-latn' : 'en-GB');
const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The dates a period covers, up to today for the current month and year. */
export function periodRange(kind: PeriodKind, today: Date, custom: DateRange | null): DateRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (kind) {
    case 'thisMonth':
      return { from: toIsoDate(new Date(y, m, 1)), to: toIsoDate(today) };
    case 'lastMonth':
      return { from: toIsoDate(new Date(y, m - 1, 1)), to: toIsoDate(new Date(y, m, 0)) };
    case 'thisYear':
      return { from: toIsoDate(new Date(y, 0, 1)), to: toIsoDate(today) };
    case 'custom':
      return custom ?? { from: toIsoDate(new Date(y, m, 1)), to: toIsoDate(today) };
  }
}

/** A custom range is usable when both dates are set and in order. */
export function validRange(range: DateRange | null): range is DateRange {
  return (
    !!range &&
    /^\d{4}-\d{2}-\d{2}$/.test(range.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(range.to) &&
    range.from <= range.to
  );
}

/** The calendar months a range touches, each clipped to the range; the most recent MONTH_LIMIT. */
export function monthsOf(range: DateRange): DateRange[] {
  const months: DateRange[] = [];
  const end = parse(range.to);
  let cursor = parse(range.from);
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  while (cursor <= end) {
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    months.push({
      from: toIsoDate(cursor) < range.from ? range.from : toIsoDate(cursor),
      to: toIsoDate(last) > range.to ? range.to : toIsoDate(last),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months.slice(-MONTH_LIMIT);
}

/** The three calendar months ending with the period's last month, for the phone's month bars. */
export function lastThreeMonths(range: DateRange): DateRange[] {
  const end = parse(range.to);
  return monthsOf({
    from: toIsoDate(new Date(end.getFullYear(), end.getMonth() - 2, 1)),
    to: range.to,
  });
}

/** "1–14 Oct 2026", "1 Aug – 14 Oct 2026" or "1 Dec 2025 – 14 Jan 2026". */
export function rangeText(range: DateRange, language: Language): string {
  const from = formatShortDate(range.from, language);
  const to = formatShortDate(range.to, language);
  if (range.from.slice(0, 7) === range.to.slice(0, 7)) {
    return `${Number(range.from.slice(8))}–${to}`;
  }
  return range.from.slice(0, 4) === range.to.slice(0, 4)
    ? `${from.replace(/ \d{4}$/, '')} – ${to}`
    : `${from} – ${to}`;
}

/** "This month · 1–14 Oct 2026", for the phone's period picker. */
export function periodOptions(
  today: Date,
  custom: DateRange | null,
  language: Language,
  tr: Translator,
) {
  return PERIOD_KINDS.map((kind) => ({
    value: kind,
    label:
      kind === 'custom' && !validRange(custom)
        ? tr.t('reports.period.custom')
        : tr.t('reports.period.option', {
            kind: tr.t(`reports.period.${kind}`),
            range: rangeText(periodRange(kind, today, custom), language),
          }),
  }));
}

/** "October 2026", with "· to date" for a month that is still running. */
export function monthLabel(
  month: DateRange,
  today: Date,
  language: Language,
  tr: Translator,
): string {
  const date = parse(month.from);
  const name = new Intl.DateTimeFormat(locale(language), { month: 'long' }).format(date);
  const label = `${name} ${date.getFullYear()}`;
  const running = month.to === toIsoDate(today) && today.getMonth() === date.getMonth();
  return running ? tr.t('reports.toDate', { month: label }) : label;
}

// en-US: the mocks abbreviate September as "Sep", where en-GB writes "Sept".
const shortMonth = (month: DateRange, language: Language) =>
  new Intl.DateTimeFormat(language === 'ar' ? locale(language) : 'en-US', {
    month: 'short',
  }).format(parse(month.from));

/** "ILS 6,270.00", or "− ILS 203.00" for a loss. */
export const money = (value: number, currency: string) =>
  value < 0 ? `− ${formatMoney(-value, currency)}` : formatMoney(value, currency);
// A negative cost (a stock gain booked to an expense account) adds to profit, so it reads "+".
const minus = (value: number, currency: string) =>
  value < 0
    ? `+ ${formatMoney(-value, currency)}`
    : value > 0
      ? `− ${formatMoney(value, currency)}`
      : formatMoney(0, currency);
const signed = (value: number, currency: string) =>
  `${value < 0 ? '−' : '+'} ${formatMoney(Math.abs(value), currency)}`;

/** Sales income, then cost of goods sold and expenses taken away. */
export function profitRows(figures: PeriodFigures, currency: string, tr: Translator): TotalRow[] {
  return [
    { label: tr.t('reports.income'), value: formatMoney(figures.income, currency) },
    { label: tr.t('reports.costOfGoods'), value: minus(figures.costOfGoods, currency) },
    { label: tr.t('reports.expenses'), value: minus(figures.expenses, currency) },
  ];
}

/** The phone's money card: totals, the net, each account's in and out, and bars for the last months. */
export function moneyView(
  figures: PeriodFigures,
  months: readonly PeriodFigures[],
  currency: string,
  language: Language,
) {
  const top = Math.max(...months.flatMap((m) => [m.moneyIn, m.moneyOut]), 1);
  return {
    moneyIn: formatMoney(figures.moneyIn, currency),
    moneyOut: formatMoney(figures.moneyOut, currency),
    net: signed(figures.moneyIn - figures.moneyOut, currency),
    accounts: figures.accounts.map((a) => ({
      name: a.name,
      moneyIn: plain(a.moneyIn),
      moneyOut: plain(a.moneyOut),
    })),
    bars: months.map((m) => ({
      label: shortMonth(m, language),
      moneyIn: plain(m.moneyIn),
      moneyOut: plain(m.moneyOut),
      inShare: m.moneyIn / top,
      outShare: m.moneyOut / top,
    })),
  };
}

/** The desktop's four figures: profit, sales income, money in and money out. */
export function metrics(figures: PeriodFigures, currency: string, tr: Translator) {
  const byAccount = (pick: 'moneyIn' | 'moneyOut') =>
    figures.accounts.map((a) => `${a.name} ${plain(a[pick])}`).join(' · ');
  return [
    {
      label: tr.t('reports.profit'),
      value: money(figures.profit, currency),
      hint: tr.t('reports.profitHint'),
      tint: true,
    },
    {
      label: tr.t('reports.income'),
      value: formatMoney(figures.income, currency),
      hint: tr.t('reports.incomeHint'),
      tint: false,
    },
    {
      label: tr.t('reports.moneyIn'),
      value: formatMoney(figures.moneyIn, currency),
      hint: byAccount('moneyIn'),
      tint: false,
    },
    {
      label: tr.t('reports.moneyOut'),
      value: formatMoney(figures.moneyOut, currency),
      hint: byAccount('moneyOut'),
      tint: false,
    },
  ];
}

/** Month · Sales income · Cost of goods sold · Expenses · Profit · Money in · Money out, then the total. */
export function monthRows(
  months: readonly PeriodFigures[],
  today: Date,
  language: Language,
  tr: Translator,
): TableRow[] {
  const cells = (f: Omit<PeriodFigures, 'from' | 'to' | 'accounts'>) => [
    plain(f.income),
    plain(f.costOfGoods),
    plain(f.expenses),
    plain(f.profit),
    plain(f.moneyIn),
    plain(f.moneyOut),
  ];
  const sum = (pick: (f: PeriodFigures) => number) =>
    Math.round(months.reduce((total, f) => total + pick(f), 0) * 100) / 100;
  return [
    ...months.map((m) => ({
      id: m.from,
      cells: [monthLabel(m, today, language, tr), ...cells(m)],
    })),
    {
      id: 'total',
      cells: [
        tr.t('reports.total'),
        ...cells({
          income: sum((f) => f.income),
          costOfGoods: sum((f) => f.costOfGoods),
          expenses: sum((f) => f.expenses),
          profit: sum((f) => f.profit),
          moneyIn: sum((f) => f.moneyIn),
          moneyOut: sum((f) => f.moneyOut),
        }),
      ],
    },
  ];
}

/** The profit-by-month page: the period's total, then each month newest first. */
export function profitByMonth(
  months: readonly PeriodFigures[],
  currency: string,
  today: Date,
  language: Language,
  tr: Translator,
) {
  const sum = (pick: (f: PeriodFigures) => number) => months.reduce((t, f) => t + pick(f), 0);
  return {
    total: money(
      sum((f) => f.profit),
      currency,
    ),
    totalRows: [
      {
        label: tr.t('reports.income'),
        value: formatMoney(
          sum((f) => f.income),
          currency,
        ),
      },
      {
        label: tr.t('reports.costs'),
        value: minus(
          sum((f) => f.costOfGoods + f.expenses),
          currency,
        ),
      },
    ] as TotalRow[],
    months: [...months].reverse().map((m) => ({
      id: m.from,
      title: monthLabel(m, today, language, tr),
      profit: money(m.profit, currency),
      rows: profitRows(m, currency, tr),
    })),
  };
}
