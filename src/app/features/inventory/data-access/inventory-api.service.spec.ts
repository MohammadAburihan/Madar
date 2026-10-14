import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { ListQuery } from '../../../core/erpnext/erpnext-client';
import { InventoryApiService } from './inventory-api.service';
import { TransferRequest } from './inventory.models';

const MAIN = 'Main warehouse - RN';
const SHOP = 'Garden shop - RN';

const WAREHOUSES = () => [
  { name: SHOP, warehouse_name: 'Garden shop' },
  { name: MAIN, warehouse_name: 'Main warehouse' },
];

const bins = (rows: { item: string; warehouse: string; qty: number }[]) => (query: ListQuery) => {
  const codes = query.filters?.find((f) => f[0] === 'item_code')?.[2] as string[] | undefined;
  const places = query.filters?.find((f) => f[0] === 'warehouse')?.[2] as string[] | undefined;
  return rows
    .filter((r) => !codes || codes.includes(r.item))
    .filter((r) => !places || places.includes(r.warehouse))
    .map((r) => ({
      item_code: r.item,
      warehouse: r.warehouse,
      actual_qty: r.qty,
      stock_uom: 'Unit',
    }));
};

const ITEMS = (query: ListQuery) => {
  const all = [
    { name: 'OLV-20', item_name: 'Olive tree', stock_uom: 'Unit' },
    { name: 'POT-30', item_name: 'Ceramic planter', stock_uom: 'Unit' },
    { name: 'SOIL', item_name: 'Potting soil', stock_uom: 'Bag' },
  ];
  const codes = query.filters?.find((f) => f[0] === 'name')?.[2] as string[] | undefined;
  return codes ? all.filter((i) => codes.includes(i.name)) : all.map((i) => ({ name: i.name }));
};

const request = (overrides: Partial<TransferRequest> = {}): TransferRequest => ({
  reference: 'TRF-ABC1234',
  company: 'Rehan Nursery',
  item: 'OLV-20',
  uom: 'Unit',
  qty: 2,
  from: MAIN,
  to: SHOP,
  ...overrides,
});

const ENTRY = {
  name: 'MAT-STE-1',
  docstatus: 1,
  posting_date: '2026-10-14',
  posting_time: '09:41:00',
};

describe('InventoryApiService', () => {
  it('lists the company leaf warehouses that can hold stock', async () => {
    const { listCalls } = fakeErpnext({ Warehouse: WAREHOUSES });
    const api = TestBed.inject(InventoryApiService);
    expect(await api.warehouses('Rehan Nursery')).toEqual([
      { id: SHOP, name: 'Garden shop' },
      { id: MAIN, name: 'Main warehouse' },
    ]);
    expect(listCalls[0].query.filters).toEqual([
      ['company', '=', 'Rehan Nursery'],
      ['is_group', '=', 0],
      ['disabled', '=', 0],
      ['warehouse_type', '!=', 'Transit'],
    ]);
  });

  it('gives an overview of the items holding stock, flags low stock and counts moves today', async () => {
    const { countCalls } = fakeErpnext(
      {
        Warehouse: WAREHOUSES,
        Bin: bins([
          { item: 'OLV-20', warehouse: MAIN, qty: 24 },
          { item: 'OLV-20', warehouse: SHOP, qty: 6 },
          { item: 'POT-30', warehouse: MAIN, qty: 2 },
          { item: 'SOIL', warehouse: MAIN, qty: 0 },
        ]),
        Item: ITEMS,
        'Item Reorder': () => [
          { parent: 'POT-30', warehouse: MAIN, warehouse_reorder_level: 5 },
          { parent: 'OLV-20', warehouse: MAIN, warehouse_reorder_level: 10 },
        ],
      },
      {},
      {},
      { 'Stock Entry': 5 },
    );
    const overview = await TestBed.inject(InventoryApiService).overview(
      'Rehan Nursery',
      '2026-10-14',
    );

    expect(overview.warehouses.map((w) => w.id)).toEqual([SHOP, MAIN]);
    expect(overview.items).toEqual([
      { code: 'POT-30', name: 'Ceramic planter', uom: 'Unit', stock: { [MAIN]: 2 }, low: true },
      {
        code: 'OLV-20',
        name: 'Olive tree',
        uom: 'Unit',
        stock: { [MAIN]: 24, [SHOP]: 6 },
        low: false,
      },
    ]);
    expect(overview.movesToday).toBe(5);
    expect(countCalls[0].filters).toEqual([
      ['company', '=', 'Rehan Nursery'],
      ['docstatus', '=', 1],
      ['posting_date', '=', '2026-10-14'],
    ]);
  });

  it("leaves moves today out when the role can't read stock entries", async () => {
    fakeErpnext(
      { Warehouse: WAREHOUSES },
      {},
      {},
      { 'Stock Entry': () => throwError(() => new HttpErrorResponse({ status: 403 })) },
    );
    const overview = await TestBed.inject(InventoryApiService).overview('Rehan Nursery', 'x');
    expect(overview.movesToday).toBeNull();
    expect(overview.items).toEqual([]);
  });

  it('looks item details up in batches so long catalogues keep the URL short', async () => {
    const codes = Array.from({ length: 250 }, (_, i) => `ITEM-${i}`);
    const { listCalls } = fakeErpnext({
      Warehouse: WAREHOUSES,
      Bin: () =>
        codes.map((code) => ({
          item_code: code,
          warehouse: MAIN,
          actual_qty: 1,
          stock_uom: 'Unit',
        })),
      Item: (query: ListQuery) =>
        (query.filters?.find((f) => f[0] === 'name')?.[2] as string[]).map((name) => ({
          name,
          item_name: name,
          stock_uom: 'Unit',
        })),
    });
    const overview = await TestBed.inject(InventoryApiService).overview('Rehan Nursery', 'x');
    const itemCalls = listCalls.filter((c) => c.doctype === 'Item');
    expect(itemCalls.map((c) => (c.query.filters?.[0][2] as string[]).length)).toEqual([
      100, 100, 50,
    ]);
    expect(overview.items).toHaveLength(250);
  });

  it('searches stock items by code, name or barcode, including ones without stock', async () => {
    const { listCalls } = fakeErpnext({
      Item: ITEMS,
      Bin: bins([{ item: 'OLV-20', warehouse: MAIN, qty: 24 }]),
    });
    const items = await TestBed.inject(InventoryApiService).searchItems('o', [MAIN, SHOP]);

    expect(items.map((i) => [i.code, i.stock])).toEqual([
      ['POT-30', {}],
      ['OLV-20', { [MAIN]: 24 }],
      ['SOIL', {}],
    ]);
    const search = listCalls.find((c) => c.doctype === 'Item')!.query;
    expect(search.filters).toContainEqual(['is_stock_item', '=', 1]);
    expect(search.orFilters).toEqual([
      ['item_code', 'like', '%o%'],
      ['item_name', 'like', '%o%'],
      ['Item Barcode', 'barcode', 'like', '%o%'],
    ]);
  });

  it('groups the stock ledger into one movement per voucher, newest first', async () => {
    const { listCalls } = fakeErpnext({
      'Stock Ledger Entry': () => [
        {
          voucher_type: 'Stock Entry',
          voucher_no: 'STE-2',
          warehouse: MAIN,
          actual_qty: -2,
          posting_date: '2026-10-14',
          posting_time: '09:41:00',
        },
        {
          voucher_type: 'Stock Entry',
          voucher_no: 'STE-2',
          warehouse: SHOP,
          actual_qty: 2,
          posting_date: '2026-10-14',
          posting_time: '09:41:00',
        },
        {
          voucher_type: 'Sales Invoice',
          voucher_no: 'SI-1',
          warehouse: MAIN,
          actual_qty: -1,
          posting_date: '2026-10-13',
          posting_time: '10:00:00',
        },
      ],
    });
    const movements = await TestBed.inject(InventoryApiService).history('OLV-20', [MAIN, SHOP]);

    expect(movements).toEqual([
      {
        voucherType: 'Stock Entry',
        voucher: 'STE-2',
        postingDate: '2026-10-14',
        postingTime: '09:41:00',
        lines: [
          { warehouse: MAIN, qty: -2 },
          { warehouse: SHOP, qty: 2 },
        ],
      },
      {
        voucherType: 'Sales Invoice',
        voucher: 'SI-1',
        postingDate: '2026-10-13',
        postingTime: '10:00:00',
        lines: [{ warehouse: MAIN, qty: -1 }],
      },
    ]);
    expect(listCalls[0].query.filters).toEqual([
      ['item_code', '=', 'OLV-20'],
      ['warehouse', 'in', [MAIN, SHOP]],
      ['is_cancelled', '=', 0],
    ]);
    expect(listCalls[0].query.orderBy).toBe('posting_datetime desc, creation desc');
  });

  describe('transfer', () => {
    const balances = bins([
      { item: 'OLV-20', warehouse: MAIN, qty: 22 },
      { item: 'OLV-20', warehouse: SHOP, qty: 8 },
      { item: 'OLV-20', warehouse: 'Stores - RN', qty: 5 },
    ]);

    it('inserts a material transfer, submits it, and reads the balances back', async () => {
      const { postCalls } = fakeErpnext(
        { Bin: balances, Item: ITEMS, Warehouse: WAREHOUSES },
        {
          'frappe.client.insert': (body) => ({
            ...(body['doc'] as object),
            name: 'MAT-STE-1',
            docstatus: 0,
          }),
          'frappe.client.submit': () => ENTRY,
        },
      );
      const inserted: string[] = [];
      const result = await TestBed.inject(InventoryApiService).transfer(request(), null, (name) =>
        inserted.push(name),
      );

      const doc = postCalls[0].body['doc'] as Record<string, unknown> & {
        items: Record<string, unknown>[];
      };
      expect(postCalls.map((c) => c.method)).toEqual([
        'frappe.client.insert',
        'frappe.client.submit',
      ]);
      expect(doc).toMatchObject({
        doctype: 'Stock Entry',
        stock_entry_type: 'Material Transfer',
        purpose: 'Material Transfer',
        company: 'Rehan Nursery',
        from_warehouse: MAIN,
        to_warehouse: SHOP,
        remarks: 'Madar transfer TRF-ABC1234',
      });
      expect(doc['posting_date']).toBeUndefined();
      expect(doc.items).toEqual([
        {
          item_code: 'OLV-20',
          qty: 2,
          uom: 'Unit',
          stock_uom: 'Unit',
          conversion_factor: 1,
          s_warehouse: MAIN,
          t_warehouse: SHOP,
        },
      ]);
      expect(inserted).toEqual(['MAT-STE-1']);
      expect(result).toEqual({
        entry: 'MAT-STE-1',
        postingDate: '2026-10-14',
        postingTime: '09:41:00',
        fromQty: 22,
        toQty: 8,
        // Stores isn't one of the company's listed locations, so it isn't in the total Review showed.
        totalQty: 30,
      });
    });

    it('submits a leftover draft as itself, never inserting a copy', async () => {
      const { postCalls } = fakeErpnext(
        { Bin: balances, Item: ITEMS },
        { 'frappe.client.submit': () => ENTRY },
        { 'Stock Entry/MAT-STE-1': { name: 'MAT-STE-1', docstatus: 0, modified: 'm1' } },
      );
      await TestBed.inject(InventoryApiService).transfer(request(), 'MAT-STE-1');

      expect(postCalls.map((c) => c.method)).toEqual(['frappe.client.submit']);
      expect(postCalls[0].body['doc']).toMatchObject({
        name: 'MAT-STE-1',
        modified: 'm1',
        remarks: 'Madar transfer TRF-ABC1234',
      });
    });

    it('reports a gateway timeout or lost connection on submit as unresolved', async () => {
      for (const status of [504, 0]) {
        TestBed.resetTestingModule();
        fakeErpnext(
          {},
          {
            'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'MAT-STE-1' }),
            'frappe.client.submit': () => throwError(() => new HttpErrorResponse({ status })),
          },
        );
        await expect(
          TestBed.inject(InventoryApiService).transfer(request(), null),
        ).rejects.toBeInstanceOf(UnresolvedError);
      }
    });

    it('treats a failure to read the draft as definite: nothing was sent', async () => {
      const { postCalls } = fakeErpnext(
        {},
        {},
        {
          'Stock Entry/MAT-STE-1': () => throwError(() => new HttpErrorResponse({ status: 0 })),
        },
      );
      const error = await TestBed.inject(InventoryApiService)
        .transfer(request(), 'MAT-STE-1')
        .catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(UnresolvedError);
      expect(postCalls).toEqual([]);
    });

    it('passes definite rejections through', async () => {
      fakeErpnext(
        {},
        {
          'frappe.client.insert': () =>
            throwError(() => new HttpErrorResponse({ status: 417, error: 'NegativeStockError' })),
        },
      );
      const error = await TestBed.inject(InventoryApiService)
        .transfer(request(), null)
        .catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(UnresolvedError);
    });
  });

  describe('find', () => {
    it('reports a transfer that never reached ERPNext', async () => {
      const { listCalls } = fakeErpnext();
      expect(await TestBed.inject(InventoryApiService).find(request())).toBe('not-found');
      expect(listCalls[0].query.filters).toEqual([
        ['remarks', 'like', '%TRF-ABC1234%'],
        ['docstatus', '!=', 2],
      ]);
      expect(listCalls[0].query.orderBy).toBe('docstatus desc');
    });

    it('returns a leftover draft', async () => {
      fakeErpnext({ 'Stock Entry': () => [{ ...ENTRY, docstatus: 0 }] });
      expect(await TestBed.inject(InventoryApiService).find(request())).toEqual({
        draft: 'MAT-STE-1',
      });
    });

    it('returns the posted transfer with the balances as they stand now', async () => {
      fakeErpnext({
        'Stock Entry': () => [ENTRY],
        Warehouse: WAREHOUSES,
        Bin: bins([
          { item: 'OLV-20', warehouse: MAIN, qty: 22 },
          { item: 'OLV-20', warehouse: SHOP, qty: 8 },
        ]),
        Item: ITEMS,
      });
      expect(await TestBed.inject(InventoryApiService).find(request())).toEqual({
        entry: 'MAT-STE-1',
        postingDate: '2026-10-14',
        postingTime: '09:41:00',
        fromQty: 22,
        toQty: 8,
        totalQty: 30,
      });
    });
  });

  it('deletes an abandoned draft', async () => {
    const { postCalls } = fakeErpnext({}, { 'frappe.client.delete': () => null });
    await TestBed.inject(InventoryApiService).discard('MAT-STE-9');
    expect(postCalls).toEqual([
      { method: 'frappe.client.delete', body: { doctype: 'Stock Entry', name: 'MAT-STE-9' } },
    ]);
  });
});
