import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { PurchaseApiService } from './purchase-api.service';
import { OrderRequest, ReceiptRequest, orderProgress } from './purchase.models';

const request = (overrides: Partial<OrderRequest> = {}): OrderRequest => ({
  reference: 'PUR-ABC1234',
  company: 'Rehan Nursery',
  currency: 'ILS',
  supplier: 'Green Clay',
  scheduleDate: '2026-10-14',
  lines: [{ item: 'POT-30', uom: 'Unit', qty: 10, rate: 45 }],
  ...overrides,
});

const ORDER = {
  name: 'PO-2048',
  docstatus: 1,
  status: 'To Receive and Bill',
  supplier: 'Green Clay',
  supplier_name: 'Green Clay',
  transaction_date: '2026-10-11',
  currency: 'ILS',
  grand_total: 450,
  per_received: 0,
  per_billed: 0,
  items: [
    {
      name: 'row-1',
      item_code: 'POT-30',
      item_name: 'Ceramic planter',
      uom: 'Unit',
      qty: 10,
      received_qty: 0,
      rate: 45,
      amount: 450,
      billed_amt: 0,
      warehouse: 'Stores - RN',
    },
  ],
};

const receipt = (overrides: Partial<ReceiptRequest> = {}): ReceiptRequest => ({
  reference: 'REC-ABC1234',
  order: 'PO-2048',
  warehouse: 'Main warehouse - RN',
  lines: [{ row: 'row-1', qty: 6 }],
  ...overrides,
});

/** What make_purchase_receipt returns for PO-2048 with a second, untouched row. */
const RECEIPT_TEMPLATE = {
  doctype: 'Purchase Receipt',
  __islocal: 1,
  supplier: 'Green Clay',
  items: [
    { purchase_order_item: 'row-1', item_code: 'POT-30', qty: 10, warehouse: 'Stores - RN' },
    { purchase_order_item: 'row-2', item_code: 'SOIL', qty: 5, warehouse: 'Stores - RN' },
  ],
};

const POSTED_RECEIPT = {
  name: 'MAT-PRE-0001',
  docstatus: 1,
  set_warehouse: 'Main warehouse - RN',
  items: [{ purchase_order_item: 'row-1', qty: 6, warehouse: 'Main warehouse - RN' }],
};

const api = () => TestBed.inject(PurchaseApiService);

describe('orderProgress', () => {
  const at = (
    per_received: number,
    per_billed = 0,
    status = 'To Receive and Bill',
    docstatus = 1,
  ) => orderProgress({ docstatus, status, per_received, per_billed });

  it('reads where an order stands from its received and billed percentages', () => {
    expect(at(0, 0, 'Draft', 0)).toBe('draft');
    expect(at(0)).toBe('awaitingReceipt');
    expect(at(60)).toBe('partlyReceived');
    expect(at(100, 60)).toBe('awaitingInvoice');
    expect(at(100, 100, 'Completed')).toBe('complete');
    expect(at(40, 0, 'Closed')).toBe('closed');
    expect(at(0, 0, 'On Hold')).toBe('onHold');
    expect(at(0, 0, 'Cancelled', 2)).toBe('cancelled');
  });
});

describe('PurchaseApiService', () => {
  it('lists the company’s orders with ordered and received quantities and the supplier balance', async () => {
    const { listCalls, countCalls } = fakeErpnext(
      {
        'Purchase Order': () => [{ ...ORDER, per_received: 60 }],
        'Purchase Order Item': () => [
          { parent: 'PO-2048', qty: 6, received_qty: 6 },
          { parent: 'PO-2048', qty: 4, received_qty: 0 },
        ],
        'Purchase Invoice': () => [
          { party_account_currency: 'ILS', conversion_rate: 1, 'SUM(`outstanding_amount`)': 100 },
          { party_account_currency: 'USD', conversion_rate: 3.5, 'SUM(`outstanding_amount`)': 20 },
        ],
      },
      {},
      {},
      { 'Purchase Order': 4 },
    );
    const overview = await api().overview('Rehan Nursery', 'ILS');
    expect(overview.supplierBalance).toBe(170);
    // Counted over every submitted order: awaiting receipt, plus received but not yet invoiced.
    expect([overview.openOrders, overview.awaitingReceipt]).toEqual([8, 4]);
    expect(countCalls.map((c) => c.filters)).toEqual([
      [
        ['company', '=', 'Rehan Nursery'],
        ['docstatus', '=', 1],
        ['status', 'not in', ['Closed', 'On Hold']],
        ['per_received', '<', 100],
      ],
      [
        ['company', '=', 'Rehan Nursery'],
        ['docstatus', '=', 1],
        ['status', 'not in', ['Closed', 'On Hold']],
        ['per_received', '>=', 100],
        ['per_billed', '<', 100],
      ],
    ]);
    expect(overview.orders).toEqual([
      {
        name: 'PO-2048',
        supplier: 'Green Clay',
        supplierName: 'Green Clay',
        date: '2026-10-11',
        currency: 'ILS',
        total: 450,
        progress: 'partlyReceived',
        orderedQty: 10,
        receivedQty: 6,
      },
    ]);
    expect(listCalls.find((c) => c.doctype === 'Purchase Order')!.query.filters).toContainEqual([
      'company',
      '=',
      'Rehan Nursery',
    ]);
  });

  it("leaves the supplier balance out when the role can't read supplier invoices", async () => {
    fakeErpnext({
      'Purchase Invoice': () => throwError(() => new HttpErrorResponse({ status: 403 })),
    });
    expect((await api().overview('Rehan Nursery', 'ILS')).supplierBalance).toBeNull();
  });

  it('prices items from the buying price list, else the last purchase rate', async () => {
    const { postCalls } = fakeErpnext(
      {
        Item: () => [
          { name: 'POT-30', item_name: 'Ceramic planter', stock_uom: 'Unit' },
          { name: 'SOIL', item_name: 'Potting soil', stock_uom: 'Bag' },
        ],
      },
      {
        'frappe.client.get_value': () => ({ buying_price_list: 'Standard Buying' }),
        'erpnext.stock.get_item_details.get_item_details': (body) =>
          (body['ctx'] as { item_code: string }).item_code === 'POT-30'
            ? { price_list_rate: 45, last_purchase_rate: 20 }
            : { price_list_rate: 0, last_purchase_rate: 12 },
      },
    );
    const items = await api().searchItems('p', 'product', {
      company: 'Rehan Nursery',
      supplier: 'Green Clay',
      currency: 'ILS',
      date: '2026-10-14',
    });
    expect(items.map((i) => [i.code, i.rate, i.kind])).toEqual([
      ['POT-30', 45, 'product'],
      ['SOIL', 12, 'product'],
    ]);
    const ctx = postCalls.find((c) => c.method.endsWith('get_item_details'))!.body['ctx'];
    expect(ctx).toMatchObject({ buying_price_list: 'Standard Buying', supplier: 'Green Clay' });
  });

  it('inserts and submits the order with the Madar reference, schedule date and rates', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'PO-2048' }),
        'frappe.client.submit': () => ORDER,
      },
    );
    const inserted: string[] = [];
    expect(await api().confirm(request(), null, (name) => inserted.push(name))).toBe('PO-2048');
    expect(inserted).toEqual(['PO-2048']);
    const doc = postCalls[0].body['doc'] as Record<string, unknown>;
    expect(doc).toMatchObject({
      doctype: 'Purchase Order',
      supplier: 'Green Clay',
      currency: 'ILS',
      conversion_rate: 1,
      schedule_date: '2026-10-14',
      order_confirmation_no: 'PUR-ABC1234',
      items: [{ item_code: 'POT-30', qty: 10, rate: 45, uom: 'Unit', schedule_date: '2026-10-14' }],
    });
    expect(doc['transaction_date']).toBeUndefined();
  });

  it('submits a remembered draft instead of inserting another order', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.submit': () => ORDER },
      { 'Purchase Order/PO-2048': { ...ORDER, docstatus: 0, modified: 'm1' } },
    );
    await api().confirm(request(), 'PO-2048');
    expect(postCalls.map((c) => c.method)).toEqual(['frappe.client.submit']);
    expect(postCalls[0].body['doc']).toMatchObject({ name: 'PO-2048', modified: 'm1' });
  });

  it('reports a remembered draft a slow attempt already confirmed, without resubmitting', async () => {
    const { postCalls } = fakeErpnext({}, {}, { 'Purchase Order/PO-2048': ORDER });
    expect(await api().confirm(request(), 'PO-2048')).toBe('PO-2048');
    expect(postCalls).toEqual([]);
  });

  it('reports an earlier order as the result when ERPNext only rounded its price', async () => {
    fakeErpnext(
      {},
      {},
      { 'Purchase Order/PO-2048': { ...ORDER, items: [{ ...ORDER.items[0], rate: 4.56 }] } },
    );
    expect(
      await api().confirm(
        request({ lines: [{ item: 'POT-30', uom: 'Unit', qty: 10, rate: 4.555 }] }),
        'PO-2048',
      ),
    ).toBe('PO-2048');
  });

  it("won't report an earlier, different order as this one's result", async () => {
    fakeErpnext({}, {}, { 'Purchase Order/PO-2048': ORDER });
    await expect(
      api().confirm(
        request({ lines: [{ item: 'POT-30', uom: 'Unit', qty: 12, rate: 45 }] }),
        'PO-2048',
      ),
    ).rejects.toBeInstanceOf(PostedEarlierError);
  });

  it('turns a timeout into an unresolved result', async () => {
    fakeErpnext(
      {},
      {
        'frappe.client.insert': () => ({ name: 'PO-2048' }),
        'frappe.client.submit': () => throwError(() => new HttpErrorResponse({ status: 504 })),
      },
    );
    await expect(api().confirm(request(), null)).rejects.toBeInstanceOf(UnresolvedError);
  });

  it("won't save a draft over an order a slow attempt already confirmed", async () => {
    const { postCalls } = fakeErpnext({}, {}, { 'Purchase Order/PO-2048': ORDER });
    await expect(api().saveDraft(request(), 'PO-2048')).rejects.toBeInstanceOf(PostedEarlierError);
    expect(postCalls).toEqual([]);
  });

  it('finds an order or its draft by the Madar reference', async () => {
    let rows: unknown[] = [];
    fakeErpnext({ 'Purchase Order': () => rows });
    expect(await api().find('PUR-ABC1234')).toBe('not-found');
    rows = [{ name: 'PO-2048', docstatus: 0 }];
    expect(await api().find('PUR-ABC1234')).toEqual({ draft: 'PO-2048' });
    rows = [{ name: 'PO-2048', docstatus: 1 }];
    expect(await api().find('PUR-ABC1234')).toEqual({ order: 'PO-2048' });
  });

  it('reads one order with its lines', async () => {
    fakeErpnext({}, {}, { 'Purchase Order/PO-2048': { ...ORDER, per_received: 60 } });
    const order = await api().order('PO-2048');
    expect(order).toMatchObject({ progress: 'partlyReceived', orderedQty: 10, receivedQty: 0 });
    expect(order.lines[0]).toEqual({
      row: 'row-1',
      code: 'POT-30',
      name: 'Ceramic planter',
      uom: 'Unit',
      qty: 10,
      receivedQty: 0,
      rate: 45,
      amount: 450,
      billedAmount: 0,
      warehouse: 'Stores - RN',
    });
  });

  describe('receiving', () => {
    const MAKE = 'erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt';

    it('posts a receipt from the order with only the rows and quantities received now', async () => {
      const { postCalls } = fakeErpnext(
        {},
        {
          [MAKE]: () => RECEIPT_TEMPLATE,
          'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'MAT-PRE-0001' }),
          'frappe.client.submit': () => POSTED_RECEIPT,
        },
      );
      const inserted: string[] = [];
      expect(await api().receive(receipt(), null, (name) => inserted.push(name))).toBe(
        'MAT-PRE-0001',
      );
      expect(inserted).toEqual(['MAT-PRE-0001']);
      expect(postCalls[0].body).toEqual({ source_name: 'PO-2048' });
      expect(postCalls[1].body['doc']).toMatchObject({
        supplier: 'Green Clay',
        set_warehouse: 'Main warehouse - RN',
        remarks: 'Madar receipt REC-ABC1234',
        items: [
          {
            purchase_order_item: 'row-1',
            item_code: 'POT-30',
            qty: 6,
            warehouse: 'Main warehouse - RN',
          },
        ],
      });
    });

    it('rebuilds a remembered draft instead of submitting stale rows', async () => {
      const { postCalls } = fakeErpnext(
        {},
        {
          [MAKE]: () => RECEIPT_TEMPLATE,
          'frappe.client.insert': () => ({ name: 'MAT-PRE-0002', docstatus: 0, items: [] }),
          'frappe.client.submit': () => ({ name: 'MAT-PRE-0002' }),
        },
        { 'Purchase Receipt/MAT-PRE-0001': { ...POSTED_RECEIPT, docstatus: 0 } },
      );
      expect(await api().receive(receipt(), 'MAT-PRE-0001')).toBe('MAT-PRE-0002');
      expect(postCalls[0]).toEqual({
        method: 'frappe.client.delete',
        body: { doctype: 'Purchase Receipt', name: 'MAT-PRE-0001' },
      });
    });

    it('reports a remembered draft a slow attempt already posted, without posting again', async () => {
      const { postCalls } = fakeErpnext(
        {},
        {},
        { 'Purchase Receipt/MAT-PRE-0001': POSTED_RECEIPT },
      );
      expect(await api().receive(receipt(), 'MAT-PRE-0001')).toBe('MAT-PRE-0001');
      expect(postCalls).toEqual([]);
    });

    it("won't report an earlier receipt with other quantities as this one's result", async () => {
      fakeErpnext({}, {}, { 'Purchase Receipt/MAT-PRE-0001': POSTED_RECEIPT });
      await expect(
        api().receive(receipt({ lines: [{ row: 'row-1', qty: 4 }] }), 'MAT-PRE-0001'),
      ).rejects.toBeInstanceOf(PostedEarlierError);
    });

    it('turns a timeout while submitting into an unresolved result', async () => {
      fakeErpnext(
        {},
        {
          [MAKE]: () => RECEIPT_TEMPLATE,
          'frappe.client.insert': () => ({ name: 'MAT-PRE-0001' }),
          'frappe.client.submit': () => throwError(() => new HttpErrorResponse({ status: 504 })),
        },
      );
      await expect(api().receive(receipt(), null)).rejects.toBeInstanceOf(UnresolvedError);
    });

    it('finds a receipt or its draft by the Madar reference', async () => {
      let rows: unknown[] = [];
      const { listCalls } = fakeErpnext({ 'Purchase Receipt': () => rows });
      expect(await api().findReceipt('REC-ABC1234')).toBe('not-found');
      expect(listCalls[0].query.filters).toContainEqual(['remarks', 'like', '%REC-ABC1234%']);
      rows = [{ name: 'MAT-PRE-0001', docstatus: 0 }];
      expect(await api().findReceipt('REC-ABC1234')).toEqual({ draft: 'MAT-PRE-0001' });
      rows = [{ name: 'MAT-PRE-0001', docstatus: 1 }];
      expect(await api().findReceipt('REC-ABC1234')).toEqual({ receipt: 'MAT-PRE-0001' });
    });
  });
});
