import { realTranslator } from '../../../../testing/real-translator';
import { PayRow } from '../data-access/workers.models';
import { monthLabel, payActions, payCard } from './pay-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');
const ROWS: PayRow[] = [
  {
    id: 'E1',
    name: 'Khaled Omar',
    active: true,
    hasSalary: true,
    slip: { name: 'S1', confirmed: false, gross: 4200, net: 3900 },
  },
  { id: 'E2', name: 'Rana Saleh', active: true, hasSalary: true, slip: null },
  { id: 'E3', name: 'Yousef Darwish', active: true, hasSalary: false, slip: null },
  {
    id: 'E4',
    name: 'Huda Ali',
    active: true,
    hasSalary: true,
    slip: { name: 'S4', confirmed: true, gross: 3600, net: 3600 },
  },
];

describe('pay view', () => {
  it('shows each worker’s month like the mock', () => {
    expect(ROWS.map((r) => visible(payCard(r, 'ILS', en)))).toEqual([
      {
        id: 'E1',
        title: 'Khaled Omar',
        meta: 'Gross ILS 4,200.00 · Net ILS 3,900.00',
        balance: 'Draft slip',
      },
      { id: 'E2', title: 'Rana Saleh', meta: 'No slip yet', balance: null },
      {
        id: 'E3',
        title: 'Yousef Darwish',
        meta: 'No salary set',
        balance: 'Set a salary to make a slip',
      },
      {
        id: 'E4',
        title: 'Huda Ali',
        meta: 'Gross ILS 3,600.00 · Net ILS 3,600.00',
        balance: 'Confirmed',
      },
    ]);
  });

  it('leaves workers no longer active out of the slips to make', () => {
    const left = { id: 'E7', name: 'Old Worker', active: false, hasSalary: true, slip: null };
    expect(visible(payCard(left, 'ILS', en))).toMatchObject({
      meta: 'Inactive: no slip can be made',
      balance: null,
    });
    expect(payActions([left], en).toMake).toBe(0);
  });

  it('counts the slips to make and to confirm, in both languages', () => {
    expect(visible(payActions(ROWS, en))).toEqual({
      toMake: 1,
      drafts: 1,
      make: 'Create 1 salary slip',
      confirm: 'Confirm 1 draft slip',
    });
    const two = [...ROWS, { ...ROWS[1], id: 'E5' }, { ...ROWS[0], id: 'E6' }];
    expect(visible(payActions(two, ar))).toMatchObject({
      make: 'إنشاء قسيمتين',
      confirm: 'تأكيد قسيمتين مسودتين',
    });
    expect(monthLabel('2026-10-01', 'en')).toBe('October 2026');
    expect(monthLabel('2026-10-01', 'ar')).toBe('أكتوبر 2026');
  });
});
