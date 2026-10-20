import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { translocoTesting } from '../../../testing/real-translator';
import { capabilitiesFor } from '../auth/capabilities';
import { SessionService } from '../auth/session.service';
import { DeletedDraftsService } from '../tasks/deleted-drafts.service';
import { injectDeleteAllowed, injectDraftDeleter } from './draft-deleter';
import { DraftDeleteError, DraftDeletionService } from './draft-deletion.service';
import { DraftKind } from './draft-kind';

const TARGET = {
  kind: 'sale' as const,
  name: 'SI-1',
  party: 'Lina Haddad',
  company: 'Rehan Nursery',
};

function setup(deletion: Partial<Record<keyof DraftDeletionService, unknown>> = {}) {
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      { provide: DraftDeletionService, useValue: deletion },
      {
        provide: SessionService,
        useValue: {
          capabilities: signal(capabilitiesFor('salesperson')),
          persona: signal('salesperson'),
          user: signal({ id: 'lina@example.com' }),
        },
      },
    ],
  });
}

describe('injectDraftDeleter', () => {
  it('opens the dialog for the draft, and Keep closes it without deleting', () => {
    const remove = vi.fn();
    setup({ delete: remove });
    const deleter = TestBed.runInInjectionContext(() =>
      injectDraftDeleter({ reload: vi.fn(), done: vi.fn() }),
    );

    deleter.ask(TARGET);
    expect(deleter.open()).toBe(true);
    expect(deleter.dialog()?.title).toBe('Delete this draft?');

    deleter.answer('keep');
    expect([deleter.open(), deleter.dialog()]).toEqual([false, null]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes after Delete, runs done, then tells the app which draft is gone', async () => {
    const remove = vi.fn().mockResolvedValue('deleted');
    const done = vi.fn();
    setup({ delete: remove });
    const deleter = TestBed.runInInjectionContext(() =>
      injectDraftDeleter({ reload: vi.fn(), done }),
    );
    const seen: unknown[] = [];

    deleter.ask(TARGET);
    deleter.answer('delete');
    expect(deleter.running()).toBe(true);
    await vi.waitFor(() => expect(deleter.running()).toBe(false));

    expect(remove).toHaveBeenCalledWith('sale', 'SI-1', 'Rehan Nursery');
    expect(done).toHaveBeenCalledWith(TARGET);
    seen.push(TestBed.inject(DeletedDraftsService).latest());
    expect(seen).toEqual([{ kind: 'sale', name: 'SI-1', party: 'Lina Haddad' }]);
    expect(deleter.problem()).toBeNull();
  });

  it('shows why a delete failed and tells nobody it is gone', async () => {
    setup({ delete: vi.fn().mockRejectedValue(new DraftDeleteError('linked')) });
    const done = vi.fn();
    const deleter = TestBed.runInInjectionContext(() =>
      injectDraftDeleter({ reload: vi.fn(), done }),
    );

    deleter.ask(TARGET);
    deleter.answer('delete');
    await vi.waitFor(() => expect(deleter.problem()).not.toBeNull());

    expect(deleter.problem()?.title).toBe('This draft is linked');
    expect(done).not.toHaveBeenCalled();
    expect(TestBed.inject(DeletedDraftsService).latest()).toBeNull();

    deleter.ask(TARGET);
    expect(deleter.problem()).toBeNull();
  });

  it('reloads the page and says so when the draft is no longer a draft of this business', async () => {
    setup({ delete: vi.fn().mockResolvedValue('changed') });
    const reload = vi.fn();
    const deleter = TestBed.runInInjectionContext(() =>
      injectDraftDeleter({ reload, done: vi.fn() }),
    );

    deleter.ask(TARGET);
    deleter.answer('delete');
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());

    expect(deleter.problem()?.title).toBe('Already confirmed or gone');
    expect(TestBed.inject(DeletedDraftsService).latest()).toBeNull();
  });

  it('starts no second delete while one is running', async () => {
    let finish: (value: string) => void = () => undefined;
    const remove = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    setup({ delete: remove });
    const deleter = TestBed.runInInjectionContext(() =>
      injectDraftDeleter({ reload: vi.fn(), done: vi.fn() }),
    );

    deleter.ask(TARGET);
    deleter.answer('delete');
    deleter.ask({ ...TARGET, name: 'SI-2' });
    deleter.answer('delete');
    expect(remove).toHaveBeenCalledTimes(1);

    finish('deleted');
    await vi.waitFor(() => expect(deleter.running()).toBe(false));
  });
});

describe('injectDeleteAllowed', () => {
  const allowedFor = (kind: DraftKind, owner: string | null, answer: boolean) => {
    const allowed = vi.fn().mockResolvedValue(answer);
    setup({ allowed });
    const target = signal<{ kind: DraftKind; name: string; owner: string | null } | null>({
      kind,
      name: 'X-1',
      owner,
    });
    const result = TestBed.runInInjectionContext(() => injectDeleteAllowed(target));
    TestBed.tick();
    return { allowed, result, target };
  };

  it("asks ERPNext only for a draft Madar's rules allow, and shows Delete only on a yes", async () => {
    const yes = allowedFor('quotation', 'lina@example.com', true);
    await vi.waitFor(() => expect(yes.result()).toBe(true));
    expect(yes.allowed).toHaveBeenCalledWith('quotation', 'X-1');
  });

  it("hides Delete on a colleague's sales draft without asking ERPNext", () => {
    const other = allowedFor('quotation', 'sami@example.com', true);
    expect(other.allowed).not.toHaveBeenCalled();
    expect(other.result()).toBe(false);
  });

  it('hides Delete when ERPNext says no, and when there is no draft', async () => {
    const no = allowedFor('quotation', 'lina@example.com', false);
    await vi.waitFor(() => expect(no.allowed).toHaveBeenCalled());
    expect(no.result()).toBe(false);

    no.target.set(null);
    TestBed.tick();
    expect(no.result()).toBe(false);
  });

  it('hides Delete when the check fails', async () => {
    const allowed = vi.fn().mockRejectedValue(new Error('offline'));
    setup({ allowed });
    const target = signal<{ kind: DraftKind; name: string; owner: string | null } | null>({
      kind: 'order',
      name: 'SO-1',
      owner: 'lina@example.com',
    });
    const result = TestBed.runInInjectionContext(() => injectDeleteAllowed(target));
    TestBed.tick();
    await vi.waitFor(() => expect(allowed).toHaveBeenCalled());
    expect(result()).toBe(false);
  });
});
