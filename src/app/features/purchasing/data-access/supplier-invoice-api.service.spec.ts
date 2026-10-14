import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { InvoiceRequest, paymentStatus } from './purchase.models';
import { SupplierInvoiceApiService } from './supplier-invoice-api.service';

const MAKE = 'erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice';

const request = (overrides: Partial<InvoiceRequest> = {}): InvoiceRequest => ({
  reference: 'BILL-ABC1234',
  order: 'PO-2048',
  billNo: 'GC-8831',
  receipts: ['MAT-PRE-1', 'MAT-PRE-2'],
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
    });
    expect(listCalls[0].query.filters).toEqual([
      ['Purchase Receipt Item', 'purchase_order', '=', 'PO-2048'],
      ['docstatus', '=', 1],
      ['is_return', '=', 0],
      ['per_billed', '<', 100],
    ]);
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

  it('rebuilds a remembered draft instead of submitting stale rows', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        [MAKE]: mapper,
        'frappe.client.insert': () => ({ name: 'PINV-0069' }),
        'frappe.client.submit': () => ({ name: 'PINV-0069' }),
      },
      { 'Purchase Invoice/PINV-0068': { ...POSTED, docstatus: 0 } },
    );
    expect(await api().record(request(), 'PINV-0068')).toBe('PINV-0069');
    expect(postCalls[0]).toEqual({
      method: 'frappe.client.delete',
      body: { doctype: 'Purchase Invoice', name: 'PINV-0068' },
    });
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
      { 'Purchase Invoice/PINV-0068': { ...POSTED, grand_total: 270, outstanding_amount: 170 } },
    );
    expect(await api().invoice('PINV-0068')).toEqual({
      name: 'PINV-0068',
      billNo: 'GC-8831',
      supplierName: 'Green Clay',
      order: 'PO-2048',
      currency: 'ILS',
      total: 270,
      outstanding: 170,
      cancelled: false,
      payments: [{ name: 'PAY-0155', amount: 100, account: 'Main bank' }],
    });
  });

  it("lists an order's invoices once each, though ERPNext returns a row per billed line", async () => {
    const row = {
      name: 'PINV-0068',
      bill_no: 'GC-8831',
      currency: 'ILS',
      grand_total: 270,
      outstanding_amount: 170,
    };
    fakeErpnext({ 'Purchase Invoice': () => [row, row] });
    expect(await api().forOrder('PO-2048')).toEqual([
      { name: 'PINV-0068', billNo: 'GC-8831', currency: 'ILS', total: 270, outstanding: 170 },
    ]);
  });
});
