import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { DraftUnavailableError } from '../../../core/erpnext/draft';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { QuotationApiService } from './quotation-api.service';
import { QuotationStore } from './quotation.store';
import { CatalogItem } from './sale.models';

const PLANTER: CatalogItem = {
  code: 'POT-30',
  name: 'Ceramic planter',
  uom: 'Unit',
  isStock: true,
  price: 45,
  stock: {},
};

function setup(user: { id: string } | null = { id: 'lina@example.com' }) {
  const api = {
    confirm: vi.fn(),
    saveDraft: vi.fn(),
    find: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
    draftQuotation: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: QuotationApiService, useValue: api },
      {
        provide: SessionService,
        useValue: { persona: () => 'salesperson', user: () => user },
      },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }) },
      },
      {
        provide: SiteClockService,
        useValue: { ensure: () => Promise.resolve(), now: () => new Date(2026, 9, 16, 9, 0) },
      },
    ],
  });
  return { store: TestBed.inject(QuotationStore), api };
}

async function ready() {
  const ctx = setup();
  ctx.store.start();
  await new Promise((resolve) => setTimeout(resolve));
  ctx.store.setCustomer({ id: 'Lina Haddad', name: 'Lina Haddad', meta: null });
  ctx.store.addItem(PLANTER);
  ctx.store.addItem(PLANTER);
  return ctx;
}

const draftDetail = (name: string) => ({
  name,
  customer: 'Lina Haddad',
  customerName: 'Lina Haddad',
  forCustomer: true,
  docstatus: 0,
  status: 'Draft',
  date: '2026-10-16',
  validTill: '2026-10-30',
  total: 45,
  lines: [
    {
      code: 'POT-30',
      name: 'Ceramic planter',
      qty: 1,
      uom: 'Unit',
      rate: 45,
      amount: 45,
      isStock: true,
    },
  ],
});

describe('QuotationStore', () => {
  it('quotes at the selling price, valid for two weeks from the site today, and confirms it', async () => {
    const { store, api } = await ready();
    expect([store.total(), store.validTill(), store.ready()]).toEqual([90, '2026-10-30', true]);
    api.confirm.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('QT-1');
      return 'QT-1';
    });
    await store.confirm();
    expect(api.confirm.mock.calls[0][0]).toMatchObject({
      reference: store.reference(),
      customer: 'Lina Haddad',
      date: '2026-10-16',
      validTill: '2026-10-30',
      lines: [{ item: 'POT-30', uom: 'Unit', qty: 2, rate: 45 }],
    });
    expect([store.state(), store.result(), store.draft()]).toEqual(['confirmed', 'QT-1', 'QT-1']);
  });

  it('keeps an unresolved confirmation through a fresh visit and looks it up by reference', async () => {
    const { store, api } = await ready();
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    store.resume();
    expect(store.state()).toBe('unresolved');
    api.find.mockResolvedValue({ quotation: 'QT-1' });
    expect(await store.checkResult()).toBe('found');
    expect(api.find).toHaveBeenCalledWith(store.reference());
  });

  it("won't look the result up while the confirmation still runs", async () => {
    const { store, api } = await ready();
    api.confirm.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(await store.checkResult()).toBe('pending');
    expect(api.find).not.toHaveBeenCalled();
  });

  it('starts a new reference when an earlier, different version was confirmed', async () => {
    const { store, api } = await ready();
    const first = store.reference();
    api.confirm.mockRejectedValue(new PostedEarlierError('QT-1'));
    await store.confirm();
    expect([store.failure(), store.draft()]).toEqual(['changed', null]);
    expect(store.reference()).not.toBe(first);
  });

  it('keeps a draft saved on purpose when the task starts over', async () => {
    const { store, api } = await ready();
    api.saveDraft.mockResolvedValue('QT-DRAFT');
    expect(await store.saveDraft()).toBe('QT-DRAFT');
    store.start();
    expect(api.discard).not.toHaveBeenCalled();
  });

  it('deletes a draft a failed confirmation left behind when the task starts over', async () => {
    const { store, api } = await ready();
    api.confirm.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('QT-LEFT');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    store.start();
    expect(api.discard).toHaveBeenCalledWith('QT-LEFT');
  });

  it("doesn't save a draft with an invalid price, and a failed save never leaves the form locked", async () => {
    const { store, api } = await ready();
    store.setRate(0, -1);
    expect(await store.saveDraft()).toBeNull();
    expect(api.saveDraft).not.toHaveBeenCalled();
    store.setRate(0, 45);
    api.saveDraft.mockRejectedValue(new PostedEarlierError('QT-1'));
    await store.saveDraft();
    expect([store.savingDraft(), store.failure()]).toEqual([false, 'changed']);
  });

  it("a slow save from before a fresh start doesn't unlock the new task's save", async () => {
    const { store, api } = await ready();
    let finishFirst: (name: string) => void = () => undefined;
    api.saveDraft.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)));
    const first = store.saveDraft();
    store.start();
    await new Promise((resolve) => setTimeout(resolve));
    store.setCustomer({ id: 'Lina Haddad', name: 'Lina Haddad', meta: null });
    store.addItem(PLANTER);
    api.saveDraft.mockReturnValueOnce(new Promise(() => undefined));
    void store.saveDraft();
    finishFirst('QT-OLD');
    await first;
    expect(store.savingDraft()).toBe(true);
  });

  it('turns a failure before anything was sent into a failure, not an endless confirmation', async () => {
    const { store } = await ready();
    TestBed.inject(BusinessService).ensure = () =>
      Promise.reject(new HttpErrorResponse({ status: 0 }));
    await store.confirm();
    expect([store.state(), store.failure()]).toEqual(['failed', 'offline']);
  });

  it('opens a saved draft for editing and keeps it through the form opening', async () => {
    const { store } = setup();
    store.edit({
      name: 'QT-DRAFT',
      customer: 'Lina Haddad',
      customerName: 'Lina Haddad',
      forCustomer: true,
      docstatus: 0,
      status: 'Draft',
      date: '2026-10-16',
      validTill: '2026-10-30',
      total: 90,
      lines: [
        {
          code: 'POT-30',
          name: 'Ceramic planter',
          qty: 2,
          uom: 'Unit',
          rate: 45,
          amount: 90,
          isStock: true,
        },
      ],
    });
    store.resume();
    expect([store.draft(), store.customer()?.id, store.lines().length, store.validTill()]).toEqual([
      'QT-DRAFT',
      'Lina Haddad',
      1,
      '2026-10-30',
    ]);
    store.resume();
    expect(store.draft()).toBeNull();
  });

  it('editing keeps an open confirmation, and never deletes the left-behind draft it opens', async () => {
    const { store, api } = await ready();
    api.confirm.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('QT-LEFT');
      throw new UnresolvedError();
    });
    await store.confirm();
    const reference = store.reference();
    expect(store.edit(draftDetail('QT-OTHER'))).toBe(false);
    expect([store.state(), store.reference(), store.draft()]).toEqual([
      'unresolved',
      reference,
      'QT-LEFT',
    ]);
    api.find.mockResolvedValue('not-found');
    await store.checkResult();
    store.state.set('failed');
    expect(store.edit(draftDetail('QT-LEFT'))).toBe(true);
    expect(api.discard).not.toHaveBeenCalled();
    expect(store.draft()).toBe('QT-LEFT');
  });

  it("won't quote valid until a day already past", async () => {
    const { store } = await ready();
    store.setValidTill('2026-10-15');
    expect([store.validDate(), store.ready()]).toEqual([false, false]);
  });

  it("keeps the draft quotation's own reference when it is edited", () => {
    const { store } = setup();
    store.edit({ ...draftDetail('QT-DRAFT'), reference: 'QUO-0A1B2C3' });
    expect(store.reference()).toBe('QUO-0A1B2C3');
  });
});

describe('QuotationStore.openDraft', () => {
  it('loads the draft under its own reference, scoped to the business and the user', async () => {
    const { store, api } = setup();
    api.draftQuotation.mockResolvedValue({ ...draftDetail('QT-DRAFT'), reference: 'QUO-0A1B2C3' });

    expect(await store.openDraft('QT-DRAFT')).toBe('opened');

    expect(api.draftQuotation).toHaveBeenCalledWith('QT-DRAFT', {
      company: 'Rehan Nursery',
      owner: 'lina@example.com',
    });
    expect([store.reference(), store.draft(), store.customer()?.id, store.lines().length]).toEqual([
      'QUO-0A1B2C3',
      'QT-DRAFT',
      'Lina Haddad',
      1,
    ]);
  });

  it('is refused while a confirmation is open', async () => {
    const { store, api } = await ready();
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    expect(await store.openDraft('QT-DRAFT')).toBe('busy');
    expect(api.draftQuotation).not.toHaveBeenCalled();
  });

  it('keeps unsaved edits when the same draft is opened again', async () => {
    const { store, api } = setup();
    api.draftQuotation.mockResolvedValue(draftDetail('QT-DRAFT'));
    await store.openDraft('QT-DRAFT');
    store.setQty(0, 7);
    expect(await store.openDraft('QT-DRAFT')).toBe('opened');
    expect(api.draftQuotation).toHaveBeenCalledTimes(1);
    expect(store.lines()[0].qty).toBe(7);
  });

  it('keeps the draft it is already holding when that draft is opened on purpose', async () => {
    const { store, api } = await ready();
    api.confirm.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('QT-DRAFT');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();

    expect(await store.openDraft('QT-DRAFT')).toBe('opened');
    store.start();

    expect(api.discard).not.toHaveBeenCalled();
  });

  it('is refused while the last result is not yet shown', async () => {
    const { store, api } = await ready();
    api.confirm.mockResolvedValue('QT-1');
    await store.confirm();

    expect(await store.openDraft('QT-DRAFT')).toBe('busy');

    expect(api.draftQuotation).not.toHaveBeenCalled();
    expect(store.result()).toBe('QT-1');
  });

  it('fails closed when an own-sales-only user has no id', async () => {
    const { store, api } = setup(null);
    await expect(store.openDraft('QT-DRAFT')).rejects.toBeInstanceOf(DraftUnavailableError);
    expect(api.draftQuotation).not.toHaveBeenCalled();
  });

  it('leaves the task alone when the draft is not available', async () => {
    const { store, api } = await ready();
    api.draftQuotation.mockRejectedValue(new DraftUnavailableError('QT-OTHER'));
    await expect(store.openDraft('QT-OTHER')).rejects.toBeInstanceOf(DraftUnavailableError);
    expect(store.lines()).toHaveLength(1);
  });

  it('removes a line whatever its quantity and keeps the draft and customer', async () => {
    const { store } = await ready();
    store.addItem({ ...store.lines()[0].item, code: 'SRV-1', name: 'Visit', isStock: false });
    const draft = store.draft();
    const customer = store.customer();

    store.removeLine(0);

    expect(store.lines().map((l) => l.item.code)).toEqual(['SRV-1']);
    expect([store.draft(), store.customer()]).toEqual([draft, customer]);
    store.removeLine(0);
    expect([store.lines(), store.ready()]).toEqual([[], false]);
  });
});
