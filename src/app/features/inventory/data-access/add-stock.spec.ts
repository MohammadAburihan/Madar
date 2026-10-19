import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { vi } from 'vitest';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { BusinessService } from '../../../core/business/business.service';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { AddStockStore } from './add-stock.store';
import {
  InventoryApiService,
  NoOpeningAccountError,
  NoValuationError,
} from './inventory-api.service';
import { AddStockRequest, StockItem } from './inventory.models';

const MAIN = 'Main warehouse - RN';
const OPENING_METHOD =
  'erpnext.accounts.doctype.opening_invoice_creation_tool.opening_invoice_creation_tool.get_temporary_opening_account';
const request = (overrides: Partial<AddStockRequest> = {}): AddStockRequest => ({
  reference: 'ADD-ABC1234',
  company: 'Rehan Nursery',
  warehouse: MAIN,
  reason: 'opening',
  lines: [
    { item: 'OLV-20', name: 'Olive tree', uom: 'Unit', qty: 10, rate: 40 },
    { item: 'POT-30', name: 'Ceramic planter', uom: 'Unit', qty: 5, rate: null },
  ],
  ...overrides,
});
const ENTRY = {
  name: 'MAT-STE-61',
  docstatus: 1,
  posting_date: '2026-10-19',
  posting_time: '10:00:00',
};

describe('InventoryApiService.addStock', () => {
  const api = () => TestBed.inject(InventoryApiService);

  it('books opening stock against the Temporary Opening account, costs as given or the item’s own', async () => {
    const { postCalls } = fakeErpnext(
      { 'Stock Entry Type': () => [{ name: 'Material Receipt' }] },
      {
        'erpnext.stock.utils.get_incoming_rate': () => 22.5,
        [OPENING_METHOD]: () => 'Temporary Opening - RN',
        'frappe.client.insert': (body) => ({
          ...(body['doc'] as object),
          name: 'MAT-STE-61',
          docstatus: 0,
        }),
        'frappe.client.submit': () => ENTRY,
      },
    );
    expect(await api().addStock(request(), null)).toEqual({
      entry: 'MAT-STE-61',
      postingDate: '2026-10-19',
      postingTime: '10:00:00',
    });
    // Only the line without a cost is checked for one.
    expect(
      postCalls.filter((c) => c.method === 'erpnext.stock.utils.get_incoming_rate'),
    ).toHaveLength(1);
    const doc = postCalls.find((c) => c.method === 'frappe.client.insert')!.body['doc'];
    expect(doc).toMatchObject({
      purpose: 'Material Receipt',
      is_opening: 'Yes',
      to_warehouse: MAIN,
      remarks: 'Opening stock\n\nMadar add ADD-ABC1234',
      items: [
        {
          item_code: 'OLV-20',
          qty: 10,
          basic_rate: 40,
          t_warehouse: MAIN,
          expense_account: 'Temporary Opening - RN',
        },
        {
          item_code: 'POT-30',
          qty: 5,
          t_warehouse: MAIN,
          expense_account: 'Temporary Opening - RN',
        },
      ],
    });
    expect((doc as { items: object[] }).items[1]).not.toHaveProperty('basic_rate');
  });

  it('brings in stock made here as a plain receipt, a cost of 0 allowed', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.client.insert': (body) => ({
          ...(body['doc'] as object),
          name: 'MAT-STE-62',
          docstatus: 0,
        }),
        'frappe.client.submit': () => ENTRY,
      },
    );
    await api().addStock(
      request({
        reason: 'made',
        lines: [{ item: 'OLV-20', name: 'Olive tree', uom: 'Unit', qty: 3, rate: 0 }],
      }),
      null,
    );
    const doc = postCalls.find((c) => c.method === 'frappe.client.insert')!.body['doc'];
    expect(doc).toMatchObject({
      is_opening: 'No',
      remarks: 'Grown or made here\n\nMadar add ADD-ABC1234',
      items: [{ basic_rate: 0, allow_zero_valuation_rate: 1 }],
    });
    expect((doc as { items: object[] }).items[0]).not.toHaveProperty('expense_account');
  });

  it('refuses a line without a cost the item has none of, and opening stock without an opening account', async () => {
    const { postCalls } = fakeErpnext({}, { 'erpnext.stock.utils.get_incoming_rate': () => 0 });
    await expect(api().addStock(request(), null)).rejects.toBeInstanceOf(NoValuationError);
    expect(postCalls.some((c) => c.method === 'frappe.client.insert')).toBe(false);
    TestBed.resetTestingModule();
    fakeErpnext(
      {},
      { [OPENING_METHOD]: () => throwError(() => new HttpErrorResponse({ status: 417 })) },
    );
    await expect(
      api().addStock(
        request({ lines: [{ item: 'OLV-20', name: 'O', uom: 'Unit', qty: 1, rate: 4 }] }),
        null,
      ),
    ).rejects.toBeInstanceOf(NoOpeningAccountError);
    TestBed.resetTestingModule();
    fakeErpnext(
      {},
      { [OPENING_METHOD]: () => throwError(() => new HttpErrorResponse({ status: 0 })) },
    );
    const costed = request({
      lines: [{ item: 'OLV-20', name: 'O', uom: 'Unit', qty: 1, rate: 4 }],
    });
    // A lost connection is not a missing account.
    await expect(api().addStock(costed, null)).rejects.not.toBeInstanceOf(NoOpeningAccountError);
  });

  it('won’t take an earlier posting with another reason or cost as this one', async () => {
    fakeErpnext(
      {},
      {},
      {
        'Stock Entry/MAT-STE-61': {
          ...ENTRY,
          is_opening: 'No',
          items: [{ item_code: 'OLV-20', qty: 1, t_warehouse: MAIN, basic_rate: 4 }],
        },
      },
    );
    const costed = request({
      lines: [{ item: 'OLV-20', name: 'O', uom: 'Unit', qty: 1, rate: 4 }],
    });
    await expect(api().addStock(costed, 'MAT-STE-61')).rejects.toBeInstanceOf(PostedEarlierError);
  });
});

describe('AddStockStore', () => {
  const OLIVE: StockItem = {
    code: 'OLV-20',
    name: 'Olive tree',
    uom: 'Unit',
    stock: {},
    low: false,
  };
  function setup() {
    const api = {
      movableWarehouses: vi.fn().mockResolvedValue([{ id: MAIN, name: 'Main warehouse' }]),
      item: vi.fn().mockResolvedValue(OLIVE),
      addStock: vi
        .fn()
        .mockResolvedValue({ entry: 'MAT-STE-61', postingDate: 'D', postingTime: 'T' }),
      findAddStock: vi.fn(),
      discard: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: InventoryApiService, useValue: api },
        {
          provide: BusinessService,
          useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery' }) },
        },
      ],
    });
    return { store: TestBed.inject(AddStockStore), api };
  }

  it('sends each line, costs only for roles that see them', async () => {
    const { store, api } = setup();
    store.start();
    await store.loadWarehouses();
    expect(store.warehouse()).toBe(MAIN);
    store.addItem(OLIVE);
    store.addItem(OLIVE);
    expect(store.lines()).toHaveLength(1);
    store.setLine('OLV-20', { qtyInput: '١٠', costInput: '0.004' });
    // Rounded as it posts, so the review shows it: here a zero cost.
    expect(store.parsed()[0].cost).toBe(0);
    store.setLine('OLV-20', { costInput: '40' });
    expect(store.ready()).toBe(true);
    await store.confirm(false);
    expect(api.addStock.mock.calls[0][0]).toMatchObject({
      reason: 'opening',
      lines: [{ item: 'OLV-20', qty: 10, rate: null }],
    });
    expect(store.state()).toBe('confirmed');
  });

  it('keeps a lost answer to check, and names the item without a cost', async () => {
    const { store, api } = setup();
    store.start();
    await store.loadWarehouses();
    store.addItem(OLIVE);
    store.setLine('OLV-20', { qtyInput: '2' });
    api.addStock.mockRejectedValueOnce(new NoValuationError('OLV-20'));
    await store.confirm(true);
    expect([store.failure(), store.failedItem()]).toEqual(['valuation', 'OLV-20']);
    api.addStock.mockRejectedValueOnce(new UnresolvedError());
    await store.confirm(true);
    expect(store.busy()).toBe(true);
    store.resume();
    expect(store.lines()).toHaveLength(1);
    api.findAddStock.mockResolvedValueOnce({
      entry: 'MAT-STE-61',
      postingDate: 'D',
      postingTime: 'T',
    });
    expect(await store.checkResult()).toBe('found');
  });
});
