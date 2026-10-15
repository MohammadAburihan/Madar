import { realTranslator } from '../../../../testing/real-translator';
import { PaymentRecord } from '../data-access/money-api.service';
import { balanceCard, matches, paymentCard, paymentRow } from './money-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const PAYMENT: PaymentRecord = {
  name: 'PAY-0154',
  direction: 'received',
  party: 'Lina Haddad',
  account: 'Main cash',
  amount: 120,
  status: 'confirmed',
  postingDate: '2026-10-11',
  invoices: ['SI-1042'],
};

describe('money view', () => {
  it('finds payments by number, party, account or invoice', () => {
    expect(matches(PAYMENT, '')).toBe(true);
    expect(matches(PAYMENT, 'lina')).toBe(true);
    expect(matches(PAYMENT, 'si-1042')).toBe(true);
    expect(matches(PAYMENT, 'main cash')).toBe(true);
    expect(matches(PAYMENT, 'green')).toBe(false);
  });

  it('builds the mobile cards and desktop rows like the mocks', () => {
    expect(visible(paymentCard(PAYMENT, 'ILS', en))).toEqual({
      title: 'PAY-0154 · Received ILS 120.00',
      message: 'Lina Haddad · Main cash\nAllocated to SI-1042',
    });
    expect(
      visible(
        paymentCard(
          { ...PAYMENT, direction: 'paid', party: 'Green Clay', invoices: [] },
          'ILS',
          en,
        ),
      ),
    ).toEqual({
      title: 'PAY-0154 · Paid ILS 120.00',
      message: 'Green Clay · Main cash\nNot allocated to an invoice',
    });
    expect(visible(paymentCard(PAYMENT, 'ILS', ar)).title).toBe('PAY-0154 · تم استلام ILS 120.00');
    expect(visible(paymentRow(PAYMENT, 'ILS', en))).toEqual({
      id: 'PAY-0154',
      cells: ['PAY-0154 · Lina Haddad', 'Main cash', 'ILS 120.00', 'Confirmed'],
    });
    expect(visible(paymentRow({ ...PAYMENT, status: 'draft' }, 'ILS', ar)).cells[3]).toBe('مسودة');
  });

  it('builds the outstanding cards for both sides', () => {
    const open = { party: 'Lina Haddad', invoice: 'SI-1042', total: 320, outstanding: 200 };
    expect(visible(balanceCard(open, 'customer', 'ILS', en))).toEqual({
      title: 'Lina Haddad · ILS 200.00 due',
      message: 'SI-1042 · 320.00 invoiced · 120.00 received',
    });
    expect(
      visible(
        balanceCard(
          { party: 'Green Clay', invoice: 'PINV-0068', total: 270, outstanding: 170 },
          'supplier',
          'ILS',
          en,
        ),
      ),
    ).toEqual({
      title: 'Green Clay · ILS 170.00 due',
      message: 'PINV-0068 · 270.00 billed · 100.00 paid',
    });
  });

  it('shows an expense like the payments-and-expenses mock', () => {
    const expense: PaymentRecord = {
      name: 'EX-0091',
      direction: 'expense',
      party: 'Fuel & transport',
      account: 'Main cash',
      amount: 36.5,
      status: 'confirmed',
      postingDate: '2026-10-11',
      invoices: [],
      receipt: false,
    };
    expect(visible(paymentCard(expense, 'ILS', en))).toEqual({
      title: 'EX-0091 · Expense ILS 36.50',
      message: 'Fuel & transport · Main cash\nReceipt not attached',
    });
    expect(visible(paymentCard({ ...expense, receipt: true }, 'ILS', ar)).message).toBe(
      'Fuel & transport · Main cash\nالإيصال مرفق',
    );
  });
});
