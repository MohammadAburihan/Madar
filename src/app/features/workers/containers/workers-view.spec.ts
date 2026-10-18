import { realTranslator } from '../../../../testing/real-translator';
import { WorkerDetail, WorkerRow } from '../data-access/workers.models';
import {
  todayLabel,
  workerCard,
  workerLines,
  workerRow,
  workerSubtitle,
  workerView,
} from './workers-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const ROW: WorkerRow = {
  id: 'HR-EMP-00003',
  name: 'Khaled Omar',
  designation: 'Gardener',
  department: 'Field team',
  phone: '059-000-0177',
  status: 'Active',
  today: { marked: true, status: 'Present' },
};

const DETAIL: WorkerDetail = {
  ...ROW,
  joined: '2025-03-03',
  relieved: null,
  presentThisMonth: 14,
  leaveLeft: 9,
  advanceToRepay: 300,
  pay: { start: '2026-10-01', draft: true, gross: 4200, net: 3900, currency: 'ILS' },
  hoursLastWeek: null,
  recent: [
    { date: '2026-10-17', status: 'Present' },
    { date: '2026-10-16', status: 'Half Day' },
  ],
};

describe('workers view', () => {
  it('shows the list card and table row like the mocks', () => {
    expect(visible(workerCard(ROW, 'en', en))).toEqual({
      id: 'HR-EMP-00003',
      title: 'Khaled Omar',
      meta: 'Gardener · Field team',
      balance: 'Present today',
    });
    const onLeave = {
      ...ROW,
      today: { marked: true, status: 'On Leave', until: '2026-10-20' },
    } as const;
    expect(visible(workerCard(onLeave, 'en', en)).balance).toBe('On leave until 20 Oct 2026');
    expect(visible(workerRow(ROW, 'en', en))).toEqual(['Khaled Omar', 'Gardener', 'Present']);
    expect(visible(workerRow({ ...ROW, today: { marked: false } }, 'en', en))[2]).toBe(
      'Not marked',
    );
  });

  it("says a worker who isn't active is so, and drops today when it can't be read", () => {
    expect(todayLabel({ status: 'Suspended', today: null }, 'en', en)).toBe('Suspended');
    expect(visible(workerRow({ ...ROW, status: 'Left', today: null }, 'en', en))).toEqual([
      'Khaled Omar',
      'Gardener',
      'Left',
    ]);
    expect(workerRow({ ...ROW, today: null }, 'en', en)).toEqual(['Khaled Omar', 'Gardener']);
    expect(
      workerCard({ ...ROW, today: null, designation: null, department: null }, 'en', en),
    ).toMatchObject({ meta: null, balance: null });
  });

  it('shows the detail lines, totals and pay card like the mock', () => {
    expect(visible(workerSubtitle(DETAIL, en))).toBe('Gardener · HR-EMP-00003');
    expect(workerSubtitle({ ...DETAIL, designation: null }, en)).toBe('HR-EMP-00003');
    expect(visible(workerLines(DETAIL, 'en', en))).toBe(
      '059-000-0177\nField team · Joined 3 Mar 2025',
    );
    expect(
      visible(workerLines({ ...DETAIL, status: 'Left', relieved: '2026-06-30' }, 'en', en)),
    ).toBe('059-000-0177\nField team · Joined 3 Mar 2025\nLeft on 30 Jun 2026');
    const view = visible(workerView(DETAIL, 'ILS', 'en', en));
    expect(view.totals).toEqual([
      { label: 'Present this month', value: '14 days' },
      { label: 'Leave left', value: '9 days' },
      { label: 'Advance to repay', value: 'ILS 300.00' },
    ]);
    expect(view.pay).toEqual({
      title: 'October pay · Draft',
      message: 'Gross ILS 4,200.00 · Net ILS 3,900.00',
    });
    expect(view.card).toEqual({
      title: '9 days leave left',
      message: '14 days present this month · ILS 300.00 advance to repay',
    });
    expect(view.recent).toEqual(['17 Oct 2026 · Present', '16 Oct 2026 · Half day']);
  });

  it('adds the hours of the last seven days when there are any', () => {
    expect(
      visible(workerView({ ...DETAIL, hoursLastWeek: 12.5 }, 'ILS', 'en', en)).totals.at(-1),
    ).toEqual({
      label: 'Hours in the last 7 days',
      value: '12.5',
    });
    expect(workerView({ ...DETAIL, hoursLastWeek: 0 }, 'ILS', 'en', en).totals).toHaveLength(3);
  });

  it('leaves out what the role may not read, and nothing owed', () => {
    const view = visible(
      workerView(
        { ...DETAIL, presentThisMonth: 1.5, leaveLeft: null, advanceToRepay: 0, pay: null },
        'ILS',
        'en',
        en,
      ),
    );
    expect(view.totals).toEqual([{ label: 'Present this month', value: '1.5 days' }]);
    expect(view.pay).toBeNull();
    expect(view.card).toEqual({ title: '1.5 days present this month', message: '' });
    const none = workerView(
      { ...DETAIL, presentThisMonth: null, leaveLeft: null, advanceToRepay: null, pay: null },
      'ILS',
      'en',
      en,
    );
    expect(none.totals).toEqual([]);
    expect(none.card).toBeNull();
    expect(visible(workerView({ ...DETAIL, leaveLeft: 1 }, 'ILS', 'en', en)).totals[1].value).toBe(
      '1 day',
    );
  });

  it('uses the Arabic wording and plural forms', () => {
    expect(visible(workerCard(ROW, 'ar', ar)).balance).toBe('حاضر اليوم');
    const onLeave = {
      ...ROW,
      today: { marked: true, status: 'On Leave', until: '2026-10-20' },
    } as const;
    expect(visible(workerCard(onLeave, 'ar', ar)).balance).toBe('في إجازة حتى 20 أكتوبر 2026');
    expect(visible(workerLines(DETAIL, 'ar', ar))).toBe(
      '059-000-0177\nField team · انضم في 3 مارس 2025',
    );
    const view = visible(workerView(DETAIL, 'ILS', 'ar', ar));
    expect(view.totals.map((r) => r.value)).toEqual(['14 يوماً', '9 أيام', 'ILS 300.00']);
    expect(view.card?.title).toBe('9 أيام إجازة متبقية');
    expect(view.pay?.title).toBe('راتب أكتوبر · مسودة');
    expect(visible(workerView({ ...DETAIL, leaveLeft: 2 }, 'ILS', 'ar', ar)).totals[1].value).toBe(
      'يومان',
    );
  });
});
