import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { BusinessService } from '../../../core/business/business.service';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { CountStore, DamageStore } from './adjust.store';
import { InventoryApiService, StockMovedError } from './inventory-api.service';
import { AdjustResult, StockItem } from './inventory.models';

const MAIN = 'Main - RN';
const SHOP = 'Shop - RN';
const OLIVE: StockItem = {
  code: 'OLV-20',
  name: 'Olive tree',
  uom: 'Unit',
  stock: { [MAIN]: 22, [SHOP]: 8 },
  low: false,
};
const RESULT: AdjustResult = {
  entry: 'MAT-STE-9',
  postingDate: '2026-10-18',
  postingTime: '10:00:00',
  warehouseQty: 20,
  totalQty: 28,
};

function setup() {
  const api = {
    movableWarehouses: vi.fn().mockResolvedValue([
      { id: MAIN, name: 'Main warehouse' },
      { id: SHOP, name: 'Garden shop' },
    ]),
    item: vi.fn(async () => OLIVE),
    adjust: vi.fn().mockResolvedValue(RESULT),
    findAdjustment: vi.fn(),
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
  return { count: TestBed.inject(CountStore), damage: TestBed.inject(DamageStore), api };
}

describe('AdjustStore', () => {
  it('counts against the location shown, and needs a difference and a reason', async () => {
    const { count, api } = setup();
    count.start();
    await count.loadWarehouses();
    count.selectItem(OLIVE);
    expect(count.warehouse()).toBe(MAIN);
    count.qtyInput.set('7');
    count.setWarehouse(SHOP);
    expect(count.qtyInput()).toBe('');
    count.setWarehouse(MAIN);
    expect(count.reference()).toMatch(/^CNT-/);
    count.qtyInput.set('22');
    expect(count.change()).toBe(0);
    expect(count.ready()).toBe(false);
    count.qtyInput.set('٢٠');
    count.reason.set('Physical count');
    expect(count.change()).toBe(-2);
    expect(count.ready()).toBe(true);
    await count.confirm();
    expect(api.adjust.mock.calls[0][0]).toMatchObject({
      kind: 'count',
      warehouse: MAIN,
      systemQty: 22,
      qty: 20,
      damageType: null,
      reason: 'Physical count',
    });
    expect(count.state()).toBe('confirmed');
    expect(count.result()).toEqual(RESULT);
  });

  it('caps a write-off at what the location holds, and keeps its type', async () => {
    const { damage, api } = setup();
    damage.start();
    await damage.loadWarehouses();
    damage.selectItem(OLIVE, SHOP);
    damage.reason.set('Broken stem');
    damage.qtyInput.set('9');
    expect(damage.qtyValid()).toBe(false);
    damage.qtyInput.set('0');
    expect(damage.qtyValid()).toBe(false);
    damage.qtyInput.set('1');
    damage.damageType.set('expired');
    expect(damage.change()).toBe(-1);
    await damage.confirm();
    expect(api.adjust.mock.calls[0][0]).toMatchObject({
      kind: 'damage',
      warehouse: SHOP,
      qty: 1,
      damageType: 'expired',
    });
  });

  it('shows the new quantity when stock moved since it was read', async () => {
    const { count, api } = setup();
    count.start();
    await count.loadWarehouses();
    count.selectItem(OLIVE);
    count.qtyInput.set('20');
    count.reason.set('Physical count');
    api.adjust.mockRejectedValueOnce(new StockMovedError(21));
    await count.confirm();
    expect(count.failure()).toBe('moved');
    expect(count.onHand()).toBe(21);
    // Counted again before it can be posted: the old count isn't posted against the new figure.
    expect(count.qtyInput()).toBe('');
    expect(count.ready()).toBe(false);
  });

  it('checks only once a lost answer gave up, and finds the posted adjustment', async () => {
    const { damage, api } = setup();
    damage.start();
    await damage.loadWarehouses();
    damage.selectItem(OLIVE, SHOP);
    damage.qtyInput.set('1');
    damage.reason.set('Broken stem');
    api.adjust.mockRejectedValueOnce(new UnresolvedError());
    await damage.confirm();
    expect(damage.state()).toBe('unresolved');
    expect(damage.busy()).toBe(true);
    damage.resume();
    expect(damage.qtyInput()).toBe('1');
    api.findAdjustment.mockResolvedValueOnce(RESULT);
    expect(await damage.checkResult()).toBe('found');
    expect(damage.state()).toBe('confirmed');
  });

  it('maps refusals to what the user can do about them', async () => {
    const { damage, api } = setup();
    damage.start();
    await damage.loadWarehouses();
    damage.selectItem(OLIVE, SHOP);
    damage.qtyInput.set('1');
    damage.reason.set('Broken stem');
    api.adjust.mockRejectedValueOnce(new HttpErrorResponse({ status: 403 }));
    await damage.confirm();
    expect(damage.failure()).toBe('permission');
    api.adjust.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 417, error: { exc_type: 'NegativeStockError' } }),
    );
    api.item.mockResolvedValueOnce({ ...OLIVE, stock: { ...OLIVE.stock, [SHOP]: 2 } });
    await damage.confirm();
    expect(damage.failure()).toBe('stock');
    // The form checks the quantity against what the location holds now.
    await vi.waitFor(() => expect(damage.onHand()).toBe(2));
  });

  it('starts over on a fresh visit, deleting a draft a failed try left', async () => {
    const { count, api } = setup();
    count.start();
    count.draft.set('MAT-STE-3');
    count.qtyInput.set('5');
    count.resume();
    expect(api.discard).toHaveBeenCalledWith('MAT-STE-3');
    expect(count.qtyInput()).toBe('');
  });
});
