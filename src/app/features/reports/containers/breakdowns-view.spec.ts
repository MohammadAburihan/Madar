import { realTranslator } from '../../../../testing/real-translator';
import { Breakdown } from '../data-access/breakdowns-api.service';
import { breakdownCard, breakdownSummary } from './breakdowns-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');
const row = (label: string, amount: number, qty: number | null = null) => ({
  key: label,
  label,
  amount,
  qty,
});
const of = (...rows: ReturnType<typeof row>[]): Breakdown => ({
  rows,
  total: rows.reduce((s, r) => s + r.amount, 0),
});

describe('breakdowns view', () => {
  it('shows the top five lines, then the rest as one "Other" line', () => {
    const data = of(
      row('A', 600),
      row('B', 500),
      row('C', 400),
      row('D', 300),
      row('E', 200),
      row('F', 100),
      row('G', 50),
    );
    const card = breakdownCard('customers', data, 'ILS', en);
    expect(card.heading).toBe('Sales by customer · ILS 2,150.00');
    expect(card.rows).toHaveLength(6);
    expect(visible(card.rows[5])).toEqual({ label: 'Other (2)', value: 'ILS 150.00' });
  });

  it('names the quantity sold for items', () => {
    const card = breakdownCard('items', of(row('Olive tree', 1360, 16)), 'ILS', en);
    expect(visible(card.rows)).toEqual([{ label: 'Olive tree · 16 sold', value: 'ILS 1,360.00' }]);
    expect(
      visible(breakdownCard('items', of(row('Olive tree', 1360, 16)), 'ILS', ar).rows[0].label),
    ).toBe('Olive tree · بيع 16');
  });

  it('says when a period has nothing', () => {
    expect(breakdownCard('suppliers', of(), 'ILS', en).rows).toEqual([
      { label: 'Nothing in this period.', value: '', text: true },
    ]);
  });

  it('sums the period up, with pay and attendance only where they could be read', () => {
    const sales = of(row('A', 4280));
    const summary = breakdownSummary(
      sales,
      of(row('S', 1280)),
      of(row('W', 9640)),
      null,
      'ILS',
      en,
    );
    expect(summary).toEqual({
      label: 'Sales for the period',
      amount: 'ILS 4,280.00',
      rows: [
        { label: 'Purchases', value: 'ILS 1,280.00' },
        { label: 'Stock value today', value: 'ILS 9,640.00' },
      ],
    });
    const withPeople = breakdownSummary(
      sales,
      of(),
      of(),
      { gross: 7800, net: 7600, slips: 2, daysPresent: 41.5 },
      'ILS',
      ar,
    );
    expect(withPeople.rows.slice(2)).toEqual([
      { label: 'صافي الرواتب المؤكدة', value: 'ILS 7,600.00' },
      { label: 'أيام الحضور', value: '41.5' },
    ]);
  });
});
