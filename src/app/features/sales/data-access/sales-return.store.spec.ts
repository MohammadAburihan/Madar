import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { BusinessService } from '../../../core/business/business.service';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { WarehouseDirectoryService } from '../../../core/stock/warehouse-directory.service';
import { ReturnChangedError, SalesReturnApiService } from './sales-return-api.service';
import { ReturnSource } from './sales-return.models';
import { SalesReturnStore } from './sales-return.store';

const SOURCE: ReturnSource = {
  invoice: 'SI-1042',
  customerName: 'Lina Haddad',
  movesStock: true,
  total: 320,
  outstanding: 200,
  paid: 120,
  lines: [
    {
      row: 'tree',
      code: 'OLV-20',
      name: 'Olive tree',
      uom: 'Unit',
      sold: 2,
      returnable: 2,
      rate: 85,
      warehouse: 'main',
      isStock: true,
    },
    {
      row: 'visit',
      code: 'SRV-GARDEN',
      name: 'Garden consultation',
      uom: 'Visit',
      sold: 1,
      returnable: 0,
      rate: 150,
      warehouse: null,
      isStock: false,
    },
  ],
};
const RESULT = { name: 'SI-1050', credit: 85, dueAfter: 115 };

function setup() {
  const api = {
    source: vi.fn().mockResolvedValue(SOURCE),
    confirm: vi.fn(),
    find: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SalesReturnApiService, useValue: api },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'RN', currency: 'ILS' }) },
      },
      {
        provide: WarehouseDirectoryService,
        useValue: {
          list: () =>
            Promise.resolve([
              { id: 'shop', name: 'Garden shop' },
              { id: 'main', name: 'Main warehouse' },
            ]),
        },
      },
    ],
  });
  const store = TestBed.inject(SalesReturnStore);
  store.start('SI-1042');
  return { store, api };
}

describe('SalesReturnStore', () => {
  it('suggests one of the first open row, back to the warehouse it left', async () => {
    const { store } = setup();
    await store.load();
    expect(store.openLines().map((l) => l.row)).toEqual(['tree']);
    expect([store.warehouse(), store.qtyInputs(), store.credit()]).toEqual([
      'main',
      { tree: '1' },
      85,
    ]);
    store.setQty('tree', '3');
    expect(store.ready()).toBe(false);
  });

  it('confirms once for a double tap, with the reason and only the rows returning something', async () => {
    const { store, api } = setup();
    await store.load();
    store.setReason('Customer changed order');
    api.confirm.mockResolvedValue(RESULT);
    const first = store.confirm();
    void store.confirm();
    await first;
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(api.confirm.mock.calls[0][0]).toMatchObject({
      invoice: 'SI-1042',
      currency: 'ILS',
      warehouse: 'main',
      reason: 'Customer changed order',
      lines: [{ row: 'tree', qty: 1 }],
    });
    expect([store.state(), store.result()]).toEqual(['confirmed', RESULT]);
  });

  it('remembers a left-behind draft per invoice, since selling roles can’t delete it', async () => {
    const { store, api } = setup();
    await store.load();
    api.confirm.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('SI-LEFT');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    store.start('SI-2');
    expect(store.draft()).toBeNull();
    store.start('SI-1042');
    expect(store.draft()).toBe('SI-LEFT');
  });

  it('blocks a second try until reload when returned elsewhere, and checks an unresolved one once it gave up', async () => {
    const { store, api } = setup();
    await store.load();
    api.confirm.mockRejectedValueOnce(new ReturnChangedError());
    await store.confirm();
    store.setQty('tree', '1');
    expect([store.failure(), store.ready()]).toEqual(['changed', false]);

    store.start('SI-1042');
    await store.load();
    api.confirm.mockRejectedValueOnce(new UnresolvedError());
    await store.confirm();
    store.resume('SI-1042');
    expect(store.state()).toBe('unresolved');
    api.find.mockResolvedValue({ result: RESULT });
    expect(await store.checkResult()).toBe('found');
    expect(store.result()).toEqual(RESULT);
  });
});
