import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { translocoTesting } from '../../../../testing/real-translator';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import {
  DraftDeleteError,
  DraftDeletionService,
} from '../../../core/drafts/draft-deletion.service';
import { ViewportService } from '../../../core/layout/viewport.service';
import { DeletedDraftsService } from '../../../core/tasks/deleted-drafts.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { DraftsApiService } from '../data-access/drafts-api.service';
import { DraftEntry } from '../data-access/drafts.models';
import { DraftsContainer } from './drafts.container';

const entry = (name: string): DraftEntry => ({
  kind: 'sale',
  name,
  party: 'Lina Haddad',
  modified: '2026-10-11 08:50:00',
  total: 10,
  currency: 'ILS',
  units: 1,
  continuable: false,
  invoice: null,
  owner: 'lina@example.com',
  deletable: true,
});

interface Internals {
  notice: () => unknown;
  load: () => Promise<void>;
  deleter: { ask: (t: object) => void; answer: (id: string) => void; running: () => boolean };
}

function setup(remove: ReturnType<typeof vi.fn>) {
  const load = vi
    .fn()
    .mockResolvedValue({ entries: [entry('SI-1'), entry('SI-2')], allForbidden: false });
  const business = { name: 'Rehan Nursery', currency: 'ILS' };
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: DraftsApiService, useValue: { load } },
      { provide: DraftDeletionService, useValue: { delete: remove } },
      {
        provide: BusinessService,
        useValue: { ensure: async () => business, active: () => business },
      },
      {
        provide: SiteClockService,
        useValue: { ensure: async () => undefined, now: () => new Date() },
      },
      { provide: ViewportService, useValue: { viewport: signal('mobile') } },
      {
        provide: SessionService,
        useValue: {
          capabilities: signal(capabilitiesFor('owner')),
          persona: signal('owner'),
          user: signal({ id: 'lina@example.com' }),
          checkExpired: vi.fn().mockResolvedValue(false),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DraftsContainer);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance as unknown as Internals, load };
}

const target = (name: string) => ({
  kind: 'sale',
  name,
  party: 'Lina Haddad',
  company: 'Rehan Nursery',
});

describe('DraftsContainer deleted notice', () => {
  it('goes away when the next delete fails, and when the list reloads', async () => {
    const remove = vi
      .fn()
      .mockResolvedValueOnce('deleted')
      .mockRejectedValueOnce(new DraftDeleteError('linked'));
    const { fixture, page, load } = setup(remove);
    await vi.waitFor(() => expect(load).toHaveBeenCalled());

    page.deleter.ask(target('SI-1'));
    page.deleter.answer('delete');
    await vi.waitFor(() => expect(page.notice()).not.toBeNull());
    expect(TestBed.inject(DeletedDraftsService).latest()?.name).toBe('SI-1');

    page.deleter.ask(target('SI-2'));
    page.deleter.answer('delete');
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page.notice()).toBeNull();
    });
  });

  it('goes away when the list reloads', async () => {
    const { page, load } = setup(vi.fn().mockResolvedValue('deleted'));
    await vi.waitFor(() => expect(load).toHaveBeenCalled());

    page.deleter.ask(target('SI-1'));
    page.deleter.answer('delete');
    await vi.waitFor(() => expect(page.notice()).not.toBeNull());

    await page.load();
    expect(page.notice()).toBeNull();
  });
});
