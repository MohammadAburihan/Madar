import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { BusinessService } from '../../../core/business/business.service';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
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

function setup() {
  const api = {
    confirm: vi.fn(),
    saveDraft: vi.fn(),
    find: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: QuotationApiService, useValue: api },
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
});
