import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { BusinessService } from '../../../core/business/business.service';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { SiteBalance } from './project.models';
import { SiteApiService } from './site-api.service';
import { SiteStore } from './site.store';

const BALANCE: SiteBalance = {
  item: 'POT-30',
  itemName: 'Ceramic planter',
  uom: 'Unit',
  site: 'Project sites - RN',
  delivered: 8,
  consumed: 0,
  returned: 0,
  returnedTo: {},
  atSite: 8,
  pendingOrders: [],
  warehouses: [
    { warehouse: 'Main warehouse - RN', name: 'Main warehouse', qty: 0 },
    { warehouse: 'Garden shop - RN', name: 'Garden shop', qty: 3 },
  ],
  returnTo: 'Main warehouse - RN',
};

function setup(balance: () => Promise<SiteBalance | null> = () => Promise.resolve(BALANCE)) {
  const api = {
    balance: vi.fn(balance),
    post: vi.fn(),
    find: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SiteApiService, useValue: api },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }) },
      },
    ],
  });
  return { store: TestBed.inject(SiteStore), api };
}

async function loaded(balance?: () => Promise<SiteBalance | null>) {
  const ctx = setup(balance);
  ctx.store.start('PROJ-0001', 'POT-30');
  await ctx.store.load();
  return ctx;
}

describe('SiteStore', () => {
  it('records use from the site, up to what the project holds there', async () => {
    const { store, api } = await loaded();
    store.setUse('9');
    expect(store.canUse()).toBe(false);
    store.setUse('5');
    api.post.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('STE-1');
      return 'STE-1';
    });
    await store.confirm();
    expect(api.post.mock.calls[0][0]).toEqual({
      reference: expect.stringMatching(/^USE-/),
      company: 'Rehan Nursery',
      project: 'PROJ-0001',
      item: 'POT-30',
      uom: 'Unit',
      qty: 5,
      site: 'Project sites - RN',
      to: null,
    });
    // The balance moved: it is read again, not shown stale.
    expect([store.state(), store.used(), store.balance()]).toEqual(['confirmed', 5, null]);
  });

  it('then returns unused stock under a new reference, to the warehouse it came from', async () => {
    const { store, api } = await loaded();
    store.setUse('5');
    api.post.mockResolvedValue('STE-1');
    await store.confirm();
    const used = store.reference();
    store.resultShown.set(true);
    store.toReturn();
    await store.load();
    expect([store.action(), store.state(), store.returnTo()]).toEqual([
      'return',
      'idle',
      'Main warehouse - RN',
    ]);
    expect(store.reference()).not.toBe(used);
    store.setReturn('2');
    api.post.mockResolvedValue('STE-2');
    await store.confirm();
    expect(api.post.mock.calls[1][0]).toMatchObject({
      reference: expect.stringMatching(/^RET-/),
      qty: 2,
      to: 'Main warehouse - RN',
    });
    expect(store.result()).toBe('STE-2');
  });

  it('says there is no site stock before any project was supplied', async () => {
    const { store } = await loaded(() => Promise.resolve(null));
    expect([store.siteMissing(), store.balance()]).toEqual([true, null]);
  });

  it('keeps an unresolved posting through a fresh visit, and finds it by reference', async () => {
    const { store, api } = await loaded();
    store.setUse('5');
    api.post.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    store.resume('PROJ-0001', 'POT-30');
    expect(store.state()).toBe('unresolved');
    api.find.mockResolvedValue({ entry: 'STE-1' });
    expect(await store.checkResult()).toBe('found');
    expect(api.find).toHaveBeenCalledWith(store.reference());
  });

  it("won't look the result up while the posting is still running", async () => {
    const { store, api } = await loaded();
    store.setUse('5');
    api.post.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(await store.checkResult()).toBe('pending');
    expect(api.find).not.toHaveBeenCalled();
  });

  it('asks for a reload after ERPNext refuses, and deletes the draft it left', async () => {
    const { store, api } = await loaded();
    store.setUse('5');
    api.post.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('STE-1');
      throw new HttpErrorResponse({ status: 417, error: { exc_type: 'NegativeStockError' } });
    });
    await store.confirm();
    store.setUse('4');
    expect([store.failure(), store.canUse()]).toEqual(['stock', false]);
    await store.reload();
    expect(api.discard).toHaveBeenCalledWith('STE-1');
    expect([store.failure(), store.canUse()]).toEqual([null, true]);
  });

  it('drops a slow balance for a task that has started over', async () => {
    let answer: (b: SiteBalance) => void = () => undefined;
    const { store } = setup(() => new Promise((resolve) => (answer = resolve)));
    store.start('PROJ-0001', 'POT-30');
    const slow = store.load();
    await new Promise((resolve) => setTimeout(resolve));
    store.start('PROJ-0002', 'POT-30');
    answer(BALANCE);
    await slow;
    expect(store.balance()).toBeNull();
  });

  it('drops a balance whose load began before the task started over, even while the business was loading', async () => {
    let business: (b: { name: string; currency: string }) => void = () => undefined;
    const api = {
      balance: vi.fn().mockResolvedValue(BALANCE),
      post: vi.fn(),
      find: vi.fn(),
      discard: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SiteApiService, useValue: api },
        {
          provide: BusinessService,
          useValue: { ensure: () => new Promise((r) => (business = r)) },
        },
      ],
    });
    const store = TestBed.inject(SiteStore);
    store.start('PROJ-0001', 'POT-30');
    const slow = store.load();
    store.start('PROJ-0001', 'SOIL');
    business({ name: 'Rehan Nursery', currency: 'ILS' });
    await slow;
    expect([store.item(), store.balance()]).toEqual(['SOIL', null]);
  });

  it('forgets a shown use once a new use starts, so a later return is not titled "Usage recorded"', async () => {
    const { store, api } = await loaded();
    store.setUse('5');
    api.post.mockResolvedValue('STE-1');
    await store.confirm();
    store.resultShown.set(true);
    store.toReturn();
    expect(store.used()).toBe(5);
    store.toUse();
    store.toReturn();
    expect(store.used()).toBeNull();
  });
});
