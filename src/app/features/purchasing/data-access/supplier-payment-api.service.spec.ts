import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { SupplierPaymentRequest } from './purchase.models';
import { SupplierPaymentApiService } from './supplier-payment-api.service';

const GET_ENTRY = 'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry';

const request = (overrides: Partial<SupplierPaymentRequest> = {}): SupplierPaymentRequest => ({
  reference: 'PAYS-ABC1234',
  invoice: 'PINV-0068',
  amount: 100,
  account: { mode: 'Bank Draft', account: 'Main bank - RN', label: 'Main bank' },
  ...overrides,
});

const TEMPLATE = {
  doctype: 'Payment Entry',
  __islocal: 1,
  payment_type: 'Pay',
  party_type: 'Supplier',
  party: 'Green Clay',
  paid_to: 'Creditors - RN',
  posting_date: '2026-10-15',
  paid_amount: 270,
  references: [
    {
      reference_doctype: 'Purchase Invoice',
      reference_name: 'PINV-0068',
      outstanding_amount: 270,
      allocated_amount: 270,
    },
  ],
};

const POSTED = {
  name: 'PAY-0155',
  docstatus: 1,
  party_name: 'Green Clay',
  paid_from: 'Main bank - RN',
  paid_amount: 100,
  references: [{ reference_name: 'PINV-0068', allocated_amount: 100 }],
};

const api = () => TestBed.inject(SupplierPaymentApiService);

describe('SupplierPaymentApiService', () => {
  it("lists the supplier's unpaid invoices in the company currency", async () => {
    const { listCalls } = fakeErpnext({
      'Purchase Invoice': () => [
        {
          name: 'PINV-0068',
          bill_no: 'GC-8831',
          grand_total: 269.6,
          rounded_total: 270,
          outstanding_amount: 270,
        },
      ],
    });
    expect(await api().unpaidInvoices('Green Clay', 'Rehan Nursery', 'ILS')).toEqual([
      { name: 'PINV-0068', billNo: 'GC-8831', total: 270, outstanding: 270 },
    ]);
    expect(listCalls[0].query.filters).toEqual([
      ['supplier', '=', 'Green Clay'],
      ['company', '=', 'Rehan Nursery'],
      ['currency', '=', 'ILS'],
      ['docstatus', '=', 1],
      ['outstanding_amount', '>', 0],
    ]);
  });

  it('pays from the chosen account, allocated to the invoice, with the Madar reference', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        [GET_ENTRY]: () => TEMPLATE,
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'PAY-0155' }),
        'frappe.client.submit': () => POSTED,
      },
    );
    const inserted: string[] = [];
    expect(await api().confirm(request(), null, (name) => inserted.push(name))).toBe('PAY-0155');
    expect(inserted).toEqual(['PAY-0155']);
    expect(postCalls[0].body).toEqual({
      dt: 'Purchase Invoice',
      dn: 'PINV-0068',
      bank_account: 'Main bank - RN',
    });
    expect(postCalls[1].body['doc']).toMatchObject({
      payment_type: 'Pay',
      mode_of_payment: 'Bank Draft',
      paid_from: 'Main bank - RN',
      paid_amount: 100,
      received_amount: 100,
      reference_no: 'PAYS-ABC1234',
      reference_date: '2026-10-15',
      deductions: [],
      references: [{ reference_name: 'PINV-0068', allocated_amount: 100 }],
    });
  });

  it('submits a remembered draft with the new amounts, keeping its identity', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { [GET_ENTRY]: () => TEMPLATE, 'frappe.client.submit': () => POSTED },
      { 'Payment Entry/PAY-0155': { ...POSTED, docstatus: 0, paid_amount: 50, modified: 'm1' } },
    );
    expect(await api().confirm(request(), 'PAY-0155')).toBe('PAY-0155');
    expect(postCalls.map((c) => c.method)).toEqual([GET_ENTRY, 'frappe.client.submit']);
    const doc = postCalls[1].body['doc'] as Record<string, unknown>;
    expect(doc).toMatchObject({ name: 'PAY-0155', modified: 'm1', paid_amount: 100, docstatus: 0 });
    expect(doc['__islocal']).toBeUndefined();
  });

  it('reports a remembered draft a slow attempt already posted, without paying again', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { [GET_ENTRY]: () => TEMPLATE },
      { 'Payment Entry/PAY-0155': POSTED },
    );
    expect(await api().confirm(request(), 'PAY-0155')).toBe('PAY-0155');
    expect(postCalls.map((c) => c.method)).toEqual([GET_ENTRY]);
  });

  it("won't report an earlier payment of another amount as this one's result", async () => {
    fakeErpnext({}, { [GET_ENTRY]: () => TEMPLATE }, { 'Payment Entry/PAY-0155': POSTED });
    await expect(api().confirm(request({ amount: 120 }), 'PAY-0155')).rejects.toBeInstanceOf(
      PostedEarlierError,
    );
  });

  it('turns a timeout while submitting into an unresolved result', async () => {
    fakeErpnext(
      {},
      {
        [GET_ENTRY]: () => TEMPLATE,
        'frappe.client.insert': () => ({ name: 'PAY-0155' }),
        'frappe.client.submit': () => throwError(() => new HttpErrorResponse({ status: 504 })),
      },
    );
    await expect(api().confirm(request(), null)).rejects.toBeInstanceOf(UnresolvedError);
  });

  it('saves a draft, then saves over it', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        [GET_ENTRY]: () => TEMPLATE,
        'frappe.client.insert': () => ({ name: 'PAY-0155' }),
        'frappe.client.save': (body) => body['doc'],
      },
      { 'Payment Entry/PAY-0155': { ...POSTED, docstatus: 0 } },
    );
    expect(await api().saveDraft(request(), null)).toBe('PAY-0155');
    expect(await api().saveDraft(request({ amount: 80 }), 'PAY-0155')).toBe('PAY-0155');
    expect(postCalls.map((c) => c.method)).toEqual([
      GET_ENTRY,
      'frappe.client.insert',
      GET_ENTRY,
      'frappe.client.save',
    ]);
    expect(postCalls[3].body['doc']).toMatchObject({ name: 'PAY-0155', paid_amount: 80 });
  });

  it('finds a payment or its draft by the Madar reference', async () => {
    let rows: unknown[] = [];
    const { listCalls } = fakeErpnext({ 'Payment Entry': () => rows });
    expect(await api().find('PAYS-ABC1234')).toBe('not-found');
    expect(listCalls[0].query.filters).toContainEqual(['reference_no', '=', 'PAYS-ABC1234']);
    rows = [{ name: 'PAY-0155', docstatus: 0 }];
    expect(await api().find('PAYS-ABC1234')).toEqual({ draft: 'PAY-0155' });
    rows = [{ name: 'PAY-0155', docstatus: 1 }];
    expect(await api().find('PAYS-ABC1234')).toEqual({ payment: 'PAY-0155' });
  });

  it('reads a payment with its account name and each invoice once', async () => {
    fakeErpnext(
      { Account: () => [{ account_name: 'Main bank' }] },
      {},
      {
        'Payment Entry/PAY-0155': {
          ...POSTED,
          references: [
            { reference_name: 'PINV-0068', allocated_amount: 60 },
            { reference_name: 'PINV-0068', allocated_amount: 40 },
          ],
        },
      },
    );
    expect(await api().payment('PAY-0155')).toEqual({
      name: 'PAY-0155',
      docstatus: 1,
      supplierName: 'Green Clay',
      amount: 100,
      paidFrom: 'Main bank',
      invoices: [{ invoice: 'PINV-0068', allocated: 100 }],
    });
  });
});
