import { TestBed } from '@angular/core/testing';
import { DeletedDraftsService } from '../../../core/tasks/deleted-drafts.service';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { SalesOrderApiService } from './sales-order-api.service';
import { SalesOrderStore } from './sales-order.store';

function setup() {
  const api = {
    fromQuotation: vi.fn(),
    find: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SalesOrderApiService, useValue: api },
      {
        provide: SiteClockService,
        useValue: { ensure: () => Promise.resolve(), now: () => new Date(2026, 9, 16, 9, 0) },
      },
    ],
  });
  return { store: TestBed.inject(SalesOrderStore), api };
}

describe('SalesOrderStore', () => {
  it('makes the order for the quotation, expected on the site today, once for a double tap', async () => {
    const { store, api } = setup();
    api.fromQuotation.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('SO-1');
      return 'SO-1';
    });
    const first = store.create('QT-1');
    void store.create('QT-1');
    await first;
    expect(api.fromQuotation).toHaveBeenCalledTimes(1);
    expect(api.fromQuotation.mock.calls[0][0]).toMatchObject({
      quotation: 'QT-1',
      deliveryDate: '2026-10-16',
    });
    expect([store.state(), store.result()]).toEqual(['confirmed', 'SO-1']);
  });

  it('keeps the reference and draft for a retry on the same quotation, and cleans the draft up for another', async () => {
    const { store, api } = setup();
    api.fromQuotation.mockImplementationOnce(async (_request, _draft, onInserted) => {
      onInserted('SO-LEFT');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.create('QT-1');
    const reference = store.reference();
    api.fromQuotation.mockResolvedValueOnce('SO-LEFT');
    await store.create('QT-1');
    expect(api.fromQuotation.mock.calls[1][0].reference).toBe(reference);
    expect(api.fromQuotation.mock.calls[1][1]).toBe('SO-LEFT');

    api.fromQuotation.mockImplementationOnce(async (_request, _draft, onInserted) => {
      onInserted('SO-OTHER');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.create('QT-1');
    expect(api.discard).not.toHaveBeenCalled();
    api.fromQuotation.mockResolvedValueOnce('SO-3');
    await store.create('QT-2');
    expect(api.discard).toHaveBeenCalledWith('SO-OTHER');
  });

  it('keeps an unresolved order open, refuses another, and checks it only once the confirmation gave up', async () => {
    const { store, api } = setup();
    api.fromQuotation.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('SO-1');
      throw new UnresolvedError();
    });
    await store.create('QT-1');
    expect(store.state()).toBe('unresolved');
    await store.create('QT-2');
    expect([store.quotation(), api.fromQuotation.mock.calls.length]).toEqual(['QT-1', 1]);
    api.find.mockResolvedValue({ order: 'SO-1' });
    expect(await store.checkResult()).toBe('found');
    expect([store.state(), store.result()]).toEqual(['confirmed', 'SO-1']);
    expect(await store.checkResult()).toBe('pending');
  });

  it('reports an earlier order that stands as changed, with a fresh reference', async () => {
    const { store, api } = setup();
    api.fromQuotation.mockRejectedValue(new PostedEarlierError('SO-1'));
    await store.create('QT-1');
    const reference = store.reference();
    expect([store.failure(), store.draft()]).toEqual(['changed', null]);
    await store.create('QT-1');
    expect(api.fromQuotation.mock.calls[1][0].reference).toBe(reference);
  });

  it('turns a failure before anything was sent into a failure, not an endless confirmation', async () => {
    const { store } = setup();
    TestBed.inject(SiteClockService).ensure = () =>
      Promise.reject(new HttpErrorResponse({ status: 0 }));
    await store.create('QT-1');
    expect([store.state(), store.failure()]).toEqual(['failed', 'offline']);
  });
});

describe('SalesOrderStore when its draft is deleted', () => {
  it('forgets the leftover draft, so the retry inserts a new order', async () => {
    const { store, api } = setup();
    api.fromQuotation.mockImplementationOnce(async (_request, _draft, onInserted) => {
      onInserted('SO-LEFT');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.create('QT-1');
    expect(store.draft()).toBe('SO-LEFT');

    TestBed.inject(DeletedDraftsService).publish({
      kind: 'order',
      name: 'SO-LEFT',
      party: 'Lina Haddad',
    });
    TestBed.tick();

    expect(store.draft()).toBeNull();
  });
});
