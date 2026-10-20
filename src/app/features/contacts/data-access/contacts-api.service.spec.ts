import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { ContactsApiService } from './contacts-api.service';

const COMPANY = { name: 'Rehan Nursery', currency: 'ILS' };
const api = () => TestBed.inject(ContactsApiService);

describe('ContactsApiService', () => {
  it('lists customers with what each owes in the company currency', async () => {
    const { listCalls } = fakeErpnext({
      Customer: () => [
        {
          name: 'Lina Haddad',
          customer_name: 'Lina Haddad',
          mobile_no: '059',
          primary_address: 'Ramallah<br>',
        },
      ],
      'Sales Invoice': () => [
        {
          customer: 'Lina Haddad',
          party_account_currency: 'ILS',
          conversion_rate: 1,
          'SUM(`outstanding_amount`)': 80,
        },
        {
          customer: 'Lina Haddad',
          party_account_currency: 'USD',
          conversion_rate: 3.7,
          'SUM(`outstanding_amount`)': 10,
        },
      ],
    });
    expect(await api().customerList('lin', COMPANY, null)).toEqual([
      { id: 'Lina Haddad', name: 'Lina Haddad', phone: '059', city: 'Ramallah', outstanding: 117 },
    ]);
    expect(listCalls[0].query.filters).toContainEqual(['name', '!=', 'Walk-in Customer']);
    expect(listCalls[0].query.filters).toContainEqual(['customer_name', '!=', 'Walk-in Customer']);
  });

  it('shows customers without balances to roles that can’t read invoices', async () => {
    fakeErpnext({
      Customer: () => [{ name: 'L', customer_name: 'L', mobile_no: null, primary_address: null }],
      'Sales Invoice': () => throwError(() => new HttpErrorResponse({ status: 403 })),
    });
    expect((await api().customerList('', COMPANY, null))[0].outstanding).toBeNull();
  });

  it('totals a customer: invoiced, paid after returns, and outstanding', async () => {
    fakeErpnext(
      {
        'Sales Invoice': () => [
          {
            name: 'SI-2',
            posting_date: '2026-10-12',
            status: 'Unpaid',
            is_return: 0,
            base_grand_total: 100,
            outstanding_amount: 100,
            party_account_currency: 'ILS',
          },
          {
            name: 'SI-R',
            posting_date: '2026-10-11',
            status: 'Return',
            is_return: 1,
            base_grand_total: -20,
            outstanding_amount: 0,
            party_account_currency: 'ILS',
          },
          {
            name: 'SI-1',
            posting_date: '2026-10-10',
            status: 'Partly Paid',
            is_return: 0,
            base_grand_total: 320,
            outstanding_amount: 100,
            party_account_currency: 'ILS',
          },
        ],
        'Payment Entry': () => [
          { name: 'PAY-1', posting_date: '2026-10-11', base_paid_amount: 200 },
        ],
      },
      {},
      {
        'Customer/Lina Haddad': {
          name: 'Lina Haddad',
          customer_name: 'Lina Haddad',
          mobile_no: '059',
        },
      },
    );
    const customer = await api().customer('Lina Haddad', COMPANY, null);
    expect(customer.totals).toEqual({ invoiced: 420, paid: 200, outstanding: 200 });
    expect(customer.latest).toMatchObject({ name: 'SI-2', outstanding: 100 });
    expect(customer.recent.map((r) => r.name)).toEqual(['SI-2', 'PAY-1', 'SI-1']);
  });

  it('reads a supplier’s oldest unpaid invoice and open order, and no money for roles without it', async () => {
    const { listCalls } = fakeErpnext(
      {
        'Purchase Invoice': () => [
          {
            name: 'PINV-1',
            base_grand_total: 270,
            outstanding_amount: 170,
            party_account_currency: 'ILS',
          },
        ],
        'Purchase Order': () => [{ name: 'PO-2048' }],
      },
      {},
      {
        'Supplier/Green Clay': { name: 'Green Clay', supplier_name: 'Green Clay' },
        'Purchase Order/PO-2048': {
          items: [{ qty: 10, received_qty: 6, billed_amt: 270, rate: 45 }],
        },
      },
    );
    expect(await api().supplier('Green Clay', COMPANY, true)).toMatchObject({
      outstanding: 170,
      unpaid: { name: 'PINV-1', total: 270, paid: 100, remaining: 170 },
      openOrder: { name: 'PO-2048', ordered: 10, received: 6, billed: 6 },
    });
    const calls = listCalls.length;
    expect((await api().supplier('Green Clay', COMPANY, false)).outstanding).toBeNull();
    expect(listCalls.slice(calls).map((c) => c.doctype)).toEqual(['Purchase Order']);
  });

  it('keeps a salesperson to their own sales and payments for a customer', async () => {
    const { listCalls } = fakeErpnext(
      {},
      {},
      { 'Customer/Lina Haddad': { name: 'Lina Haddad', customer_name: 'Lina Haddad' } },
    );
    await api().customer('Lina Haddad', COMPANY, 'lina@rehan.example');
    for (const doctype of ['Sales Invoice', 'Payment Entry']) {
      expect(listCalls.find((c) => c.doctype === doctype)!.query.filters).toContainEqual([
        'owner',
        '=',
        'lina@rehan.example',
      ]);
    }
  });

  it('gathers a customer’s history newest first, scoped to the owner, with payments’ invoices and accounts', async () => {
    const { listCalls } = fakeErpnext({
      'Sales Invoice': () => [
        {
          name: 'SI-1',
          posting_date: '2026-10-10',
          status: 'Partly Paid',
          is_return: 0,
          base_grand_total: 320,
          outstanding_amount: 200,
          party_account_currency: 'ILS',
        },
      ],
      'Payment Entry': () => [
        {
          name: 'PAY-1',
          posting_date: '2026-10-12',
          base_paid_amount: 120,
          paid_to: 'Cash - RN',
          paid_from: 'Debtors - RN',
        },
      ],
      'Delivery Note': () => [
        {
          name: 'DN-1',
          posting_date: '2026-10-11',
          total_qty: 2,
          set_warehouse: 'Main - RN',
          is_return: 0,
        },
      ],
      'Payment Entry Reference': () => [
        { parent: 'PAY-1', reference_name: 'SI-1' },
        { parent: 'PAY-1', reference_name: 'SI-1' },
      ],
      Account: () => [{ name: 'Cash - RN', account_name: 'Main cash' }],
      Warehouse: () => [{ name: 'Main - RN', warehouse_name: 'Main warehouse' }],
    });
    const history = await api().history(
      'customers',
      'Lina Haddad',
      COMPANY,
      'lina@rehan.example',
      true,
    );
    expect(history.map((e) => [e.kind, e.name])).toEqual([
      ['payment', 'PAY-1'],
      ['delivery', 'DN-1'],
      ['invoice', 'SI-1'],
    ]);
    expect(history[0]).toMatchObject({ place: 'Main cash', invoices: ['SI-1'] });
    expect(history[1]).toMatchObject({ place: 'Main warehouse', qty: 2 });
    expect(listCalls.find((c) => c.doctype === 'Sales Invoice')!.query.filters).toContainEqual([
      'owner',
      '=',
      'lina@rehan.example',
    ]);
  });

  it('shows a supplier’s receipts only, without money, to roles that can’t see costs', async () => {
    const { listCalls } = fakeErpnext({
      'Purchase Receipt': () => [
        {
          name: 'PR-1',
          posting_date: '2026-10-11',
          total_qty: 6,
          set_warehouse: null,
          is_return: 0,
        },
      ],
    });
    const history = await api().history('suppliers', 'Green Clay', COMPANY, null, false);
    expect(history.map((e) => e.kind)).toEqual(['delivery']);
    expect(listCalls.map((c) => c.doctype)).toEqual(['Purchase Receipt']);
  });

  it('still shows the deliveries when invoices and payments can’t be read', async () => {
    fakeErpnext({
      'Sales Invoice': () => throwError(() => new HttpErrorResponse({ status: 403 })),
      'Payment Entry': () => throwError(() => new HttpErrorResponse({ status: 403 })),
      'Delivery Note': () => [
        {
          name: 'DN-1',
          posting_date: '2026-10-11',
          total_qty: 2,
          set_warehouse: null,
          is_return: 0,
        },
      ],
    });
    const history = await api().history('customers', 'Lina Haddad', COMPANY, null, true);
    expect(history.map((e) => e.name)).toEqual(['DN-1']);
  });

  it('fails the history on a lost connection rather than showing it empty', async () => {
    fakeErpnext({
      'Sales Invoice': () => throwError(() => new HttpErrorResponse({ status: 0 })),
    });
    await expect(
      api().history('customers', 'Lina Haddad', COMPANY, null, true),
    ).rejects.toBeTruthy();
  });

  it('takes credit notes off what an invoice shows as paid', async () => {
    fakeErpnext({
      'Sales Invoice': () => [
        {
          name: 'SI-1',
          posting_date: '2026-10-10',
          status: 'Paid',
          is_return: 0,
          base_grand_total: 100,
          outstanding_amount: 0,
          party_account_currency: 'ILS',
        },
        {
          name: 'SI-R',
          posting_date: '2026-10-11',
          status: 'Return',
          is_return: 1,
          base_grand_total: -30,
          outstanding_amount: 0,
          return_against: 'SI-1',
          update_outstanding_for_self: 0,
          party_account_currency: 'ILS',
        },
      ],
    });
    const history = await api().history('customers', 'Lina Haddad', COMPANY, null, true);
    expect(history.find((e) => e.name === 'SI-1')!.credited).toBe(30);
  });

  it("deactivates and reactivates through ERPNext's Disabled flag", async () => {
    const { postCalls } = fakeErpnext({}, { 'frappe.client.set_value': () => ({}) });
    await api().setActive('customers', 'Lina Haddad', false);
    await api().setActive('suppliers', 'Green Clay', true);
    expect(postCalls.map((c) => c.body)).toEqual([
      { doctype: 'Customer', name: 'Lina Haddad', fieldname: { disabled: 1 } },
      { doctype: 'Supplier', name: 'Green Clay', fieldname: { disabled: 0 } },
    ]);
  });

  it('lists inactive contacts apart, and reads whether one is active', async () => {
    const { listCalls } = fakeErpnext(
      { Customer: () => [], Supplier: () => [] },
      {},
      { 'Supplier/Green Clay': { name: 'Green Clay', supplier_name: 'Green Clay', disabled: 1 } },
    );
    await api().customerList('', COMPANY, null, false);
    await api().supplierList('', COMPANY, false, false);
    expect(listCalls.map((c) => c.query.filters?.[0])).toEqual([
      ['disabled', '=', 1],
      ['disabled', '=', 1],
    ]);
    expect((await api().supplier('Green Clay', COMPANY, false)).active).toBe(false);
  });
});
