import { realTranslator } from '../../../../testing/real-translator';
import { PeriodFigures } from '../data-access/report.models';
import * as view from './reports-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');
const TODAY = new Date(2026, 9, 14);

const month = (
  from: string,
  to: string,
  income: number,
  cogs: number,
  exp: number,
  mIn: number,
  mOut: number,
): PeriodFigures => ({
  from,
  to,
  income,
  costOfGoods: cogs,
  expenses: exp,
  profit: income - cogs - exp,
  moneyIn: mIn,
  moneyOut: mOut,
  accounts: [
    { account: 'Cash - RN', name: 'Main cash', moneyIn: mIn / 2, moneyOut: mOut / 2 },
    { account: 'Bank - RN', name: 'Main bank', moneyIn: mIn / 2, moneyOut: mOut / 2 },
  ],
});
const AUG = month('2026-08-01', '2026-08-31', 21300, 11950, 2840, 19800, 14100);
const SEP = month('2026-09-01', '2026-09-30', 24150, 13420, 3050, 22600, 15900);
const OCT = month('2026-10-01', '2026-10-14', 18450, 9870, 2310, 15920, 11640);

describe('reports view', () => {
  it('works out the period from the site today', () => {
    expect(view.periodRange('thisMonth', TODAY, null)).toEqual({
      from: '2026-10-01',
      to: '2026-10-14',
    });
    expect(view.periodRange('lastMonth', TODAY, null)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(view.periodRange('thisYear', TODAY, null)).toEqual({
      from: '2026-01-01',
      to: '2026-10-14',
    });
    const custom = { from: '2026-08-01', to: '2026-10-14' };
    expect(view.periodRange('custom', TODAY, custom)).toEqual(custom);
    expect(view.validRange({ from: '2026-10-14', to: '2026-10-01' })).toBe(false);
    expect(view.validRange({ from: '', to: '2026-10-01' })).toBe(false);
  });

  it('splits a range into calendar months, clipped to it', () => {
    expect(view.monthsOf({ from: '2026-08-15', to: '2026-10-14' })).toEqual([
      { from: '2026-08-15', to: '2026-08-31' },
      { from: '2026-09-01', to: '2026-09-30' },
      { from: '2026-10-01', to: '2026-10-14' },
    ]);
    expect(view.lastThreeMonths({ from: '2026-10-01', to: '2026-10-14' })[0]).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(view.monthsOf({ from: '2024-01-01', to: '2026-10-14' })).toHaveLength(view.MONTH_LIMIT);
  });

  it('labels periods and months like the mocks', () => {
    expect(view.rangeText({ from: '2026-10-01', to: '2026-10-14' }, 'en')).toBe('1–14 Oct 2026');
    expect(view.rangeText({ from: '2026-08-01', to: '2026-10-14' }, 'en')).toBe(
      '1 Aug – 14 Oct 2026',
    );
    expect(visible(view.periodOptions(TODAY, null, 'en', en))[0]).toEqual({
      value: 'thisMonth',
      label: 'This month · 1–14 Oct 2026',
    });
    expect(visible(view.monthLabel(OCT, TODAY, 'en', en))).toBe('October 2026 · to date');
    expect(visible(view.monthLabel(SEP, TODAY, 'en', en))).toBe('September 2026');
    expect(visible(view.monthLabel(OCT, TODAY, 'ar', ar))).toBe('أكتوبر 2026 · حتى اليوم');
  });

  it('lays out profit and money like the reports overview mock', () => {
    expect(visible(view.profitRows(OCT, 'ILS', en))).toEqual([
      { label: 'Sales income', value: 'ILS 18,450.00' },
      { label: 'Cost of goods sold', value: '− ILS 9,870.00' },
      { label: 'Expenses', value: '− ILS 2,310.00' },
    ]);
    expect(view.money(-203, 'ILS')).toBe('− ILS 203.00');
    expect(visible(view.profitRows({ ...OCT, costOfGoods: 0 }, 'ILS', en))[1].value).toBe(
      'ILS 0.00',
    );
    expect(visible(view.profitRows({ ...OCT, expenses: -40 }, 'ILS', en))[2].value).toBe(
      '+ ILS 40.00',
    );
    const money = view.moneyView(OCT, [AUG, SEP, OCT], 'ILS', 'en');
    expect([money.moneyIn, money.moneyOut, money.net]).toEqual([
      'ILS 15,920.00',
      'ILS 11,640.00',
      '+ ILS 4,280.00',
    ]);
    expect(money.accounts[0]).toEqual({
      name: 'Main cash',
      moneyIn: '7,960.00',
      moneyOut: '5,820.00',
    });
    expect(money.bars.map((b) => [b.label, b.inShare])).toEqual([
      ['Aug', 19800 / 22600],
      ['Sep', 1],
      ['Oct', 15920 / 22600],
    ]);
  });

  it('builds the desktop figures and the month table with its total', () => {
    expect(visible(view.metrics(OCT, 'ILS', en))[0]).toEqual({
      label: 'Profit',
      value: 'ILS 6,270.00',
      hint: 'Income − cost of goods sold − expenses',
      tint: true,
    });
    const rows = visible(view.monthRows([AUG, SEP, OCT], TODAY, 'en', en));
    expect(rows[0].cells).toEqual([
      'August 2026',
      '21,300.00',
      '11,950.00',
      '2,840.00',
      '6,510.00',
      '19,800.00',
      '14,100.00',
    ]);
    expect(rows[3].cells).toEqual([
      'Total',
      '63,900.00',
      '35,240.00',
      '8,200.00',
      '20,460.00',
      '58,320.00',
      '41,640.00',
    ]);
  });

  it('lists profit by month, newest first, under the period total', () => {
    const page = visible(view.profitByMonth([AUG, SEP, OCT], 'ILS', TODAY, 'en', en));
    expect(page.total).toBe('ILS 20,460.00');
    expect(page.totalRows).toEqual([
      { label: 'Sales income', value: 'ILS 63,900.00' },
      { label: 'Cost of goods sold and expenses', value: '− ILS 43,440.00' },
    ]);
    expect(page.months.map((m) => [m.title, m.profit])).toEqual([
      ['October 2026 · to date', 'ILS 6,270.00'],
      ['September 2026', 'ILS 7,680.00'],
      ['August 2026', 'ILS 6,510.00'],
    ]);
  });
});
