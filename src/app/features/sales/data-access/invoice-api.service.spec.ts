import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { InvoiceApiService } from './invoice-api.service';

describe('InvoiceApiService', () => {
  it('loads the invoice with its submitted payments and their accounts', async () => {
    const { listCalls } = fakeErpnext(
      {
        'Payment Entry Reference': () => [
          { parent: 'PAY-0154', allocated_amount: 120 },
          { parent: 'PAY-0156', allocated_amount: 100 },
          { parent: 'PAY-0156', allocated_amount: 20 },
          { parent: 'PAY-0199', allocated_amount: 50 },
        ],
        'Payment Entry': () => [
          { name: 'PAY-0154', paid_to: 'Cash - RN' },
          { name: 'PAY-0156', paid_to: 'Cash - RN' },
        ],
        Account: () => [{ name: 'Cash - RN', account_name: 'Main cash' }],
      },
      {},
      {
        'Sales Invoice/SI-1042': {
          name: 'SI-1042',
          customer: 'Lina Haddad',
          customer_name: 'Lina Haddad',
          posting_date: '2026-10-11',
          docstatus: 1,
          grand_total: 320,
          outstanding_amount: 80,
          update_stock: 1,
        },
      },
    );
    const api = TestBed.inject(InvoiceApiService);

    expect(await api.load('SI-1042')).toEqual({
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
    });
    expect(listCalls[0].query.filters).toContainEqual(['reference_name', '=', 'SI-1042']);
    expect(listCalls.find((c) => c.doctype === 'Payment Entry')!.query.filters).toContainEqual([
      'docstatus',
      '=',
      1,
    ]);
  });

  it('marks drafts and invoices that did not move stock', async () => {
    fakeErpnext(
      {},
      {},
      {
        'Sales Invoice/SI-9': {
          name: 'SI-9',
          customer: 'Samir Nasser',
          customer_name: 'Samir Nasser',
          posting_date: '2026-10-11',
          docstatus: 0,
          grand_total: 50,
          outstanding_amount: 50,
          update_stock: 1,
        },
      },
    );
    const api = TestBed.inject(InvoiceApiService);
    expect(await api.load('SI-9')).toMatchObject({
      status: 'draft',
      delivered: false,
      payments: [],
    });
  });
});
