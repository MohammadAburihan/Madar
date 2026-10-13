import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { CollectionApiService } from './collection-api.service';
import { CollectionRequest } from './collection.models';

const CASH = { mode: 'Cash', account: 'Cash - RN', label: 'Cash', isBank: false };

const request = (overrides: Partial<CollectionRequest> = {}): CollectionRequest => ({
  reference: 'COLL-ABC1234',
  company: 'Rehan Nursery',
  customer: 'Lina Haddad',
  account: CASH,
  amount: 120,
  allocations: [
    { invoice: 'SI-1', amount: 50 },
    { invoice: 'SI-2', amount: 70 },
  ],
  ...overrides,
});

const template = (body: Record<string, unknown>) => ({
  __islocal: 1,
  __unsaved: 1,
  doctype: 'Payment Entry',
  name: null,
  posting_date: '2026-10-14',
  party: 'Lina Haddad',
  paid_from: 'Debtors - RN',
  references: [
    {
      reference_doctype: 'Sales Invoice',
      reference_name: body['dn'],
      total_amount: 320,
      outstanding_amount: 200,
    },
  ],
});

const submitted = {
  name: 'PAY-1',
  docstatus: 1,
  posting_date: '2026-10-14',
  paid_amount: 120,
  references: [
    { reference_name: 'SI-1', allocated_amount: 50 },
    { reference_name: 'SI-2', allocated_amount: 70 },
  ],
};

const invoiceRows = () => [
  { name: 'SI-1', grand_total: 100, outstanding_amount: 0 },
  { name: 'SI-2', grand_total: 320, outstanding_amount: 130 },
];

const GET_PAYMENT_ENTRY = 'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry';

describe('CollectionApiService', () => {
  it("lists the customer's submitted invoices with a balance, oldest first", async () => {
    const { listCalls } = fakeErpnext({
      'Sales Invoice': () => [
        {
          name: 'SI-1',
          posting_date: '2026-10-01',
          due_date: '2026-10-31',
          grand_total: 320,
          outstanding_amount: 200,
          debit_to: 'Debtors - RN',
        },
      ],
    });
    const api = TestBed.inject(CollectionApiService);

    expect(await api.unpaidInvoices('Lina Haddad', 'Rehan Nursery', 'ILS')).toEqual([
      {
        name: 'SI-1',
        postingDate: '2026-10-01',
        dueDate: '2026-10-31',
        total: 320,
        outstanding: 200,
        receivable: 'Debtors - RN',
      },
    ]);
    expect(listCalls[0].query.filters).toEqual([
      ['customer', '=', 'Lina Haddad'],
      ['company', '=', 'Rehan Nursery'],
      ['currency', '=', 'ILS'],
      ['docstatus', '=', 1],
      ['outstanding_amount', '>', 0],
    ]);
    expect(listCalls[0].query.orderBy).toBe('posting_date asc');
  });

  it('inserts one payment allocated across the invoices, then submits it', async () => {
    const { postCalls } = fakeErpnext(
      { 'Sales Invoice': invoiceRows },
      {
        [GET_PAYMENT_ENTRY]: template,
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'PAY-1' }),
        'frappe.client.submit': () => submitted,
      },
    );
    const api = TestBed.inject(CollectionApiService);
    const inserted: string[] = [];

    const result = await api.confirm(request(), null, (name) => inserted.push(name));

    expect(
      postCalls.filter((c) => c.method === GET_PAYMENT_ENTRY).map((c) => c.body['dn']),
    ).toEqual(['SI-1', 'SI-2']);
    const doc = postCalls.find((c) => c.method === 'frappe.client.insert')!.body['doc'] as Record<
      string,
      unknown
    > & { references: Record<string, unknown>[] };
    expect(doc).toMatchObject({
      mode_of_payment: 'Cash',
      paid_to: 'Cash - RN',
      paid_amount: 120,
      received_amount: 120,
      reference_no: 'COLL-ABC1234',
      reference_date: '2026-10-14',
      remarks: 'Madar collection COLL-ABC1234',
    });
    expect(doc.references).toEqual([
      expect.objectContaining({ reference_name: 'SI-1', allocated_amount: 50, total_amount: 320 }),
      expect.objectContaining({ reference_name: 'SI-2', allocated_amount: 70 }),
    ]);
    expect(inserted).toEqual(['PAY-1']);
    expect(result).toEqual({
      payment: 'PAY-1',
      postingDate: '2026-10-14',
      amount: 120,
      invoices: [
        { invoice: 'SI-1', allocated: 50, total: 100, paid: 100, outstanding: 0 },
        { invoice: 'SI-2', allocated: 70, total: 320, paid: 190, outstanding: 130 },
      ],
    });
  });

  it('spreads an invoice over its payment-term rows without exceeding any of them', async () => {
    const { postCalls } = fakeErpnext(
      { 'Sales Invoice': () => [{ name: 'SI-1', grand_total: 200, outstanding_amount: 50 }] },
      {
        [GET_PAYMENT_ENTRY]: (body) => ({
          ...template(body),
          references: [
            {
              reference_name: 'SI-1',
              payment_term: '50% now',
              outstanding_amount: 200,
              payment_term_outstanding: 100,
            },
            {
              reference_name: 'SI-1',
              payment_term: '50% later',
              outstanding_amount: 200,
              payment_term_outstanding: 100,
            },
          ],
        }),
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'PAY-1' }),
        'frappe.client.submit': () => ({
          ...submitted,
          paid_amount: 150,
          references: [
            { reference_name: 'SI-1', allocated_amount: 100 },
            { reference_name: 'SI-1', allocated_amount: 50 },
          ],
        }),
      },
    );
    const api = TestBed.inject(CollectionApiService);

    const result = await api.confirm(
      request({ amount: 150, allocations: [{ invoice: 'SI-1', amount: 150 }] }),
      null,
    );

    const doc = postCalls.find((c) => c.method === 'frappe.client.insert')!.body['doc'] as {
      references: Record<string, unknown>[];
    };
    expect(doc.references.map((r) => [r['payment_term'], r['allocated_amount']])).toEqual([
      ['50% now', 100],
      ['50% later', 50],
    ]);
    expect(result.invoices).toEqual([
      { invoice: 'SI-1', allocated: 150, total: 200, paid: 150, outstanding: 50 },
    ]);
  });

  it('deletes an abandoned draft', async () => {
    const { postCalls } = fakeErpnext({}, { 'frappe.client.delete': () => null });
    await TestBed.inject(CollectionApiService).discard('PAY-9');
    expect(postCalls).toEqual([
      { method: 'frappe.client.delete', body: { doctype: 'Payment Entry', name: 'PAY-9' } },
    ]);
  });

  it('submits a leftover draft as itself, never inserting a copy', async () => {
    const { postCalls, docCalls } = fakeErpnext(
      { 'Sales Invoice': invoiceRows },
      { [GET_PAYMENT_ENTRY]: template, 'frappe.client.submit': () => submitted },
      { 'Payment Entry/PAY-7': { name: 'PAY-7', modified: '2026-10-14 10:00:00', docstatus: 0 } },
    );
    const api = TestBed.inject(CollectionApiService);

    await api.confirm(request(), 'PAY-7');

    expect(docCalls).toEqual(['Payment Entry/PAY-7']);
    expect(postCalls.some((c) => c.method === 'frappe.client.insert')).toBe(false);
    const doc = postCalls.find((c) => c.method === 'frappe.client.submit')!.body['doc'] as Record<
      string,
      unknown
    >;
    expect(doc).toMatchObject({
      name: 'PAY-7',
      modified: '2026-10-14 10:00:00',
      docstatus: 0,
      paid_amount: 120,
    });
    expect(doc['__islocal']).toBeUndefined();
    expect(doc['__unsaved']).toBeUndefined();
  });

  it('reports a gateway timeout or lost connection on submit as unresolved', async () => {
    for (const status of [504, 0]) {
      TestBed.resetTestingModule();
      fakeErpnext(
        {},
        {
          [GET_PAYMENT_ENTRY]: template,
          'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'PAY-1' }),
          'frappe.client.submit': () => throwError(() => new HttpErrorResponse({ status })),
        },
      );
      const api = TestBed.inject(CollectionApiService);
      await expect(api.confirm(request(), null)).rejects.toBeInstanceOf(UnresolvedError);
    }
  });

  it('reports a failure before anything is sent as definite, not unresolved', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { [GET_PAYMENT_ENTRY]: () => throwError(() => new HttpErrorResponse({ status: 0 })) },
    );
    const api = TestBed.inject(CollectionApiService);
    const error = await api.confirm(request(), null).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(UnresolvedError);
    expect(postCalls.some((c) => c.method === 'frappe.client.insert')).toBe(false);
  });

  it('uses the rounded total that ERPNext computes the balance from', async () => {
    fakeErpnext({
      'Sales Invoice': () => [
        {
          name: 'SI-1',
          posting_date: '2026-10-01',
          due_date: null,
          grand_total: 99.5,
          rounded_total: 100,
          outstanding_amount: 100,
          debit_to: 'Debtors - RN',
        },
      ],
    });
    const [invoice] = await TestBed.inject(CollectionApiService).unpaidInvoices(
      'Lina Haddad',
      'Rehan Nursery',
      'ILS',
    );
    expect(invoice.total).toBe(100);
  });

  it('passes definite rejections through', async () => {
    fakeErpnext(
      {},
      {
        [GET_PAYMENT_ENTRY]: template,
        'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 417 })),
      },
    );
    const api = TestBed.inject(CollectionApiService);
    await expect(api.confirm(request(), null)).rejects.not.toBeInstanceOf(UnresolvedError);
  });

  describe('find', () => {
    it('reports a payment that never reached ERPNext', async () => {
      const { listCalls } = fakeErpnext();
      const api = TestBed.inject(CollectionApiService);
      expect(await api.find('COLL-ABC1234')).toBe('not-found');
      expect(listCalls[0].query.filters).toContainEqual(['reference_no', '=', 'COLL-ABC1234']);
      expect(listCalls[0].query.orderBy).toBe('docstatus desc');
    });

    it('returns a leftover draft', async () => {
      fakeErpnext({ 'Payment Entry': () => [{ name: 'PAY-7', docstatus: 0 }] });
      const api = TestBed.inject(CollectionApiService);
      expect(await api.find('COLL-ABC1234')).toEqual({ draft: 'PAY-7' });
    });

    it('returns the submitted payment with each invoice as it stands now', async () => {
      fakeErpnext(
        {
          'Payment Entry': () => [{ name: 'PAY-1', docstatus: 1 }],
          'Sales Invoice': invoiceRows,
        },
        {},
        { 'Payment Entry/PAY-1': submitted },
      );
      const api = TestBed.inject(CollectionApiService);
      expect(await api.find('COLL-ABC1234')).toMatchObject({
        payment: 'PAY-1',
        invoices: [
          { invoice: 'SI-1', paid: 100, outstanding: 0 },
          { invoice: 'SI-2', paid: 190, outstanding: 130 },
        ],
      });
    });
  });
});
