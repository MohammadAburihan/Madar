import { realTranslator } from '../../../../testing/real-translator';
import { InvoiceDetail } from '../data-access/invoice-api.service';
import { invoiceView } from './invoice-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const INVOICE: InvoiceDetail = {
  name: 'SI-1042',
  customer: 'Lina Haddad',
  customerName: 'Lina Haddad',
  postingDate: '2026-10-11',
  status: 'confirmed',
  total: 320,
  outstanding: 80,
  delivered: true,
  payments: [
    { name: 'PAY-0154', amount: 120, account: 'Main cash' },
    { name: 'PAY-0156', amount: 120, account: 'Main cash' },
  ],
};

describe('invoice view', () => {
  it('shows the invoice after a collection like the mock', () => {
    expect(visible(invoiceView(INVOICE, 'PAY-0156', 'ILS', 'en', en))).toEqual({
      title: 'Sales invoice SI-1042',
      subtitle: 'Lina Haddad · After PAY-0156',
      chips: [
        { label: 'Invoice: Confirmed', tone: 'tint' },
        { label: 'Payment: Partially paid', tone: 'warning' },
        { label: 'Goods: Delivered', tone: 'tint' },
      ],
      totals: [
        { label: 'Invoice total', value: 'ILS 320.00' },
        { label: 'Amount paid', value: 'ILS 240.00' },
        { label: 'Outstanding', value: 'ILS 80.00' },
      ],
      payments: {
        title: 'Two linked payments',
        message: 'PAY-0154 · ILS 120.00\nPAY-0156 · ILS 120.00\nBoth received in Main cash.',
      },
    });
  });

  it('uses the posting date without a payment, and covers one, many and no payments', () => {
    const one = { ...INVOICE, payments: INVOICE.payments.slice(0, 1) };
    const view = visible(invoiceView(one, null, 'ILS', 'en', en));
    expect(view.subtitle).toBe('Lina Haddad · 11 Oct 2026');
    expect(view.payments).toEqual({
      title: 'One linked payment',
      message: 'PAY-0154 · ILS 120.00\nReceived in Main cash.',
    });
    const three = {
      ...INVOICE,
      payments: [...INVOICE.payments, { name: 'PAY-0160', amount: 10, account: 'Main cash' }],
    };
    expect(visible(invoiceView(three, null, 'ILS', 'en', en)).payments.title).toBe(
      '3 linked payments',
    );
    expect(visible(invoiceView(three, null, 'ILS', 'en', en)).payments.message).toContain(
      'All received in Main cash.',
    );
    const mixed = {
      ...INVOICE,
      payments: [INVOICE.payments[0], { name: 'PAY-0157', amount: 5, account: 'Main bank' }],
    };
    expect(visible(invoiceView(mixed, null, 'ILS', 'en', en)).payments.message).toBe(
      'PAY-0154 · ILS 120.00\nPAY-0157 · ILS 5.00',
    );
    const none = visible(
      invoiceView({ ...INVOICE, outstanding: 320, payments: [] }, null, 'ILS', 'en', en),
    );
    expect(none.payments).toEqual({ title: 'No payments yet', message: '' });
    expect(none.chips[1]).toEqual({ label: 'Payment: Unpaid', tone: 'danger' });
  });

  it('marks drafts and cancelled invoices without a payment chip', () => {
    const draft = visible(
      invoiceView({ ...INVOICE, status: 'draft', delivered: false }, null, 'ILS', 'en', en),
    );
    expect(draft.chips).toEqual([{ label: 'Invoice: Draft', tone: 'tint' }]);
    const cancelled = visible(
      invoiceView({ ...INVOICE, status: 'cancelled', delivered: false }, null, 'ILS', 'en', en),
    );
    expect(cancelled.chips).toEqual([{ label: 'Invoice: Cancelled', tone: 'danger' }]);
    expect(
      visible(invoiceView({ ...INVOICE, outstanding: 0 }, null, 'ILS', 'en', en)).chips[1],
    ).toEqual({ label: 'Payment: Paid', tone: 'tint' });
  });

  it('uses the Arabic wording and dual form', () => {
    const view = visible(invoiceView(INVOICE, 'PAY-0156', 'ILS', 'ar', ar));
    expect(view.title).toBe('فاتورة البيع SI-1042');
    expect(view.subtitle).toBe('Lina Haddad · بعد PAY-0156');
    expect(view.payments.title).toBe('دفعتان مرتبطتان');
    expect(view.payments.message).toContain('تم استلامهما في Main cash.');
    expect(view.chips[1].label).toBe('الدفع: مدفوع جزئياً');
  });
});
