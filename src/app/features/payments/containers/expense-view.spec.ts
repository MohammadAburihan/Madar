import { realTranslator } from '../../../../testing/real-translator';
import { ExpenseSummary, expenseRecorded, expenseReview } from './expense-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const EXPENSE: ExpenseSummary = {
  category: 'Fuel & transport',
  amount: 36.5,
  date: '2026-10-11',
  account: 'Main cash',
  project: null,
  hasReceipt: false,
};

describe('expense view', () => {
  it('reviews an expense like the review-expense mock', () => {
    expect(visible(expenseReview(EXPENSE, 'ILS', 'en', en))).toEqual({
      message: 'Pay ILS 36.50 from Main cash for Fuel & transport. No receipt is attached.',
      rows: [
        { label: 'Category', value: 'Fuel & transport' },
        { label: 'Amount', value: 'ILS 36.50' },
        { label: 'Date', value: '11 Oct 2026' },
        { label: 'Account', value: 'Main cash' },
        { label: 'Project', value: 'None' },
        { label: 'Receipt', value: 'Not attached' },
      ],
    });
    const arabic = visible(expenseReview(EXPENSE, 'ILS', 'ar', ar));
    expect(arabic.rows.map((r) => r.label)).toEqual([
      'الفئة',
      'المبلغ',
      'التاريخ',
      'الحساب',
      'المشروع',
      'الإيصال',
    ]);
    expect(arabic.rows[5].value).toBe('غير مرفق');
  });

  it('names the project and the receipt to attach when there are', () => {
    const v = visible(
      expenseReview(
        { ...EXPENSE, project: 'Garden installation', hasReceipt: true },
        'ILS',
        'en',
        en,
      ),
    );
    expect(v.message).toContain('The receipt photo is attached after recording.');
    expect(v.rows.slice(4)).toEqual([
      { label: 'Project', value: 'Garden installation' },
      { label: 'Receipt', value: 'Attached after recording' },
    ]);
  });

  it('reports the recorded expense and how its receipt went, like the expense-recorded mock', () => {
    expect(visible(expenseRecorded('EX-0091', EXPENSE, 'none', 'ILS', 'en', en))).toEqual({
      subtitle: 'EX-0091 · Fuel & transport',
      cardTitle: 'ILS 36.50 expense recorded',
      cardMessage: 'Paid from Main cash on 11 Oct 2026. No receipt was attached.',
      project: 'None',
    });
    expect(
      visible(expenseRecorded('EX-0091', EXPENSE, 'failed', 'ILS', 'en', en)).cardMessage,
    ).toBe("Paid from Main cash on 11 Oct 2026. The receipt couldn't be attached.");
    expect(visible(expenseRecorded('EX-0091', EXPENSE, 'none', 'ILS', 'ar', ar)).cardTitle).toBe(
      'تم تسجيل مصروف بقيمة ILS 36.50',
    );
  });
});
