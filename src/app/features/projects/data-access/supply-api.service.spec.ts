import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { SupplyRequest } from './project.models';
import { SupplyApiService } from './supply-api.service';

const request = (overrides: Partial<SupplyRequest> = {}): SupplyRequest => ({
  reference: 'SUP-ABC1234',
  company: 'Rehan Nursery',
  project: 'PROJ-0001',
  item: 'POT-30',
  uom: 'Unit',
  qty: 8,
  from: 'Main warehouse - RN',
  site: 'Project sites - RN',
  requestRows: [
    { request: 'MR-1', row: 'r1', open: 5 },
    { request: 'MR-2', row: 'r2', open: 7 },
  ],
  ...overrides,
});

const api = () => TestBed.inject(SupplyApiService);

describe('SupplyApiService', () => {
  it("plans an item: open requests, own warehouses' stock, the project's site share and open orders", async () => {
    let orderQuery: { filters?: unknown[] } | undefined;
    fakeErpnext({
      Warehouse: (query) =>
        query.filters?.some((f) => f[0] === 'warehouse_name' && f[1] === '=')
          ? [{ name: 'Project sites - RN' }]
          : [
              { name: 'Main warehouse - RN', warehouse_name: 'Main warehouse' },
              { name: 'Garden shop - RN', warehouse_name: 'Garden shop' },
            ],
      'Material Request': () => [
        { parent: 'MR-1', row: 'r1', project: 'PROJ-0001', stock_qty: 12, ordered_qty: 4 },
        { parent: 'MR-2', row: 'r2', project: 'PROJ-0009', stock_qty: 50, ordered_qty: 0 },
      ],
      Item: () => [{ name: 'POT-30', item_name: 'Ceramic planter', stock_uom: 'Unit' }],
      Bin: () => [
        { warehouse: 'Main warehouse - RN', actual_qty: 3 },
        { warehouse: 'Garden shop - RN', actual_qty: 8 },
        { warehouse: 'Project sites - RN', actual_qty: 2 },
      ],
      'Stock Ledger Entry': () => [{ 'SUM(`actual_qty`)': 2 }],
      'Purchase Order': (query) => {
        orderQuery = query;
        return [
          {
            parent: 'PO-2049',
            project: 'PROJ-0001',
            stock_qty: 4,
            received_qty: 1,
            conversion_factor: 1,
          },
          {
            parent: 'PO-2050',
            project: 'PROJ-0009',
            stock_qty: 9,
            received_qty: 0,
            conversion_factor: 1,
          },
        ];
      },
    });
    expect(await api().plan('PROJ-0001', 'POT-30', 'Rehan Nursery')).toEqual({
      item: 'POT-30',
      itemName: 'Ceramic planter',
      uom: 'Unit',
      site: 'Project sites - RN',
      need: 8,
      requestRows: [{ request: 'MR-1', row: 'r1', open: 8 }],
      atSite: 2,
      sources: [
        { warehouse: 'Garden shop - RN', name: 'Garden shop', qty: 8 },
        { warehouse: 'Main warehouse - RN', name: 'Main warehouse', qty: 3 },
      ],
      pendingOrders: [{ name: 'PO-2049', qty: 3 }],
    });
    // Closed, held, completed or drop-shipped orders bring nothing more into stock.
    expect(orderQuery?.filters).toContainEqual([
      'status',
      'not in',
      ['Closed', 'On Hold', 'Completed', 'Delivered'],
    ]);
  });

  it('delivers to the site booked to the project, filling the oldest requests first', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'STE-1' }),
        'frappe.client.submit': () => ({ name: 'STE-1' }),
      },
    );
    const inserted: string[] = [];
    expect(await api().deliver(request(), null, (n) => inserted.push(n))).toBe('STE-1');
    expect(inserted).toEqual(['STE-1']);
    const doc = postCalls[0].body['doc'] as Record<string, unknown>;
    expect(doc).toMatchObject({
      stock_entry_type: 'Material Transfer',
      project: 'PROJ-0001',
      from_warehouse: 'Main warehouse - RN',
      to_warehouse: 'Project sites - RN',
      remarks: 'Madar supply SUP-ABC1234',
    });
    expect(
      (doc['items'] as Record<string, unknown>[]).map((i) => [
        i['qty'],
        i['material_request_item'],
        i['project'],
      ]),
    ).toEqual([
      [5, 'r1', 'PROJ-0001'],
      [3, 'r2', 'PROJ-0001'],
    ]);
  });

  it('sends what goes beyond the requests unlinked', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'STE-1' }),
        'frappe.client.submit': () => ({ name: 'STE-1' }),
      },
    );
    await api().deliver(request({ qty: 14 }), null);
    const items = (postCalls[0].body['doc'] as { items: Record<string, unknown>[] }).items;
    expect(items.map((i) => [i['qty'], i['material_request_item'] ?? null])).toEqual([
      [5, 'r1'],
      [7, 'r2'],
      [2, null],
    ]);
  });

  it('reports a remembered draft a slow attempt posted, and refuses a different one', async () => {
    const posted = {
      name: 'STE-1',
      docstatus: 1,
      items: [
        {
          item_code: 'POT-30',
          qty: 8,
          s_warehouse: 'Main warehouse - RN',
          t_warehouse: 'Project sites - RN',
        },
      ],
    };
    const { postCalls } = fakeErpnext({}, {}, { 'Stock Entry/STE-1': posted });
    expect(await api().deliver(request(), 'STE-1')).toBe('STE-1');
    expect(postCalls).toEqual([]);
    await expect(api().deliver(request({ qty: 6 }), 'STE-1')).rejects.toBeInstanceOf(
      PostedEarlierError,
    );
  });

  it('turns a timeout into an unresolved result and finds the delivery by reference', async () => {
    let rows: unknown[] = [];
    const { listCalls } = fakeErpnext(
      { 'Stock Entry': () => rows },
      {
        'frappe.client.insert': () => ({ name: 'STE-1' }),
        'frappe.client.submit': () => throwError(() => new HttpErrorResponse({ status: 504 })),
      },
    );
    await expect(api().deliver(request(), null)).rejects.toBeInstanceOf(UnresolvedError);
    expect(await api().find('SUP-ABC1234')).toBe('not-found');
    rows = [{ name: 'STE-1', docstatus: 1 }];
    expect(await api().find('SUP-ABC1234')).toEqual({ entry: 'STE-1' });
    expect(listCalls.find((c) => c.doctype === 'Stock Entry')?.query.filters).toContainEqual([
      'remarks',
      'like',
      '%SUP-ABC1234%',
    ]);
  });
});
