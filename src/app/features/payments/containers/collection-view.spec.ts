import { realTranslator } from '../../../../testing/real-translator';
import { CustomerOption } from '../../../core/customers/customer-directory.service';
import { UnpaidInvoice } from '../data-access/collection.models';
import * as view from './collection-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const LINA: CustomerOption = {
  id: 'Lina Haddad',
  name: 'Lina Haddad',
  phone: '059-000-0142',
  city: 'Ramallah',
  outstanding: 200,
  unpaidInvoices: 1,
};
const SI_1042: UnpaidInvoice = {
  name: 'SI-1042',
  postingDate: '2026-10-11',
  dueDate: '2026-11-10',
  total: 320,
  outstanding: 200,
};
const TODAY = new Date(2026, 9, 14);

describe('collection view', () => {
  it('describes the customer like the mock', () => {
    expect(visible(view.customerCard(LINA, 'ILS', en))).toEqual({
      title: 'Lina Haddad',
      meta: 'Customer · 059-000-0142 · Ramallah',
      balance: '1 invoice with ILS 200.00 outstanding',
    });
    expect(
      visible(view.customerCard({ ...LINA, unpaidInvoices: 3, outstanding: 900 }, 'ILS', en))
        .balance,
    ).toBe('3 invoices with ILS 900.00 outstanding');
    expect(
      visible(
        view.customerCard({ ...LINA, phone: null, city: null, unpaidInvoices: 0 }, 'ILS', en),
      ),
    ).toMatchObject({ meta: 'Customer', balance: 'No unpaid invoices' });
    expect(visible(view.customerCard(LINA, 'ILS', ar))).toEqual({
      title: 'Lina Haddad',
      meta: 'عميل · 059-000-0142 · Ramallah',
      balance: 'فاتورة واحدة يتبقى منها ILS 200.00',
    });
    expect(visible(view.customerCard({ ...LINA, unpaidInvoices: 2 }, 'ILS', ar)).balance).toBe(
      'فاتورتان يتبقى منهما ILS 200.00',
    );
  });

  it('labels an invoice partially paid, unpaid or overdue', () => {
    expect(visible(view.invoiceCard(SI_1042, 'ILS', TODAY, 'en', en))).toEqual({
      title: 'SI-1042 · 11 Oct 2026',
      detail: 'Partially paid · ILS 200.00 due',
    });
    expect(
      visible(view.invoiceCard({ ...SI_1042, outstanding: 320 }, 'ILS', TODAY, 'en', en)).detail,
    ).toBe('Unpaid · ILS 320.00 due');
    expect(
      visible(view.invoiceCard({ ...SI_1042, dueDate: '2026-10-13' }, 'ILS', TODAY, 'en', en))
        .detail,
    ).toBe('Overdue · ILS 200.00 due');
    expect(visible(view.invoiceCard(SI_1042, 'ILS', TODAY, 'ar', ar))).toEqual({
      title: 'SI-1042 · 11 أكتوبر 2026',
      detail: 'مدفوع جزئياً · المتبقي ILS 200.00',
    });
  });

  it('shows what is due before and after the payment', () => {
    expect(visible(view.dueRows(200, 120, 1, 'ILS', en))).toEqual([
      { label: 'Invoice due before', value: 'ILS 200.00' },
      { label: 'Receive now', value: 'ILS 120.00' },
      { label: 'Due after save', value: 'ILS 80.00', accent: true },
    ]);
    expect(visible(view.dueRows(250, NaN, 2, 'ILS', en))[0].label).toBe('Invoices due before');
    expect(visible(view.dueRows(250, NaN, 2, 'ILS', en))[1].value).toBe('ILS 0.00');
    expect(visible(view.dueRows(200, 999, 1, 'ILS', en))[2].value).toBe('ILS 0.00');
  });

  it('lists allocations', () => {
    expect(
      visible(
        view.allocationText(
          [
            { invoice: 'SI-1', amount: 50 },
            { invoice: 'SI-2', amount: 70 },
          ],
          'ILS',
          en,
        ),
      ),
    ).toBe('SI-1 · ILS 50.00 + SI-2 · ILS 70.00');
  });

  it('explains the invoice balance after payment', () => {
    expect(
      visible(view.balanceCard([SI_1042], [{ invoice: 'SI-1042', amount: 120 }], 'ILS', en)),
    ).toEqual({
      title: 'Invoice balance after payment',
      message:
        'Invoice ILS 320.00 · Previously paid ILS 120.00. This payment adds ILS 120.00; paid total becomes ILS 240.00 and ILS 80.00 remains due.',
    });
    expect(
      visible(view.balanceCard([SI_1042], [{ invoice: 'SI-1042', amount: 200 }], 'ILS', en))
        .message,
    ).toBe(
      'Invoice ILS 320.00 · Previously paid ILS 120.00. This payment adds ILS 200.00 and settles the invoice.',
    );
    const other = { ...SI_1042, name: 'SI-1043', outstanding: 100 };
    expect(
      visible(
        view.balanceCard(
          [SI_1042, other],
          [
            { invoice: 'SI-1042', amount: 200 },
            { invoice: 'SI-1043', amount: 50 },
          ],
          'ILS',
          en,
        ),
      ),
    ).toEqual({
      title: 'Invoice balances after payment',
      message:
        'This payment adds ILS 250.00 across 2 invoices, oldest first; ILS 50.00 remains due.',
    });
    expect(
      visible(view.balanceCard([SI_1042], [{ invoice: 'SI-1042', amount: 120 }], 'ILS', ar)).title,
    ).toBe('رصيد الفاتورة بعد الدفع');
  });

  it('summarises the recorded collection', () => {
    const one = {
      payment: 'PAY-0156',
      postingDate: '2026-10-14',
      amount: 120,
      invoices: [{ invoice: 'SI-1042', allocated: 120, total: 320, paid: 240, outstanding: 80 }],
    };
    expect(visible(view.recordedView(one, 'ILS', en))).toEqual({
      card: {
        title: 'ILS 120.00 collected',
        message:
          'Allocated to SI-1042. Paid total is now ILS 240.00; ILS 80.00 remains outstanding.',
      },
      totals: [
        { label: 'Invoice total', value: 'ILS 320.00' },
        { label: 'Amount paid', value: 'ILS 240.00' },
        { label: 'Outstanding', value: 'ILS 80.00' },
      ],
    });
    expect(
      visible(
        view.recordedView(
          { ...one, invoices: [{ ...one.invoices[0], paid: 320, outstanding: 0 }] },
          'ILS',
          en,
        ),
      ).card.message,
    ).toBe('Allocated to SI-1042. The invoice is now fully paid.');
    const many = {
      ...one,
      invoices: [
        { invoice: 'SI-1', allocated: 50, total: 100, paid: 100, outstanding: 0 },
        { invoice: 'SI-2', allocated: 70, total: 320, paid: 190, outstanding: 130 },
      ],
    };
    expect(visible(view.recordedView(many, 'ILS', en)).card.message).toBe(
      'Allocated to SI-1, SI-2. ILS 130.00 remains outstanding on them.',
    );
    expect(visible(view.recordedView(one, 'ILS', ar)).card.title).toBe('تم تحصيل ILS 120.00');
  });
});
