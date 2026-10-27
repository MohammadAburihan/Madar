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
  window: { items: () => unknown[]; more: () => void };
  notice: () => unknown;
  load: () => Promise<void>;
  deleter: { ask: (t: object) => void; answer: (id: string) => void; running: () => boolean };
}

function setup(
  remove: ReturnType<typeof vi.fn>,
  state?: unknown,
  before?: () => void,
  entries = [entry('SI-1'), entry('SI-2')],
) {
  const load = vi.fn().mockResolvedValue({ entries, allForbidden: false });
  const business = { name: 'Rehan Nursery', currency: 'ILS' };
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      {
        provide: Router,
        useValue: {
          navigate: vi.fn(),
          getCurrentNavigation: () => (state ? { extras: { state } } : null),
        },
      },
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
  before?.();
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
  it('shows the delete that opened the page, and keeps it through the first load', async () => {
    const { fixture, page, load } = setup(vi.fn(), {
      deletedDraft: { kind: 'sale', name: 'SI-9', party: 'Lina Haddad' },
    });
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    await fixture.whenStable();
    expect(page.notice()).not.toBeNull();
  });

  it('removes the notice from the history entry once read', async () => {
    history.replaceState({ navigationId: 3, deletedDraft: { kind: 'sale' } }, '');
    const { page, load } = setup(vi.fn(), {
      deletedDraft: { kind: 'sale', name: 'SI-9', party: 'Lina Haddad' },
    });
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    expect(page.notice()).not.toBeNull();
    expect(history.state.deletedDraft).toBeUndefined();
    expect(history.state.navigationId).toBe(3);
  });

  it('ignores a notice left in the history entry', async () => {
    history.replaceState({ deletedDraft: { kind: 'sale', name: 'SI-9', party: 'Lina' } }, '');
    const { page, load } = setup(vi.fn());
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    expect(page.notice()).toBeNull();
  });

  it('shows no notice without navigation state, even after an earlier delete', async () => {
    const { page, load } = setup(vi.fn(), undefined, () =>
      TestBed.inject(DeletedDraftsService).publish({ kind: 'sale', name: 'SI-9', party: 'Lina' }),
    );
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    expect(page.notice()).toBeNull();
  });

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

describe('DraftsContainer paging', () => {
  it('keeps the window it showed when a changed draft reloads the list', async () => {
    const many = Array.from({ length: 120 }, (_, i) => entry(`SI-${i}`));
    const { fixture, page, load } = setup(
      vi.fn().mockResolvedValue('changed'),
      undefined,
      undefined,
      many,
    );
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page.window.items().length).toBe(50);
    });
    page.window.more();
    fixture.detectChanges();
    expect(page.window.items().length).toBe(100);

    page.deleter.ask(target('SI-1'));
    page.deleter.answer('delete');
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page.window.items().length).toBe(100);
    });
  });
});
