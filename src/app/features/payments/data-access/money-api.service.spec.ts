import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { MoneyApiService } from './money-api.service';

const PAYMENTS = () => [
  {
    name: 'PAY-0154',
    payment_type: 'Receive',
    party_name: 'Lina Haddad',
    paid_to: 'Cash - RN',
    paid_from: 'Debtors - RN',
    paid_amount: 120,
    docstatus: 1,
    posting_date: '2026-10-11',
    creation: '2026-10-11 09:00:00',
  },
  {
    name: 'PAY-0155',
    payment_type: 'Pay',
    party_name: 'Green Clay',
    paid_to: 'Creditors - RN',
    paid_from: 'Main bank - RN',
    paid_amount: 100,
    docstatus: 0,
    posting_date: '2026-10-12',
    creation: '2026-10-12 09:00:00',
  },
];

describe('MoneyApiService', () => {
  it('lists payments with their account, status and invoices, plus the largest open balances', async () => {
    const { listCalls } = fakeErpnext({
      'Payment Entry': PAYMENTS,
      'Payment Entry Reference': () => [
        { parent: 'PAY-0154', reference_name: 'SI-1042' },
        { parent: 'PAY-0155', reference_name: 'PINV-0068' },
      ],
      Account: () => [
        { name: 'Cash - RN', account_name: 'Main cash' },
        { name: 'Main bank - RN', account_name: 'Main bank' },
      ],
      'Sales Invoice': () => [
        {
          name: 'SI-1042',
          customer_name: 'Lina Haddad',
          grand_total: 320,
          outstanding_amount: 200,
        },
      ],
      'Purchase Invoice': () => [
        {
          name: 'PINV-0068',
          supplier_name: 'Green Clay',
          grand_total: 270,
          outstanding_amount: 170,
        },
      ],
    });
    const api = TestBed.inject(MoneyApiService);

    const overview = await api.overview('Rehan Nursery', null);

    expect(overview.payments).toEqual([
      {
        name: 'PAY-0154',
        direction: 'received',
        party: 'Lina Haddad',
        account: 'Main cash',
        amount: 120,
        status: 'confirmed',
        postingDate: '2026-10-11',
        created: '2026-10-11 09:00:00',
        invoices: ['SI-1042'],
      },
      {
        name: 'PAY-0155',
        direction: 'paid',
        party: 'Green Clay',
        account: 'Main bank',
        amount: 100,
        status: 'draft',
        postingDate: '2026-10-12',
        created: '2026-10-12 09:00:00',
        invoices: ['PINV-0068'],
      },
    ]);
    expect(overview.receivable).toEqual({
      party: 'Lina Haddad',
      invoice: 'SI-1042',
      total: 320,
      outstanding: 200,
    });
    expect(overview.payable).toEqual({
      party: 'Green Clay',
      invoice: 'PINV-0068',
      total: 270,
      outstanding: 170,
    });
    const payments = listCalls.find((c) => c.doctype === 'Payment Entry')!;
    expect(payments.query.filters).toEqual([['company', '=', 'Rehan Nursery']]);
    expect(listCalls.find((c) => c.doctype === 'Payment Entry Reference')!.query.parent).toBe(
      'Payment Entry',
    );
  });

  it('limits a sales role to their own payments and skips supplier bills', async () => {
    const { listCalls } = fakeErpnext({ 'Payment Entry': () => [] });
    const api = TestBed.inject(MoneyApiService);

    const overview = await api.overview('Rehan Nursery', 'lina@rehan.example');

    expect(overview).toEqual({ payments: [], receivable: null, payable: null });
    expect(listCalls.find((c) => c.doctype === 'Payment Entry')!.query.filters).toContainEqual([
      'owner',
      '=',
      'lina@rehan.example',
    ]);
    expect(listCalls.some((c) => c.doctype === 'Purchase Invoice')).toBe(false);
  });

  it('still lists payments when invoices, references or account names are unreadable', async () => {
    const denied = () => throwError(() => new Error('403'));
    fakeErpnext({
      'Payment Entry': PAYMENTS,
      'Payment Entry Reference': denied,
      Account: denied,
      'Sales Invoice': denied,
      'Purchase Invoice': denied,
    });
    const api = TestBed.inject(MoneyApiService);

    const overview = await api.overview('Rehan Nursery', null);

    expect(overview.payments.map((p) => [p.account, p.invoices])).toEqual([
      ['Cash - RN', []],
      ['Main bank - RN', []],
    ]);
    expect(overview.receivable).toBeNull();
    expect(overview.payable).toBeNull();
  });

  it('adds the expenses recorded against the categories, newest first with the payments', async () => {
    const { listCalls } = fakeErpnext({
      'Payment Entry': PAYMENTS,
      'Journal Entry': () => [
        {
          name: 'ACC-JV-0091',
          posting_date: '2026-10-13',
          creation: '2026-10-13 08:00:00',
          docstatus: 1,
        },
        {
          name: 'ACC-JV-0091',
          posting_date: '2026-10-13',
          creation: '2026-10-13 08:00:00',
          docstatus: 1,
        },
      ],
      'Journal Entry Account': () => [
        { parent: 'ACC-JV-0091', account: 'Travel Expenses - RN', debit: 36.5, credit: 0 },
        { parent: 'ACC-JV-0091', account: 'Cash - RN', debit: 0, credit: 36.5 },
      ],
      File: () => [],
      Account: () => [
        { name: 'Travel Expenses - RN', account_name: 'Travel Expenses' },
        { name: 'Cash - RN', account_name: 'Main cash' },
      ],
    });
    const { payments } = await TestBed.inject(MoneyApiService).overview('Rehan Nursery', null, [
      'Travel Expenses - RN',
    ]);
    expect(payments[0]).toEqual({
      name: 'ACC-JV-0091',
      direction: 'expense',
      party: 'Travel Expenses',
      account: 'Main cash',
      amount: 36.5,
      status: 'confirmed',
      postingDate: '2026-10-13',
      created: '2026-10-13 08:00:00',
      invoices: [],
      receipt: false,
    });
    expect(payments.map((p) => p.name)).toEqual(['ACC-JV-0091', 'PAY-0155', 'PAY-0154']);
    expect(listCalls.find((c) => c.doctype === 'Journal Entry')!.query.filters).toContainEqual([
      'Journal Entry Account',
      'account',
      'in',
      ['Travel Expenses - RN'],
    ]);
  });

  it("orders a day's payments and expenses by when they were entered, so a fresh expense isn't buried", async () => {
    fakeErpnext({
      'Payment Entry': () => [
        {
          name: 'PAY-2',
          payment_type: 'Receive',
          party_name: 'A',
          paid_to: 'Cash - RN',
          paid_from: 'Debtors - RN',
          paid_amount: 5,
          docstatus: 1,
          posting_date: '2026-10-16',
          creation: '2026-10-16 09:00:00',
        },
        {
          name: 'PAY-1',
          payment_type: 'Receive',
          party_name: 'B',
          paid_to: 'Cash - RN',
          paid_from: 'Debtors - RN',
          paid_amount: 5,
          docstatus: 1,
          posting_date: '2026-10-16',
          creation: '2026-10-16 08:00:00',
        },
      ],
      'Journal Entry': () => [
        { name: 'JV-1', posting_date: '2026-10-16', creation: '2026-10-16 10:00:00', docstatus: 1 },
      ],
      'Journal Entry Account': () => [
        { parent: 'JV-1', account: 'Travel Expenses - RN', debit: 18.25, credit: 0 },
        { parent: 'JV-1', account: 'Cash - RN', debit: 0, credit: 18.25 },
      ],
    });
    const { payments } = await TestBed.inject(MoneyApiService).overview('Rehan Nursery', null, [
      'Travel Expenses - RN',
    ]);
    expect(payments.map((p) => p.name)).toEqual(['JV-1', 'PAY-2', 'PAY-1']);
  });

  it('leaves expenses out for roles that pass no categories', async () => {
    const { listCalls } = fakeErpnext({ 'Payment Entry': PAYMENTS });
    await TestBed.inject(MoneyApiService).overview('Rehan Nursery', 'lina@rehan.example');
    expect(listCalls.some((c) => c.doctype === 'Journal Entry')).toBe(false);
  });

  it('asks for expenses in batches of categories, so no URL grows past the limit', async () => {
    const { listCalls } = fakeErpnext({ 'Payment Entry': PAYMENTS, 'Journal Entry': () => [] });
    const accounts = Array.from({ length: 70 }, (_, i) => `Expense ${i} - RN`);
    await TestBed.inject(MoneyApiService).overview('Rehan Nursery', null, accounts);
    const sizes = listCalls
      .filter((c) => c.doctype === 'Journal Entry')
      .map(
        (c) =>
          (c.query.filters!.find((f) => f[0] === 'Journal Entry Account')![3] as string[]).length,
      );
    expect(sizes).toEqual([30, 30, 10]);
  });

  it('leaves out entries that only credit an expense account, like Desk reversals', async () => {
    fakeErpnext({
      'Payment Entry': () => [],
      'Journal Entry': () => [{ name: 'ACC-JV-0099', posting_date: '2026-10-13', docstatus: 1 }],
      'Journal Entry Account': () => [
        { parent: 'ACC-JV-0099', account: 'Travel Expenses - RN', debit: 0, credit: 36.5 },
        { parent: 'ACC-JV-0099', account: 'Cash - RN', debit: 36.5, credit: 0 },
      ],
    });
    const { payments } = await TestBed.inject(MoneyApiService).overview('Rehan Nursery', null, [
      'Travel Expenses - RN',
    ]);
    expect(payments).toEqual([]);
  });
});
