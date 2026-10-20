import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { DraftUnavailableError } from '../../../core/erpnext/draft';
import { SupplierDirectoryService } from '../../../core/suppliers/supplier-directory.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { PurchaseApiService } from './purchase-api.service';
import { PurchaseItem } from './purchase.models';
import { PurchaseOrderStore } from './purchase-order.store';

const PLANTER: PurchaseItem = {
  code: 'POT-30',
  name: 'Ceramic planter',
  uom: 'Unit',
  kind: 'product',
  rate: 45,
};

function setup(capabilities = () => capabilitiesFor('owner')) {
  const api = {
    searchItems: vi.fn().mockResolvedValue([PLANTER]),
    item: vi.fn().mockResolvedValue(PLANTER),
    confirm: vi.fn(),
    saveDraft: vi.fn(),
    find: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
    draftOrder: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: PurchaseApiService, useValue: api },
      { provide: SessionService, useValue: { capabilities } },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }) },
      },
      {
        provide: SupplierDirectoryService,
        useValue: {
          list: () => Promise.resolve([{ id: 'Green Clay', name: 'Green Clay', city: 'Hebron' }]),
        },
      },
      {
        provide: SiteClockService,
        useValue: { ensure: () => Promise.resolve(), now: () => new Date(2026, 9, 14, 9, 41) },
      },
    ],
  });
  return { store: TestBed.inject(PurchaseOrderStore), api };
}

async function ready() {
  const ctx = setup();
  await ctx.store.loadSuppliers();
  ctx.store.setSupplier('Green Clay');
  ctx.store.addItem(PLANTER);
  ctx.store.setQty(0, 10);
  return ctx;
}

describe('PurchaseOrderStore', () => {
  it('keeps the order for a trip to add an item, once, and adds that item on return', async () => {
    const { store, api } = await ready();
    store.holdForNewItem();
    store.resume(true);
    expect(store.supplier()).toBe('Green Clay');
    expect(store.lines()).toHaveLength(1);
    const added: PurchaseItem = { ...PLANTER, code: 'NEW-1', name: 'New pot', rate: 12 };
    api.item.mockResolvedValueOnce(added);
    store.forProject('PROJ-1', 'POT-40', 5);
    store.queueNewItem('NEW-1');
    await store.applyAdded();
    // A project's queued item waits apart: the new item doesn't take its place.
    expect(store.prefill()).toEqual({ item: 'POT-40', qty: 5 });
    expect(store.lines().map((l) => [l.item.code, l.qty, l.rate])).toEqual([
      ['POT-30', 10, 45],
      ['NEW-1', 1, 12],
    ]);
    // The hold is spent: the next return without one, or any fresh visit, starts over.
    store.resume(true);
    expect(store.lines()).toEqual([]);
  });

  it('starts over on a fresh visit even after a hold', async () => {
    const { store } = await ready();
    store.holdForNewItem();
    store.resume();
    expect(store.supplier()).toBeNull();
  });

  it('adds an item at its buying price, and one more when added again', async () => {
    const { store } = await ready();
    store.addItem(PLANTER);
    expect(store.lines()).toEqual([{ item: PLANTER, qty: 11, rate: 45 }]);
    expect(store.total()).toBe(495);
    expect(store.supplierInfo()?.city).toBe('Hebron');
  });

  it('removes a line set to zero and is ready only with a supplier and lines', async () => {
    const { store } = await ready();
    expect(store.ready()).toBe(true);
    store.setQty(0, 0);
    expect(store.lines()).toEqual([]);
    expect(store.ready()).toBe(false);
  });

  it('confirms with the site date as Required By and remembers the inserted draft', async () => {
    const { store, api } = await ready();
    api.confirm.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('PO-2048');
      return 'PO-2048';
    });
    await store.confirm();
    expect(api.confirm.mock.calls[0][0]).toMatchObject({
      supplier: 'Green Clay',
      company: 'Rehan Nursery',
      scheduleDate: '2026-10-14',
      lines: [{ item: 'POT-30', uom: 'Unit', qty: 10, rate: 45 }],
    });
    expect(store.draft()).toBe('PO-2048');
    expect(store.state()).toBe('confirmed');
    expect(store.result()).toBe('PO-2048');
  });

  it('ignores a second tap while confirming', async () => {
    const { store, api } = await ready();
    api.confirm.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(api.confirm).toHaveBeenCalledTimes(1);
  });

  it('keeps an unresolved order to check, and finds it by reference', async () => {
    const { store, api } = await ready();
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    expect(store.state()).toBe('unresolved');
    store.resume();
    expect(store.lines().length).toBe(1);
    api.find.mockResolvedValue({ order: 'PO-2048' });
    expect(await store.checkResult()).toBe('found');
    expect(api.find).toHaveBeenCalledWith(store.reference());
    expect(store.result()).toBe('PO-2048');
  });

  it('returns to review with the draft when the check finds only a draft', async () => {
    const { store, api } = await ready();
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    api.find.mockResolvedValue({ draft: 'PO-2048' });
    expect(await store.checkResult()).toBe('not-found');
    expect(store.draft()).toBe('PO-2048');
    expect(store.state()).toBe('idle');
  });

  it('starts a new reference when an earlier, different version was already confirmed', async () => {
    const { store, api } = await ready();
    const first = store.reference();
    store.draft.set('PO-2048');
    api.confirm.mockRejectedValue(new PostedEarlierError('PO-2048'));
    await store.confirm();
    expect(store.failure()).toBe('changed');
    expect(store.draft()).toBeNull();
    expect(store.reference()).not.toBe(first);
  });

  it('deletes a draft a failed confirmation left behind when the task starts over', async () => {
    const { store, api } = await ready();
    api.confirm.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('PO-2049');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    store.start();
    expect(api.discard).toHaveBeenCalledWith('PO-2049');
  });

  it('still deletes a leftover draft when an edit cleared the failure before starting over', async () => {
    const { store, api } = await ready();
    api.confirm.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('PO-2049');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    store.setQty(0, 11);
    expect(store.state()).toBe('idle');
    store.start();
    expect(api.discard).toHaveBeenCalledWith('PO-2049');
  });

  it('sends the company currency with the order', async () => {
    const { store, api } = await ready();
    api.confirm.mockResolvedValue('PO-2048');
    await store.confirm();
    expect(api.confirm.mock.calls[0][0].currency).toBe('ILS');
  });

  it("doesn't attach a draft saved late to the order started since", async () => {
    const { store, api } = await ready();
    let finish!: (name: string) => void;
    api.saveDraft.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const saving = store.saveDraft();
    await new Promise((resolve) => setTimeout(resolve));
    store.start();
    finish('PO-2048');
    expect(await saving).toBeNull();
    expect(store.draft()).toBeNull();
  });

  it('names a permission failure', async () => {
    const { store, api } = await ready();
    api.confirm.mockRejectedValue(new HttpErrorResponse({ status: 403 }));
    await store.confirm();
    expect([store.state(), store.failure()]).toEqual(['failed', 'permission']);
  });

  it('saves a draft and keeps it for the next save or confirmation', async () => {
    const { store, api } = await ready();
    api.saveDraft.mockResolvedValue('PO-2048');
    expect(await store.saveDraft()).toBe('PO-2048');
    expect(store.draft()).toBe('PO-2048');
    await store.saveDraft();
    expect(api.saveDraft.mock.calls[1][1]).toBe('PO-2048');
  });

  it('keeps a saved draft in ERPNext when the task starts over, even after a failed confirmation', async () => {
    const { store, api } = await ready();
    api.saveDraft.mockResolvedValue('PO-2048');
    await store.saveDraft();
    api.confirm.mockRejectedValue(new HttpErrorResponse({ status: 417 }));
    await store.confirm();
    store.start();
    expect(api.discard).not.toHaveBeenCalled();
    expect(store.lines()).toEqual([]);
  });

  it('starts over on a fresh visit but keeps a confirmed order until it has been shown', async () => {
    const { store, api } = await ready();
    api.confirm.mockResolvedValue('PO-2048');
    await store.confirm();
    store.resume();
    expect(store.result()).toBe('PO-2048');
    store.resultShown.set(true);
    store.start();
    expect(store.result()).toBeNull();
  });

  it("won't look the result up while the confirmation is still running", async () => {
    const { store, api } = await ready();
    api.confirm.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(await store.checkResult()).toBe('pending');
    expect(api.find).not.toHaveBeenCalled();
    expect(store.state()).toBe('confirming');
  });

  it("books a project's shortfall: adds its item once a supplier is chosen, and the project to the order", async () => {
    const { store, api } = setup();
    await store.loadSuppliers();
    store.forProject('PROJ-0001', 'POT-30', 4);
    await store.applyPrefill();
    expect(store.lines()).toEqual([]);
    store.setSupplier('Green Clay');
    await store.applyPrefill();
    expect(store.lines()).toEqual([{ item: PLANTER, qty: 4, rate: 45 }]);
    await store.applyPrefill();
    expect(store.lines()).toHaveLength(1);
    api.confirm.mockResolvedValue('PO-2049');
    await store.confirm();
    expect(api.confirm.mock.calls[0][0].project).toBe('PROJ-0001');
  });

  it("prices the project's line for the supplier chosen last, even when an earlier search answers late", async () => {
    const { store, api } = setup();
    await store.loadSuppliers();
    store.forProject('PROJ-0001', 'POT-30', 4);
    let answerFirst: (item: PurchaseItem) => void = () => undefined;
    api.item
      .mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce({ ...PLANTER, rate: 40 });
    store.setSupplier('Green Clay');
    const first = store.applyPrefill();
    store.setSupplier('Blue Stone');
    await store.applyPrefill();
    answerFirst(PLANTER);
    await first;
    expect(store.lines()).toEqual([{ item: { ...PLANTER, rate: 40 }, qty: 4, rate: 40 }]);
  });

  it("looks the project's item up by its exact code, and says so when it can't be bought", async () => {
    const { store, api } = setup();
    await store.loadSuppliers();
    store.forProject('PROJ-0001', 'ITM-1', 4);
    api.item.mockResolvedValueOnce(null);
    store.setSupplier('Green Clay');
    await store.applyPrefill();
    expect(api.item.mock.calls[0][0]).toBe('ITM-1');
    expect(api.searchItems).not.toHaveBeenCalled();
    expect([store.lines(), store.prefillMissing()]).toEqual([[], 'ITM-1']);
  });
});

describe('PurchaseOrderStore.openDraft', () => {
  const DRAFT = {
    name: 'PO-DRAFT',
    reference: 'PUR-0A1B2C3',
    supplier: 'Green Clay',
    project: 'PROJ-1',
    lines: [{ item: PLANTER, qty: 10, rate: 40 }],
  };

  it('loads the draft with its own reference, name, supplier, project and typed rates', async () => {
    const { store, api } = setup();
    api.draftOrder.mockResolvedValue(DRAFT);

    expect(await store.openDraft('PO-DRAFT')).toBe('opened');

    expect(api.draftOrder).toHaveBeenCalledWith('PO-DRAFT', { company: 'Rehan Nursery' });
    expect([store.reference(), store.draft(), store.supplier(), store.project()]).toEqual([
      'PUR-0A1B2C3',
      'PO-DRAFT',
      'Green Clay',
      'PROJ-1',
    ]);
    expect(store.lines().map((l) => [l.item.code, l.qty, l.rate])).toEqual([['POT-30', 10, 40]]);
    expect(store.total()).toBe(400);
  });

  it('confirms the opened draft under its reference instead of inserting another order', async () => {
    const { store, api } = setup();
    api.draftOrder.mockResolvedValue(DRAFT);
    api.confirm.mockResolvedValue('PO-DRAFT');
    await store.openDraft('PO-DRAFT');

    await store.confirm();

    expect(api.confirm.mock.calls[0][0]).toMatchObject({ reference: 'PUR-0A1B2C3' });
    expect(api.confirm.mock.calls[0][1]).toBe('PO-DRAFT');
    expect(store.result()).toBe('PO-DRAFT');
  });

  it('is refused while a confirmation is open, and leaves that order alone', async () => {
    const { store, api } = await ready();
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    expect(await store.openDraft('PO-DRAFT')).toBe('busy');
    expect(api.draftOrder).not.toHaveBeenCalled();
    expect(store.lines()).toHaveLength(1);
  });

  it('keeps unsaved edits when the same draft is opened again', async () => {
    const { store, api } = setup();
    api.draftOrder.mockResolvedValue(DRAFT);
    await store.openDraft('PO-DRAFT');
    store.setQty(0, 3);
    expect(await store.openDraft('PO-DRAFT')).toBe('opened');
    expect(api.draftOrder).toHaveBeenCalledTimes(1);
    expect(store.lines()[0].qty).toBe(3);
  });

  it('refuses a role that cannot order from suppliers', async () => {
    const { store, api } = setup(() => capabilitiesFor('warehouse'));
    await expect(store.openDraft('PO-DRAFT')).rejects.toBeInstanceOf(DraftUnavailableError);
    expect(api.draftOrder).not.toHaveBeenCalled();
  });

  it('keeps a draft left by a failed confirmation when it is opened on purpose', async () => {
    const { store, api } = await ready();
    api.confirm.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('PO-DRAFT');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    api.draftOrder.mockResolvedValue(DRAFT);

    await store.openDraft('PO-DRAFT');

    expect(api.discard).not.toHaveBeenCalled();
    expect(store.draft()).toBe('PO-DRAFT');
  });

  it('keeps the draft it is already holding when that draft is opened on purpose', async () => {
    const { store, api } = await ready();
    api.confirm.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('PO-DRAFT');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();

    expect(await store.openDraft('PO-DRAFT')).toBe('opened');
    store.start();

    expect(api.discard).not.toHaveBeenCalled();
  });

  it('is refused while the last result is not yet shown', async () => {
    const { store, api } = await ready();
    api.confirm.mockResolvedValue('PO-1');
    await store.confirm();

    expect(await store.openDraft('PO-DRAFT')).toBe('busy');

    expect(api.draftOrder).not.toHaveBeenCalled();
    expect(store.result()).toBe('PO-1');
  });

  it('leaves the task alone when the draft is not available', async () => {
    const { store, api } = await ready();
    api.draftOrder.mockRejectedValue(new DraftUnavailableError('PO-X'));
    await expect(store.openDraft('PO-X')).rejects.toBeInstanceOf(DraftUnavailableError);
    expect(store.lines()).toHaveLength(1);
  });

  it('removes a line whatever its quantity and keeps the supplier', async () => {
    const { store } = await ready();
    const supplier = store.supplierInfo();

    store.removeLine(0);

    expect([store.lines(), store.ready()]).toEqual([[], false]);
    expect(store.supplierInfo()).toEqual(supplier);
  });
});
