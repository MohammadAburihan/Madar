import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { BusinessService } from '../../../core/business/business.service';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { InventoryApiService } from './inventory-api.service';
import { StockItem, TransferResult } from './inventory.models';
import { TransferStore } from './transfer.store';

const MAIN = 'Main - RN';
const SHOP = 'Shop - RN';
const STORES = 'Stores - RN';

const OLIVE: StockItem = {
  code: 'OLV-20',
  name: 'Olive tree',
  uom: 'Unit',
  stock: { [MAIN]: 24, [SHOP]: 6 },
  low: false,
};
const RESULT: TransferResult = {
  entry: 'MAT-STE-1',
  postingDate: '2026-10-14',
  postingTime: '09:41:00',
  fromQty: 22,
  toQty: 8,
  totalQty: 30,
};

function setup() {
  const api = {
    warehouses: vi.fn().mockResolvedValue([
      { id: STORES, name: 'Stores' },
      { id: MAIN, name: 'Main warehouse' },
      { id: SHOP, name: 'Garden shop' },
    ]),
    searchItems: vi.fn().mockResolvedValue([OLIVE]),
    item: vi.fn(async (code: string) => (code === OLIVE.code ? OLIVE : null)),
    transfer: vi.fn(),
    find: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: InventoryApiService, useValue: api },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }) },
      },
    ],
  });
  return { store: TestBed.inject(TransferStore), api };
}

async function ready(qty = '2') {
  const ctx = setup();
  await ctx.store.loadWarehouses();
  ctx.store.selectItem(OLIVE);
  ctx.store.qtyInput.set(qty);
  return ctx;
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('TransferStore', () => {
  it('moves from where the item has the most stock to the next location holding it', async () => {
    const { store } = await ready();
    expect(store.from()).toBe(MAIN);
    expect(store.to()).toBe(SHOP);
    expect(store.available()).toBe(24);
    expect(store.total()).toBe(30);
  });

  it('falls back to the first other location when only one holds the item', async () => {
    const { store } = setup();
    await store.loadWarehouses();
    store.selectItem({ ...OLIVE, stock: { [SHOP]: 5 } });
    expect(store.from()).toBe(SHOP);
    expect(store.to()).toBe(STORES);
  });

  it('moves the destination away when the source is set to it', async () => {
    const { store } = await ready();
    store.setFrom(SHOP);
    expect(store.from()).toBe(SHOP);
    expect(store.to()).toBe(STORES);
    store.setTo(MAIN);
    expect(store.to()).toBe(MAIN);
  });

  it('accepts whole quantities above zero up to what the source holds, in either digit set', async () => {
    const { store } = await ready();
    const valid = (input: string) => {
      store.qtyInput.set(input);
      return store.qtyValid();
    };
    expect(valid('2')).toBe(true);
    expect(valid('٢٤')).toBe(true);
    expect(valid('25')).toBe(false);
    expect(valid('0')).toBe(false);
    expect(valid('1.5')).toBe(false);
    expect(valid('')).toBe(false);
    expect(valid('abc')).toBe(false);
  });

  it('is ready only with an item, two different locations and a valid quantity', async () => {
    const { store } = await ready();
    expect(store.ready()).toBe(true);
    store.to.set(MAIN);
    expect(store.ready()).toBe(false);
    store.to.set(SHOP);
    store.qtyInput.set('99');
    expect(store.ready()).toBe(false);
  });

  it('confirms the transfer and keeps what was sent', async () => {
    const { store, api } = await ready();
    api.transfer.mockResolvedValue(RESULT);
    await store.confirm();

    expect(api.transfer.mock.calls[0][0]).toEqual({
      reference: store.reference(),
      company: 'Rehan Nursery',
      item: 'OLV-20',
      uom: 'Unit',
      qty: 2,
      from: MAIN,
      to: SHOP,
    });
    expect(store.reference()).toMatch(/^TRF-/);
    expect(store.state()).toBe('confirmed');
    expect(store.result()).toEqual(RESULT);
    expect(store.sent()?.qty).toBe(2);
  });

  it('does nothing when the transfer is incomplete', async () => {
    const { store, api } = await ready('0');
    await store.confirm();
    expect(api.transfer).not.toHaveBeenCalled();
    expect(store.state()).toBe('idle');
  });

  it('marks a timed-out confirmation unresolved and busy', async () => {
    const { store, api } = await ready();
    api.transfer.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    expect(store.state()).toBe('unresolved');
    expect(store.busy()).toBe(true);
  });

  it('classifies failures', async () => {
    const { store, api } = await ready();
    const cases: [unknown, string][] = [
      [new HttpErrorResponse({ status: 403 }), 'permission'],
      [new HttpErrorResponse({ status: 0 }), 'offline'],
      [
        // Mentions stock but isn't a shortage: the user mustn't be told to lower the quantity.
        new HttpErrorResponse({
          status: 417,
          error: { message: 'Stock transactions before 2026-01-01 are frozen' },
        }),
        'error',
      ],
      [
        // ERPNext's real shortage response: the class in exc_type, wording without "stock".
        new HttpErrorResponse({
          status: 417,
          error: {
            exc_type: 'NegativeStockError',
            _server_messages: JSON.stringify([
              JSON.stringify({ message: '3 units of Olive tree needed in Main warehouse.' }),
            ]),
          },
        }),
        'stock',
      ],
      [new HttpErrorResponse({ status: 500 }), 'error'],
    ];
    for (const [error, failure] of cases) {
      api.transfer.mockRejectedValueOnce(error);
      await store.confirm();
      expect(store.state()).toBe('failed');
      expect(store.failure()).toBe(failure);
    }
  });

  it('reports an earlier, different posted move and starts a fresh reference for a new one', async () => {
    const { store, api } = await ready();
    const reference = store.reference();
    store.draft.set('MAT-STE-1');
    api.transfer.mockRejectedValueOnce(new PostedEarlierError('MAT-STE-1'));
    await store.confirm();
    expect(store.failure()).toBe('changed');
    expect(store.draft()).toBeNull();
    expect(store.reference()).not.toBe(reference);
  });

  it('clears a failure when the transfer changes', async () => {
    const { store, api } = await ready();
    api.transfer.mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }));
    await store.confirm();
    store.setTo(STORES);
    expect(store.state()).toBe('idle');
    expect(store.failure()).toBeNull();
  });

  it('ignores a second confirm while the first is running', async () => {
    const { store, api } = await ready();
    let finish!: (result: TransferResult) => void;
    api.transfer.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const first = store.confirm();
    const second = store.confirm();
    await tick();
    finish(RESULT);
    await Promise.all([first, second]);
    expect(api.transfer).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft a rejected confirmation inserted, so a retry submits it', async () => {
    const { store, api } = await ready();
    api.transfer.mockImplementationOnce(async (_r, _d, onInserted: (name: string) => void) => {
      onInserted('MAT-STE-5');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    expect(store.draft()).toBe('MAT-STE-5');
    api.transfer.mockResolvedValue(RESULT);
    await store.confirm();
    expect(api.transfer.mock.calls[1][1]).toBe('MAT-STE-5');
  });

  it('checks an unresolved result: draft, not found, pending or found', async () => {
    const { store, api } = await ready();
    api.transfer.mockRejectedValue(new UnresolvedError());
    await store.confirm();

    api.find.mockResolvedValueOnce({ draft: 'MAT-STE-7' });
    expect(await store.checkResult()).toBe('not-found');
    expect(store.draft()).toBe('MAT-STE-7');
    expect(store.state()).toBe('idle');

    store.state.set('unresolved');
    api.find.mockResolvedValueOnce('not-found');
    expect(await store.checkResult()).toBe('not-found');

    store.state.set('unresolved');
    api.find.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    expect(await store.checkResult()).toBe('pending');
    expect(store.state()).toBe('unresolved');

    api.find.mockResolvedValueOnce(RESULT);
    expect(await store.checkResult()).toBe('found');
    expect(store.state()).toBe('confirmed');
    expect(api.find.mock.calls[0][0].reference).toBe(store.reference());
  });

  it('has nothing to check before anything was sent', async () => {
    const { store, api } = setup();
    expect(await store.checkResult()).toBe('not-found');
    expect(api.find).not.toHaveBeenCalled();
  });

  it('deletes the draft a failed confirmation left when starting over', async () => {
    const { store, api } = await ready();
    api.transfer.mockImplementationOnce(async (_r, _d, onInserted: (name: string) => void) => {
      onInserted('MAT-STE-5');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    const reference = store.reference();
    store.start();
    expect(api.discard).toHaveBeenCalledWith('MAT-STE-5');
    expect(store.reference()).not.toBe(reference);
    expect(store.item()).toBeNull();
    expect(store.draft()).toBeNull();
    expect(store.sent()).toBeNull();
  });

  it('restarts a half-done transfer when the task is entered again', async () => {
    const { store } = await ready();
    store.resume();
    expect(store.item()).toBeNull();
    expect(store.qtyInput()).toBe('');
  });

  it('keeps a running, unresolved or recorded transfer when the task is entered again', async () => {
    const { store, api } = await ready();
    let finish!: (result: TransferResult) => void;
    api.transfer.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const running = store.confirm();
    await tick();
    const reference = store.reference();
    store.resume();
    expect(store.reference()).toBe(reference);
    finish(RESULT);
    await running;
    store.resume();
    expect(store.result()).toEqual(RESULT);

    store.start();
    store.selectItem(OLIVE);
    store.qtyInput.set('1');
    api.transfer.mockRejectedValueOnce(new UnresolvedError());
    await store.confirm();
    const unresolved = store.reference();
    store.resume();
    expect(store.reference()).toBe(unresolved);
    expect(store.state()).toBe('unresolved');
  });

  it('drops the outcome of a confirmation whose transfer was replaced', async () => {
    const { store, api } = await ready();
    let finish!: (result: TransferResult) => void;
    api.transfer.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const running = store.confirm();
    await tick();
    store.state.set('idle');
    store.start();
    finish(RESULT);
    await running;
    expect(store.result()).toBeNull();
    expect(store.state()).toBe('idle');
  });

  it('opens a deep-linked item by code', async () => {
    const { store, api } = setup();
    await store.loadWarehouses();
    await store.openItem('OLV-20');
    expect(api.item).toHaveBeenCalledWith('OLV-20', [STORES, MAIN, SHOP]);
    expect(store.item()).toEqual(OLIVE);

    store.item.set(null);
    await store.openItem('NOPE');
    expect(store.item()).toBeNull();
  });

  it("won't look the result up while the confirmation is still running", async () => {
    const { store, api } = await ready();
    api.transfer.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(await store.checkResult()).toBe('pending');
    expect(api.find).not.toHaveBeenCalled();
    expect(store.state()).toBe('confirming');
  });
});
