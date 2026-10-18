import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { ListQuery } from '../../../core/erpnext/erpnext-client';
import { InventoryApiService, NoValuationError, StockMovedError } from './inventory-api.service';
import { AdjustRequest } from './inventory.models';

const MAIN = 'Main warehouse - RN';
const SHOP = 'Garden shop - RN';
const WAREHOUSES = () => [
  { name: SHOP, warehouse_name: 'Garden shop' },
  { name: MAIN, warehouse_name: 'Main warehouse' },
];
const binsOf = (stock: Record<string, number>) => (query: ListQuery) => {
  const places = query.filters?.find((f) => f[0] === 'warehouse')?.[2] as string[] | undefined;
  return Object.entries(stock)
    .filter(([w]) => !places || places.includes(w))
    .map(([warehouse, qty]) => ({
      item_code: 'OLV-20',
      warehouse,
      actual_qty: qty,
      stock_uom: 'Unit',
    }));
};
const ITEMS = () => [{ name: 'OLV-20', item_name: 'Olive tree', stock_uom: 'Unit' }];
const ENTRY = {
  name: 'MAT-STE-9',
  docstatus: 1,
  posting_date: '2026-10-18',
  posting_time: '10:00:00',
};

const count = (overrides: Partial<AdjustRequest> = {}): AdjustRequest => ({
  kind: 'count',
  reference: 'CNT-ABC1234',
  company: 'Rehan Nursery',
  item: 'OLV-20',
  uom: 'Unit',
  warehouse: MAIN,
  systemQty: 22,
  qty: 20,
  damageType: null,
  reason: 'Physical count',
  ...overrides,
});
const damage = (overrides: Partial<AdjustRequest> = {}): AdjustRequest =>
  count({
    kind: 'damage',
    reference: 'DMG-ABC1234',
    warehouse: SHOP,
    systemQty: 8,
    qty: 1,
    damageType: 'damaged',
    reason: 'Broken stem',
    ...overrides,
  });

function erp(stock: Record<string, number>, extra: Record<string, () => unknown> = {}) {
  return fakeErpnext(
    { Bin: binsOf(stock), Item: ITEMS, Warehouse: WAREHOUSES },
    {
      'frappe.client.insert': (body) => ({
        ...(body['doc'] as object),
        name: 'MAT-STE-9',
        docstatus: 0,
      }),
      'frappe.client.submit': () => ENTRY,
      ...extra,
    },
  );
}

const api = () => TestBed.inject(InventoryApiService);

describe('InventoryApiService adjustments', () => {
  it('posts a count below the system quantity as a material issue of the difference, reason and reference in remarks', async () => {
    const { postCalls } = erp({ [MAIN]: 22, [SHOP]: 8 });
    const result = await api().adjust(count(), null);
    expect(postCalls[0].body['doc']).toMatchObject({
      doctype: 'Stock Entry',
      stock_entry_type: 'Material Issue',
      purpose: 'Material Issue',
      from_warehouse: MAIN,
      remarks: 'Count: Physical count\n\nMadar count CNT-ABC1234',
      items: [{ item_code: 'OLV-20', qty: 2, uom: 'Unit', s_warehouse: MAIN }],
    });
    expect(result).toEqual({
      entry: 'MAT-STE-9',
      postingDate: '2026-10-18',
      postingTime: '10:00:00',
      warehouseQty: 22,
      totalQty: 30,
    });
  });

  it('posts a count above the system quantity as a material receipt', async () => {
    const { postCalls } = erp(
      { [MAIN]: 22 },
      { 'erpnext.stock.utils.get_incoming_rate': () => 20 },
    );
    await api().adjust(count({ qty: 25 }), null);
    expect(postCalls[1].body['doc']).toMatchObject({
      stock_entry_type: 'Material Receipt',
      to_warehouse: MAIN,
      items: [{ qty: 3, t_warehouse: MAIN }],
    });
  });

  it('refuses a count once the location no longer holds what was counted against', async () => {
    const { postCalls } = erp({ [MAIN]: 21 });
    const error = await api()
      .adjust(count(), null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StockMovedError);
    expect((error as StockMovedError).current).toBe(21);
    expect(postCalls).toEqual([]);
  });

  it('refuses to add counted stock where ERPNext has no rate to value it at', async () => {
    const { postCalls } = erp({ [MAIN]: 0 }, { 'erpnext.stock.utils.get_incoming_rate': () => 0 });
    await expect(api().adjust(count({ systemQty: 0, qty: 5 }), null)).rejects.toBeInstanceOf(
      NoValuationError,
    );
    expect(postCalls.map((c) => c.method)).toEqual(['erpnext.stock.utils.get_incoming_rate']);
    expect(postCalls[0].body).toMatchObject({
      args: { item_code: 'OLV-20', warehouse: MAIN, qty: -1, company: 'Rehan Nursery' },
      raise_error_if_no_rate: 0,
    });
  });

  it('sets both header warehouses, so a reused draft that changed direction keeps none of the old one', async () => {
    const { postCalls } = fakeErpnext(
      { Bin: binsOf({ [MAIN]: 22 }), Item: ITEMS, Warehouse: WAREHOUSES },
      { 'frappe.client.submit': () => ENTRY },
      {
        'Stock Entry/MAT-STE-9': {
          name: 'MAT-STE-9',
          docstatus: 0,
          stock_entry_type: 'Material Receipt',
          to_warehouse: MAIN,
          items: [{ item_code: 'OLV-20', qty: 3, t_warehouse: MAIN }],
        },
      },
    );
    await api().adjust(count(), 'MAT-STE-9');
    expect(postCalls[0].body['doc']).toMatchObject({
      name: 'MAT-STE-9',
      stock_entry_type: 'Material Issue',
      from_warehouse: MAIN,
      to_warehouse: null,
    });
  });

  it('writes damage off as a material issue labelled with its type', async () => {
    const { postCalls } = erp({ [SHOP]: 8 });
    await api().adjust(damage({ damageType: 'lost' }), null);
    expect(postCalls[0].body['doc']).toMatchObject({
      stock_entry_type: 'Material Issue',
      from_warehouse: SHOP,
      remarks: 'Lost: Broken stem\n\nMadar damage DMG-ABC1234',
      items: [{ qty: 1, s_warehouse: SHOP }],
    });
  });

  it('reports a lost answer as unresolved, and an earlier different posting as such', async () => {
    erp(
      { [SHOP]: 8 },
      { 'frappe.client.submit': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
    );
    await expect(api().adjust(damage(), null)).rejects.toBeInstanceOf(UnresolvedError);
    TestBed.resetTestingModule();
    fakeErpnext(
      {},
      {},
      {
        'Stock Entry/MAT-STE-9': {
          ...ENTRY,
          items: [{ item_code: 'OLV-20', qty: 2, s_warehouse: SHOP }],
        },
      },
    );
    await expect(api().adjust(damage(), 'MAT-STE-9')).rejects.toBeInstanceOf(PostedEarlierError);
  });

  it('opens only plain-quantity items for a task, never batch or serial ones', async () => {
    const { listCalls } = erp({ [MAIN]: 22 });
    await api().item('OLV-20', [MAIN]);
    expect(listCalls.find((c) => c.doctype === 'Item')?.query.filters).toEqual(
      expect.arrayContaining([
        ['has_batch_no', '=', 0],
        ['has_serial_no', '=', 0],
      ]),
    );
  });

  it('finds an adjustment by its reference: posted, a draft, or nothing', async () => {
    fakeErpnext({
      'Stock Entry': (q) =>
        (q.filters as unknown[][]).some((f) => String(f[2]).includes('DMG-ABC1234')) ? [ENTRY] : [],
      Bin: binsOf({ [SHOP]: 7 }),
      Item: ITEMS,
      Warehouse: WAREHOUSES,
    });
    expect(await api().findAdjustment(damage())).toMatchObject({
      entry: 'MAT-STE-9',
      warehouseQty: 7,
    });
    expect(await api().findAdjustment(count())).toBe('not-found');
  });
});
