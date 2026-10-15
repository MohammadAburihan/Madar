import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { BusinessService } from '../../../core/business/business.service';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { SupplyPlan } from './project.models';
import { SiteWarehouseMissingError } from './projects-api.service';
import { SupplyApiService } from './supply-api.service';
import { SupplyStore } from './supply.store';

const PLAN: SupplyPlan = {
  item: 'POT-30',
  itemName: 'Ceramic planter',
  uom: 'Unit',
  site: 'Project sites - RN',
  need: 12,
  requestRows: [{ request: 'MR-1', row: 'r1', open: 12 }],
  atSite: 0,
  sources: [
    { warehouse: 'Main warehouse - RN', name: 'Main warehouse', qty: 8 },
    { warehouse: 'Garden shop - RN', name: 'Garden shop', qty: 3 },
  ],
  pendingOrders: [],
};

function setup(plan: () => Promise<SupplyPlan> = () => Promise.resolve(PLAN)) {
  const api = {
    plan: vi.fn(plan),
    deliver: vi.fn(),
    find: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SupplyApiService, useValue: api },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }) },
      },
    ],
  });
  return { store: TestBed.inject(SupplyStore), api };
}

async function loaded(plan?: () => Promise<SupplyPlan>) {
  const ctx = setup(plan);
  ctx.store.start('PROJ-0001', 'POT-30');
  await ctx.store.load();
  return ctx;
}

describe('SupplyStore', () => {
  it('suggests sending what the warehouse with the most holds, up to the need, and the shortfall to buy', async () => {
    const { store } = await loaded();
    expect([store.from(), store.qtyInput(), store.shortfall(), store.ready()]).toEqual([
      'Main warehouse - RN',
      '8',
      4,
      true,
    ]);
  });

  it('counts open purchase orders against the shortfall', async () => {
    const { store } = await loaded(() =>
      Promise.resolve({ ...PLAN, pendingOrders: [{ name: 'PO-2049', qty: 4 }] }),
    );
    expect(store.shortfall()).toBe(0);
  });

  it('allows no more than the source warehouse holds', async () => {
    const { store } = await loaded();
    store.setQty('9');
    expect(store.ready()).toBe(false);
    store.setFrom('Garden shop - RN');
    store.setQty('3');
    expect(store.ready()).toBe(true);
  });

  it('delivers from the source to the project site, linked to the open requests', async () => {
    const { store, api } = await loaded();
    api.deliver.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('STE-1');
      return 'STE-1';
    });
    await store.confirm();
    expect(api.deliver.mock.calls[0][0]).toEqual({
      reference: store.reference(),
      company: 'Rehan Nursery',
      project: 'PROJ-0001',
      item: 'POT-30',
      uom: 'Unit',
      qty: 8,
      from: 'Main warehouse - RN',
      site: 'Project sites - RN',
      requestRows: PLAN.requestRows,
    });
    expect([store.draft(), store.state(), store.result()]).toEqual(['STE-1', 'confirmed', 'STE-1']);
  });

  it('says the site warehouse is missing when this role cannot create it', async () => {
    const { store } = await loaded(() => Promise.reject(new SiteWarehouseMissingError()));
    expect([store.siteMissing(), store.plan()]).toEqual([true, null]);
  });

  it("won't look the result up while the confirmation is still running", async () => {
    const { store, api } = await loaded();
    api.deliver.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(await store.checkResult()).toBe('pending');
    expect(api.find).not.toHaveBeenCalled();
  });

  it('keeps an unresolved delivery through a fresh visit, and finds it by reference', async () => {
    const { store, api } = await loaded();
    api.deliver.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    store.resume('PROJ-0001', 'POT-30');
    expect(store.plan()).not.toBeNull();
    api.find.mockResolvedValue({ entry: 'STE-1' });
    expect(await store.checkResult()).toBe('found');
    expect(api.find).toHaveBeenCalledWith(store.reference());
  });

  it('starts a new reference when an earlier, different delivery was already posted', async () => {
    const { store, api } = await loaded();
    const first = store.reference();
    store.draft.set('STE-1');
    api.deliver.mockRejectedValue(new PostedEarlierError('STE-1'));
    await store.confirm();
    expect([store.failure(), store.draft()]).toEqual(['changed', null]);
    expect(store.reference()).not.toBe(first);
  });

  it('names a stock shortage and a permission failure', async () => {
    const { store, api } = await loaded();
    api.deliver.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 417, error: { exc_type: 'NegativeStockError' } }),
    );
    await store.confirm();
    expect(store.failure()).toBe('stock');
    store.start('PROJ-0001', 'POT-30');
    await store.load();
    api.deliver.mockRejectedValueOnce(new HttpErrorResponse({ status: 403 }));
    await store.confirm();
    expect(store.failure()).toBe('permission');
  });

  it('deletes a leftover draft when the task starts over, even after an edit cleared the failure', async () => {
    const { store, api } = await loaded();
    api.deliver.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('STE-1');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    store.setQty('5');
    store.start('PROJ-0001', 'POT-30');
    expect(api.discard).toHaveBeenCalledWith('STE-1');
  });

  it('asks for a reload after ERPNext refuses the delivery, instead of posting the same plan again', async () => {
    const { store, api } = await loaded();
    api.deliver.mockRejectedValueOnce(new HttpErrorResponse({ status: 417 }));
    await store.confirm();
    store.setQty('7');
    expect([store.failure(), store.ready()]).toEqual(['error', false]);
    store.start('PROJ-0001', 'POT-30');
    await store.load();
    expect(store.ready()).toBe(true);
  });
});
