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
});
