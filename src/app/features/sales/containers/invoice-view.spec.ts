import { realTranslator } from '../../../../testing/real-translator';
import { InvoiceDetail } from '../data-access/invoice-api.service';
import { canContinueSale, invoiceView } from './invoice-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const INVOICE: InvoiceDetail = {
  name: 'SI-1042',
  customer: 'Lina Haddad',
  customerName: 'Lina Haddad',
  postingDate: '2026-10-11',
  status: 'confirmed',
  company: 'Rehan Nursery',
  owner: 'rehan@example.com',
  saleReference: null,
  quickSale: true,
  total: 320,
  outstanding: 80,
  delivered: true,
  opening: false,
  returnable: true,
  credited: 0,
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

  it('marks an opening balance invoice as one, in both languages', () => {
    const opening = { ...INVOICE, opening: true, delivered: false };
    expect(visible(invoiceView(opening, null, 'ILS', 'en', en)).chips.map((c) => c.label)).toEqual([
      'Invoice: Confirmed',
      'Payment: Partially paid',
      'Opening balance',
    ]);
    expect(
      visible(invoiceView(opening, null, 'ILS', 'ar', ar)).chips.map((c) => c.label),
    ).toContain('الرصيد الافتتاحي');
    expect(invoiceView(INVOICE, null, 'ILS', 'en', en).chips.map((c) => c.label)).not.toContain(
      'Opening balance',
    );
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
      visible(
        invoiceView(
          {
            ...INVOICE,
            outstanding: 0,
            payments: [{ name: 'PAY-1', amount: 320, account: 'Main cash' }],
          },
          null,
          'ILS',
          'en',
          en,
        ),
      ).chips[1],
    ).toEqual({ label: 'Payment: Paid', tone: 'tint' });
    // A return took 30 off an unpaid 320: still unpaid, nothing received.
    const unpaid = visible(
      invoiceView(
        { ...INVOICE, outstanding: 290, credited: 30, payments: [] },
        null,
        'ILS',
        'en',
        en,
      ),
    );
    expect(unpaid.chips[1]).toEqual({ label: 'Payment: Unpaid', tone: 'danger' });
    expect(unpaid.totals[1].value).toBe('ILS 0.00');
    // Paid in full, then a return the business still owes back: paid, not settled by a credit.
    const refundDue = visible(
      invoiceView(
        {
          ...INVOICE,
          outstanding: -80,
          credited: 80,
          payments: [{ name: 'P', amount: 320, account: 'Cash' }],
        },
        null,
        'ILS',
        'en',
        en,
      ),
    );
    expect(refundDue.chips[1].label).toBe('Payment: Paid');
  });

  it('counts only payments as paid, and shows what returns credited', () => {
    // 240 paid, then a return credited the last 80: settled, but not all by money.
    const view = visible(
      invoiceView({ ...INVOICE, outstanding: 0, credited: 80 }, null, 'ILS', 'en', en),
    );
    expect(view.chips[1]).toEqual({ label: 'Payment: Credit note issued', tone: 'tint' });
    expect(view.totals.map((r) => [r.label, r.value])).toEqual([
      ['Invoice total', 'ILS 320.00'],
      ['Amount paid', 'ILS 240.00'],
      ['Credited by credit notes', 'ILS 80.00'],
      ['Outstanding', 'ILS 0.00'],
    ]);
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

describe('canContinueSale', () => {
  const DRAFT: InvoiceDetail = {
    ...INVOICE,
    status: 'draft',
    saleReference: 'SALE-0A1B2C3',
    owner: 'lina@example.com',
  };
  const scope = { sell: true, company: 'Rehan Nursery', owner: null };

  it('offers a quick-sale draft of this business to a role that sells', () => {
    expect(canContinueSale(DRAFT, scope)).toBe(true);
  });

  it.each([
    ['confirmed', { ...DRAFT, status: 'confirmed' as const }, scope],
    ['not made by Madar', { ...DRAFT, saleReference: null }, scope],
    ['a credit note or an invoice that moves no stock', { ...DRAFT, quickSale: false }, scope],
    ['another business', DRAFT, { ...scope, company: 'Other Co' }],
    ['for a role that cannot sell', DRAFT, { ...scope, sell: false }],
    [
      "a colleague's, for a role limited to its own sales",
      DRAFT,
      { ...scope, owner: 'sami@example.com' },
    ],
  ])('does not offer a draft that is %s', (_label, invoice, where) => {
    expect(canContinueSale(invoice, where)).toBe(false);
  });

  it('offers the own draft to a role limited to its own sales', () => {
    expect(canContinueSale(DRAFT, { ...scope, owner: 'lina@example.com' })).toBe(true);
  });
});
