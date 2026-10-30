import { realTranslator } from '../../../../testing/real-translator';
import {
  openingBlockNotice,
  openingRecorded,
  openingReview,
  openingSubtitle,
} from './opening-balance-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const CUSTOMER = {
  kind: 'customers' as const,
  name: 'Lina Haddad',
  amount: 250.5,
  date: '2026-01-03',
  note: 'Old garden job',
};
const SUPPLIER = { ...CUSTOMER, kind: 'suppliers' as const, name: 'Green Clay', note: '  ' };

describe('opening balance view', () => {
  it('words the subtitle by who owes whom', () => {
    expect(visible(openingSubtitle('customers', 'Lina Haddad', en))).toBe(
      'Lina Haddad · They owe us',
    );
    expect(visible(openingSubtitle('suppliers', 'Green Clay', en))).toBe(
      'Green Clay · We owe them',
    );
    expect(visible(openingSubtitle('suppliers', 'Green Clay', ar))).toContain('مستحق علينا');
  });

  it('reviews a customer balance as money owed to the business, not a sale', () => {
    expect(visible(openingReview(CUSTOMER, 'ILS', 'en', en))).toEqual({
      title: 'Lina Haddad owes you ILS 250.50',
      message:
        'An opening invoice for ILS 250.50 dated 3 Jan 2026 is added to what Lina Haddad owes you. It is not a sale.',
      rows: [
        { label: 'Type', value: 'They owe us' },
        { label: 'Amount', value: 'ILS 250.50' },
        { label: 'Date', value: '3 Jan 2026' },
        { label: 'Note', value: 'Old garden job' },
      ],
    });
  });

  it('reviews a supplier balance as money owed by the business, with no note as None', () => {
    const view = visible(openingReview(SUPPLIER, 'ILS', 'en', en));
    expect(view.title).toBe('You owe Green Clay ILS 250.50');
    expect(view.message).toContain('It is not an expense.');
    expect(view.rows[0]).toEqual({ label: 'Type', value: 'We owe them' });
    expect(view.rows[3]).toEqual({ label: 'Note', value: 'None' });
  });

  it('reviews in Arabic with the same rows', () => {
    const view = visible(openingReview(CUSTOMER, 'ILS', 'ar', ar));
    expect(view.rows.map((r) => r.label)).toEqual(['النوع', 'المبلغ', 'التاريخ', 'ملاحظة']);
    expect(view.rows[0].value).toBe('مستحق لنا');
    expect(view.message).toContain('ليست بيعاً');
  });

  it('shows the recorded invoice and the total ERPNext posted', () => {
    expect(visible(openingRecorded('ACC-SINV-1', 250.5, CUSTOMER, 'ILS', 'en', en))).toEqual({
      subtitle: 'ACC-SINV-1 · Lina Haddad',
      title: 'ILS 250.50 opening balance recorded',
      message:
        'Invoice ACC-SINV-1 is dated 3 Jan 2026. It now counts in what Lina Haddad owes you.',
    });
    expect(visible(openingRecorded('ACC-PINV-1', 10, SUPPLIER, 'ILS', 'en', en)).message).toContain(
      'what you owe Green Clay',
    );
  });

  it("shows ERPNext's posted total, so any rounding is visible", () => {
    const view = visible(
      openingRecorded('ACC-SINV-1', 251, { ...CUSTOMER, amount: 250.6 }, 'ILS', 'en', en),
    );
    expect(view.title).toBe('ILS 251.00 opening balance recorded');
  });

  it('explains each reason an opening balance is blocked, in both languages', () => {
    for (const block of ['disabled', 'currency', 'setup', 'missing', 'walkIn'] as const) {
      expect(openingBlockNotice(block, en).title).not.toMatch(/contacts\.opening/);
      expect(openingBlockNotice(block, ar).message).not.toMatch(/contacts\.opening/);
    }
    expect(openingBlockNotice('disabled', en).title).toBe('This contact is inactive');
  });
});
