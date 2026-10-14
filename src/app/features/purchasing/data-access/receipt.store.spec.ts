import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { BusinessService } from '../../../core/business/business.service';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { WarehouseDirectoryService } from '../../../core/stock/warehouse-directory.service';
import { PurchaseApiService } from './purchase-api.service';
import { OrderDetail, OrderLineDetail } from './purchase.models';
import { ReceiptStore } from './receipt.store';

const LINE: OrderLineDetail = {
  row: 'row-1',
  code: 'POT-30',
  name: 'Ceramic planter',
  uom: 'Unit',
  qty: 10,
  receivedQty: 0,
  rate: 45,
  amount: 450,
  billedAmount: 0,
  warehouse: 'Main warehouse - RN',
};

const ORDER: OrderDetail = {
  name: 'PO-2048',
  supplier: 'Green Clay',
  supplierName: 'Green Clay',
  date: '2026-10-11',
  currency: 'ILS',
  total: 450,
  progress: 'awaitingReceipt',
  orderedQty: 10,
  receivedQty: 0,
  lines: [LINE],
};

function setup(order: OrderDetail = ORDER) {
  const api = {
    order: vi.fn().mockResolvedValue(order),
    receive: vi.fn(),
    findReceipt: vi.fn(),
    discardReceipt: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: PurchaseApiService, useValue: api },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }) },
      },
      {
        provide: WarehouseDirectoryService,
        useValue: {
          list: () =>
            Promise.resolve([
              { id: 'Garden shop - RN', name: 'Garden shop' },
              { id: 'Main warehouse - RN', name: 'Main warehouse' },
            ]),
        },
      },
    ],
  });
  return { store: TestBed.inject(ReceiptStore), api };
}

async function loaded(order: OrderDetail = ORDER) {
  const ctx = setup(order);
  ctx.store.start(order.name);
  await ctx.store.load();
  return ctx;
}

describe('ReceiptStore', () => {
  it('suggests receiving everything still open into the warehouse the order expects', async () => {
    const { store } = await loaded({
      ...ORDER,
      lines: [
        { ...LINE, receivedQty: 6 },
        { ...LINE, row: 'row-2', receivedQty: 10 },
      ],
    });
    expect(store.warehouse()).toBe('Main warehouse - RN');
    expect(store.openLines().map((l) => l.row)).toEqual(['row-1']);
    expect(store.qtyInputs()).toEqual({ 'row-1': '4' });
    expect(store.ready()).toBe(true);
  });

  it('accepts only quantities from zero to what is still open, with something to receive', async () => {
    const { store } = await loaded();
    store.setQty('row-1', '11');
    expect(store.ready()).toBe(false);
    store.setQty('row-1', '0');
    expect(store.ready()).toBe(false);
    store.setQty('row-1', 'x');
    expect(store.ready()).toBe(false);
    store.setQty('row-1', '6');
    expect([store.ready(), store.receivingNow()]).toEqual([true, 6]);
  });

  it('posts only the rows receiving something and remembers the inserted draft', async () => {
    const { store, api } = await loaded({
      ...ORDER,
      lines: [LINE, { ...LINE, row: 'row-2', code: 'SOIL' }],
    });
    store.setQty('row-1', '6');
    store.setQty('row-2', '0');
    store.setWarehouse('Garden shop - RN');
    api.receive.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('MAT-PRE-0001');
      return 'MAT-PRE-0001';
    });
    await store.confirm();
    expect(api.receive.mock.calls[0][0]).toEqual({
      reference: store.reference(),
      order: 'PO-2048',
      warehouse: 'Garden shop - RN',
      lines: [{ row: 'row-1', qty: 6 }],
    });
    expect(store.draft()).toBe('MAT-PRE-0001');
    expect([store.state(), store.result()]).toEqual(['confirmed', 'MAT-PRE-0001']);
  });

  it('ignores a second tap while confirming', async () => {
    const { store, api } = await loaded();
    api.receive.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await store.confirm();
    expect(api.receive).toHaveBeenCalledTimes(1);
  });

  it('keeps an unresolved receipt through a fresh visit, and finds it by reference', async () => {
    const { store, api } = await loaded();
    api.receive.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    expect(store.state()).toBe('unresolved');
    store.resume('PO-2048');
    expect(store.order()).not.toBeNull();
    api.findReceipt.mockResolvedValue({ receipt: 'MAT-PRE-0001' });
    expect(await store.checkResult()).toBe('found');
    expect(api.findReceipt).toHaveBeenCalledWith(store.reference());
    expect(store.result()).toBe('MAT-PRE-0001');
  });

  it('returns to the form with the draft when the check finds only a draft', async () => {
    const { store, api } = await loaded();
    api.receive.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    api.findReceipt.mockResolvedValue({ draft: 'MAT-PRE-0001' });
    expect(await store.checkResult()).toBe('not-found');
    expect([store.draft(), store.state()]).toEqual(['MAT-PRE-0001', 'idle']);
  });

  it('starts a new reference when an earlier receipt with other quantities was already posted', async () => {
    const { store, api } = await loaded();
    const first = store.reference();
    store.draft.set('MAT-PRE-0001');
    api.receive.mockRejectedValue(new PostedEarlierError('MAT-PRE-0001'));
    await store.confirm();
    expect(store.failure()).toBe('changed');
    expect(store.draft()).toBeNull();
    expect(store.reference()).not.toBe(first);
  });

  it('deletes a leftover draft when the task starts over, even after an edit cleared the failure', async () => {
    const { store, api } = await loaded();
    api.receive.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('MAT-PRE-0001');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    expect(store.failure()).toBe('error');
    store.setQty('row-1', '5');
    store.start('PO-2048');
    expect(api.discardReceipt).toHaveBeenCalledWith('MAT-PRE-0001');
  });

  it('keeps a posted receipt in ERPNext and shows it once before starting over', async () => {
    const { store, api } = await loaded();
    api.receive.mockResolvedValue('MAT-PRE-0001');
    await store.confirm();
    store.resume('PO-2048');
    expect(store.result()).toBe('MAT-PRE-0001');
    store.resultShown.set(true);
    store.resume('PO-2048');
    expect(store.result()).toBeNull();
    expect(api.discardReceipt).not.toHaveBeenCalled();
  });

  it("doesn't apply an order that loads after the task started over", async () => {
    const { store, api } = setup();
    let finish!: (order: OrderDetail) => void;
    api.order.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    store.start('PO-2048');
    const loading = store.load();
    await new Promise((resolve) => setTimeout(resolve));
    store.start('PO-2049');
    finish(ORDER);
    await loading;
    expect(store.order()).toBeNull();
  });

  it('names a permission failure', async () => {
    const { store, api } = await loaded();
    api.receive.mockRejectedValue(new HttpErrorResponse({ status: 403 }));
    await store.confirm();
    expect([store.state(), store.failure()]).toEqual(['failed', 'permission']);
  });

  it("won't look the result up while the confirmation is still running", async () => {
    const { store, api } = await loaded();
    api.receive.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(await store.checkResult()).toBe('pending');
    expect(api.findReceipt).not.toHaveBeenCalled();
    expect(store.state()).toBe('confirming');
  });

  it('pre-fills and accepts the open quantity without floating-point error', async () => {
    const { store } = await loaded({ ...ORDER, lines: [{ ...LINE, qty: 1, receivedQty: 0.9 }] });
    expect(store.qtyInputs()).toEqual({ 'row-1': '0.1' });
    store.setQty('row-1', '0.1');
    expect(store.ready()).toBe(true);
  });

  it('offers nothing to receive on an order that is on hold, closed or cancelled', async () => {
    for (const progress of ['onHold', 'closed', 'cancelled'] as const) {
      TestBed.resetTestingModule();
      const { store } = await loaded({ ...ORDER, progress });
      expect(store.openLines()).toEqual([]);
      expect(store.ready()).toBe(false);
    }
  });
});
