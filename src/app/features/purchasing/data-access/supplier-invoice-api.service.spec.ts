import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { InvoiceRequest, paymentStatus } from './purchase.models';
import { BillingChangedError, SupplierInvoiceApiService } from './supplier-invoice-api.service';

const MAKE = 'erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice';

const request = (overrides: Partial<InvoiceRequest> = {}): InvoiceRequest => ({
  reference: 'BILL-ABC1234',
  order: 'PO-2048',
  billNo: 'GC-8831',
  receipts: ['MAT-PRE-1', 'MAT-PRE-2'],
  total: 450,
  ...overrides,
});

/** make_purchase_invoice: each call adds one receipt's unbilled row to the document it is given. */
const mapper = (body: Record<string, unknown>) => {
  const before = body['target_doc'] ? JSON.parse(body['target_doc'] as string) : null;
  const receipt = body['source_name'] as string;
  const items = [
    ...(before?.items ?? []),
    {
      item_code: 'POT-30',
      item_name: 'Ceramic planter',
      uom: 'Unit',
      qty: receipt === 'MAT-PRE-1' ? 6 : 4,
      rate: 45,
      purchase_order: 'PO-2048',
      purchase_receipt: receipt,
    },
  ];
  return {
    doctype: 'Purchase Invoice',
    __islocal: 1,
    supplier: 'Green Clay',
    currency: 'ILS',
    items,
    grand_total: items.reduce((sum, i) => sum + i.qty * i.rate, 0),
  };
};

const POSTED = {
  name: 'PINV-0068',
  docstatus: 1,
  supplier: 'Green Clay',
  supplier_name: 'Green Clay',
  bill_no: 'GC-8831',
  currency: 'ILS',
  grand_total: 450,
  outstanding_amount: 450,
  items: [
    { item_code: 'POT-30', purchase_order: 'PO-2048', purchase_receipt: 'MAT-PRE-1' },
    { item_code: 'POT-30', purchase_order: 'PO-2048', purchase_receipt: 'MAT-PRE-2' },
  ],
};

const api = () => TestBed.inject(SupplierInvoiceApiService);

describe('paymentStatus', () => {
  it('reads unpaid, partly paid and paid from the outstanding amount', () => {
    expect(paymentStatus({ total: 270, outstanding: 270 })).toBe('unpaid');
    expect(paymentStatus({ total: 270, outstanding: 170 })).toBe('partlyPaid');
    expect(paymentStatus({ total: 270, outstanding: 0 })).toBe('paid');
  });
});

describe('SupplierInvoiceApiService', () => {
  it("previews the order's unbilled receipts as ERPNext would bill them", async () => {
    const { listCalls } = fakeErpnext(
      {
        'Purchase Receipt': () => [
          { name: 'MAT-PRE-1' },
          { name: 'MAT-PRE-2' },
          { name: 'MAT-PRE-2' },
        ],
      },
      { [MAKE]: mapper },
    );
    const preview = await api().preview('PO-2048');
    expect(preview).toEqual({
      receipts: ['MAT-PRE-1', 'MAT-PRE-2'],
      lines: [
        { code: 'POT-30', name: 'Ceramic planter', uom: 'Unit', qty: 6, rate: 45 },
        { code: 'POT-30', name: 'Ceramic planter', uom: 'Unit', qty: 4, rate: 45 },
      ],
      currency: 'ILS',
      total: 450,
      blocked: null,
    });
    expect(listCalls[0].query.filters).toEqual([
      ['Purchase Receipt Item', 'purchase_order', '=', 'PO-2048'],
      ['docstatus', '=', 1],
      ['is_return', '=', 0],
      ['per_billed', '<', 100],
    ]);
  });

  it('skips a receipt ERPNext finds fully billed and bills the next one', async () => {
    fakeErpnext(
      { 'Purchase Receipt': () => [{ name: 'MAT-PRE-0' }, { name: 'MAT-PRE-1' }] },
      {
        [MAKE]: (body) =>
          body['source_name'] === 'MAT-PRE-0'
            ? throwError(() => new HttpErrorResponse({ status: 417 }))
            : mapper(body),
      },
    );
    const preview = await api().preview('PO-2048');
    expect(preview.receipts).toEqual(['MAT-PRE-1']);
    expect(preview.lines.map((l) => l.qty)).toEqual([6]);
  });

  it('has nothing to preview when ERPNext finds every receipt billed', async () => {
    fakeErpnext(
      { 'Purchase Receipt': () => [{ name: 'MAT-PRE-0' }] },
      { [MAKE]: () => throwError(() => new HttpErrorResponse({ status: 417 })) },
    );
    expect(await api().preview('PO-2048')).toEqual({
      receipts: [],
      lines: [],
      currency: '',
      total: 0,
      blocked: null,
    });
  });

  it('sends a receipt shared with another order to ERPNext, without its other rows', async () => {
    fakeErpnext(
      { 'Purchase Receipt': () => [{ name: 'MAT-PRE-1' }] },
      {
        [MAKE]: (body) => {
          const doc = mapper(body);
          return {
            ...doc,
            items: [
              ...doc.items,
              { ...doc.items[0], qty: 3, purchase_order: 'PO-9999' },
              { ...doc.items[0], qty: 1, purchase_order: null },
            ],
          };
        },
      },
    );
    const preview = await api().preview('PO-2048');
    expect(preview.lines.map((l) => l.qty)).toEqual([6]);
    expect(preview.blocked).toBe('sharedReceipt');
  });

  it('sends several receipts with fixed charges to ERPNext, which would keep only the last ones', async () => {
    fakeErpnext(
      { 'Purchase Receipt': () => [{ name: 'MAT-PRE-1' }, { name: 'MAT-PRE-2' }] },
      { [MAKE]: (body) => ({ ...mapper(body), taxes: [{ charge_type: 'Actual' }] }) },
    );
    expect((await api().preview('PO-2048')).blocked).toBe('charges');
  });

  it('bills one receipt with its fixed charges', async () => {
    fakeErpnext(
      { 'Purchase Receipt': () => [{ name: 'MAT-PRE-1' }] },
      { [MAKE]: (body) => ({ ...mapper(body), taxes: [{ charge_type: 'Actual' }] }) },
    );
    expect((await api().preview('PO-2048')).blocked).toBeNull();
  });

  it("uses the rounded total ERPNext bases what's owed on", async () => {
    fakeErpnext(
      { 'Purchase Receipt': () => [{ name: 'MAT-PRE-1' }] },
      { [MAKE]: (body) => ({ ...mapper(body), grand_total: 269.6, rounded_total: 270 }) },
    );
    expect((await api().preview('PO-2048')).total).toBe(270);
  });

  it('refuses to post when what is left to bill changed since it was shown', async () => {
    const { postCalls } = fakeErpnext({}, { [MAKE]: mapper });
    await expect(api().record(request({ total: 500 }), null)).rejects.toBeInstanceOf(
      BillingChangedError,
    );
    expect(postCalls.map((c) => c.method)).not.toContain('frappe.client.insert');
  });

  it('refuses to post when every receipt was billed meanwhile', async () => {
    fakeErpnext({}, { [MAKE]: () => throwError(() => new HttpErrorResponse({ status: 417 })) });
    await expect(api().record(request(), null)).rejects.toBeInstanceOf(BillingChangedError);
  });

  it("doesn't hide a real failure while building the invoice", async () => {
    fakeErpnext(
      { 'Purchase Receipt': () => [{ name: 'MAT-PRE-1' }] },
      { [MAKE]: () => throwError(() => new HttpErrorResponse({ status: 0 })) },
    );
    await expect(api().preview('PO-2048')).rejects.toBeTruthy();
  });

  it('has nothing to preview when every receipt is billed', async () => {
    const { postCalls } = fakeErpnext({ 'Purchase Receipt': () => [] });
    expect((await api().preview('PO-2048')).lines).toEqual([]);
    expect(postCalls).toEqual([]);
  });

  it("records the invoice with the supplier's number and the Madar reference", async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        [MAKE]: mapper,
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'PINV-0068' }),
        'frappe.client.submit': () => POSTED,
      },
    );
    const inserted: string[] = [];
    expect(await api().record(request(), null, (name) => inserted.push(name))).toBe('PINV-0068');
    expect(inserted).toEqual(['PINV-0068']);
    expect(postCalls.map((c) => c.method)).toEqual([
      MAKE,
      MAKE,
      'frappe.client.insert',
      'frappe.client.submit',
    ]);
    expect(postCalls[1].body['target_doc']).toEqual(expect.any(String));
    expect(postCalls[2].body['doc']).toMatchObject({
      bill_no: 'GC-8831',
      remarks: 'Madar bill BILL-ABC1234',
      grand_total: 450,
    });
  });

  it('submits a remembered draft that still bills what was confirmed, with the latest number', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.submit': () => ({ name: 'PINV-0068' }) },
      { 'Purchase Invoice/PINV-0068': { ...POSTED, docstatus: 0, bill_no: 'GC-OLD' } },
    );
    expect(await api().record(request(), 'PINV-0068')).toBe('PINV-0068');
    // Accounts User can't delete invoices: the draft is submitted, never deleted and rebuilt.
    expect(postCalls.map((c) => c.method)).toEqual(['frappe.client.submit']);
    expect(postCalls[0].body['doc']).toMatchObject({ name: 'PINV-0068', bill_no: 'GC-8831' });
  });

  it("won't submit a remembered draft that no longer bills what was confirmed", async () => {
    const { postCalls } = fakeErpnext(
      {},
      {},
      { 'Purchase Invoice/PINV-0068': { ...POSTED, docstatus: 0, grand_total: 500 } },
    );
    await expect(api().record(request(), 'PINV-0068')).rejects.toBeInstanceOf(BillingChangedError);
    expect(postCalls).toEqual([]);
  });

  it('refuses to post when one of the shown receipts was billed meanwhile', async () => {
    fakeErpnext(
      {},
      {
        [MAKE]: (body) =>
          body['source_name'] === 'MAT-PRE-2'
            ? throwError(() => new HttpErrorResponse({ status: 417 }))
            : mapper(body),
      },
    );
    await expect(api().record(request({ total: 270 }), null)).rejects.toBeInstanceOf(
      BillingChangedError,
    );
  });

  it('reports a remembered draft a slow attempt already posted, without posting again', async () => {
    const { postCalls } = fakeErpnext({}, {}, { 'Purchase Invoice/PINV-0068': POSTED });
    expect(await api().record(request(), 'PINV-0068')).toBe('PINV-0068');
    expect(postCalls).toEqual([]);
  });

  it("won't report an earlier invoice with another number as this one's result", async () => {
    fakeErpnext({}, {}, { 'Purchase Invoice/PINV-0068': POSTED });
    await expect(api().record(request({ billNo: 'GC-9000' }), 'PINV-0068')).rejects.toBeInstanceOf(
      PostedEarlierError,
    );
  });

  it('turns a timeout while submitting into an unresolved result', async () => {
    fakeErpnext(
      {},
      {
        [MAKE]: mapper,
        'frappe.client.insert': () => ({ name: 'PINV-0068' }),
        'frappe.client.submit': () => throwError(() => new HttpErrorResponse({ status: 504 })),
      },
    );
    await expect(api().record(request(), null)).rejects.toBeInstanceOf(UnresolvedError);
  });

  it('finds an invoice or its draft by the Madar reference', async () => {
    let rows: unknown[] = [];
    const { listCalls } = fakeErpnext({ 'Purchase Invoice': () => rows });
    expect(await api().find('BILL-ABC1234')).toBe('not-found');
    expect(listCalls[0].query.filters).toContainEqual(['remarks', 'like', '%BILL-ABC1234%']);
    rows = [{ name: 'PINV-0068', docstatus: 0 }];
    expect(await api().find('BILL-ABC1234')).toEqual({ draft: 'PINV-0068' });
    rows = [{ name: 'PINV-0068', docstatus: 1 }];
    expect(await api().find('BILL-ABC1234')).toEqual({ invoice: 'PINV-0068' });
  });

  it('reads an invoice with its order and the payments made against it', async () => {
    fakeErpnext(
      {
        'Payment Entry': () => [{ name: 'PAY-0155', paid_from: 'Main bank - RN', allocated: 100 }],
        Account: () => [{ name: 'Main bank - RN', account_name: 'Main bank' }],
      },
      {},
      {
        'Purchase Invoice/PINV-0068': {
          ...POSTED,
          grand_total: 269.6,
          rounded_total: 270,
          outstanding_amount: 170,
        },
      },
    );
    expect(await api().invoice('PINV-0068')).toEqual({
      name: 'PINV-0068',
      billNo: 'GC-8831',
      supplier: 'Green Clay',
      supplierName: 'Green Clay',
      order: 'PO-2048',
      currency: 'ILS',
      total: 270,
      outstanding: 170,
      submitted: true,
      cancelled: false,
      payments: [{ name: 'PAY-0155', amount: 100, account: 'Main bank' }],
    });
  });

  it("reads a draft invoice as not submitted, so it isn't offered for payment", async () => {
    fakeErpnext({}, {}, { 'Purchase Invoice/PINV-0068': { ...POSTED, docstatus: 0 } });
    expect((await api().invoice('PINV-0068')).submitted).toBe(false);
  });

  it("lists an order's invoices once each, though ERPNext returns a row per billed line", async () => {
    const row = {
      name: 'PINV-0068',
      bill_no: 'GC-8831',
      currency: 'ILS',
      grand_total: 270,
      outstanding_amount: 170,
    };
    const { listCalls } = fakeErpnext({ 'Purchase Invoice': () => [row, row] });
    expect(await api().forOrder('PO-2048')).toEqual([
      { name: 'PINV-0068', billNo: 'GC-8831', currency: 'ILS', total: 270, outstanding: 170 },
    ]);
    expect(listCalls[0].query.filters).toContainEqual(['is_return', '=', 0]);
  });
});
