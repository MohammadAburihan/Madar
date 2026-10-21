import { Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { injectI18n } from '../i18n/i18n';
import { DeletedDraftsService } from '../tasks/deleted-drafts.service';
import { DeleteProblem, deleteDialogText, deleteProblemText } from './draft-delete-view';
import { DraftDeleteError, DraftDeletionService } from './draft-deletion.service';
import { DraftKind } from './draft-kind';
import { mayDeleteDraft } from './delete-rules';

export interface DeleteTarget {
  kind: DraftKind;
  name: string;
  party: string;
  company: string;
}

/**
 * Whether the signed-in user may delete this draft: Madar's rule first, then ERPNext's own delete right for it.
 * Only a definite no hides the button; when the check can't be made ERPNext still refuses a delete the role can't make.
 */
export function injectDeleteAllowed(
  target: Signal<{ kind: DraftKind; name: string; owner: string | null } | null>,
): Signal<boolean> {
  const session = inject(SessionService);
  const deletion = inject(DraftDeletionService);
  const allowed = signal(false);
  let turn = 0;
  effect(() => {
    const draft = target();
    const caps = session.capabilities();
    const persona = session.persona();
    const userId = session.user()?.id;
    untracked(() => {
      const mine = !!userId && draft?.owner === userId;
      const permitted = !!draft && mayDeleteDraft(draft.kind, caps, persona, mine);
      const thisTurn = ++turn;
      allowed.set(false);
      if (!draft || !permitted) {
        return;
      }
      deletion
        .allowed(draft.kind, draft.name)
        .then((answer) => thisTurn === turn && allowed.set(answer))
        .catch(() => thisTurn === turn && allowed.set(true));
    });
  });
  return allowed.asReadonly();
}

/**
 * The delete flow of a draft: ask, confirm, delete, then hand over to `done`. One draft at a time; a delete in
 * flight can't be started twice.
 */
export function injectDraftDeleter(options: {
  /** The draft is no longer what the page showed: load it again. */
  reload: () => void;
  /** Runs after the draft is gone, before the rest of the app is told. */
  done: (target: DeleteTarget) => unknown;
}) {
  const deletion = inject(DraftDeletionService);
  const deleted = inject(DeletedDraftsService);
  const i18n = injectI18n();

  const pending = signal<DeleteTarget | null>(null);
  const running = signal(false);
  const problem = signal<{ problem: DeleteProblem; target: DeleteTarget } | null>(null);

  const dialog = computed(() => {
    const target = pending();
    return target ? deleteDialogText(i18n.tr(), target.kind, target.party) : null;
  });
  const problemText = computed(() => {
    const current = problem();
    return current ? deleteProblemText(i18n.tr(), current.problem) : null;
  });

  async function run(target: DeleteTarget): Promise<void> {
    running.set(true);
    problem.set(null);
    try {
      const outcome = await deletion.delete(target.kind, target.name, target.company);
      if (outcome === 'changed') {
        problem.set({ problem: 'changed', target });
        options.reload();
        return;
      }
      deleted.publish({ kind: target.kind, name: target.name, party: target.party });
      try {
        await options.done(target);
      } catch {
        // The draft is gone; a failed hand-over is not a failed delete.
      }
    } catch (error) {
      const failure = error instanceof DraftDeleteError ? error.failure : 'error';
      problem.set({ problem: failure, target });
    } finally {
      running.set(false);
    }
  }

  return {
    /** The draft the dialog is about; the dialog is open while it is set and nothing is running. */
    pending: pending.asReadonly(),
    open: computed(() => pending() !== null && !running()),
    running: running.asReadonly(),
    dialog,
    problem: problemText,
    ask(target: DeleteTarget): void {
      if (!running()) {
        problem.set(null);
        pending.set(target);
      }
    },
    answer(id: string): void {
      const target = pending();
      pending.set(null);
      if (id === 'delete' && target && !running()) {
        void run(target);
      }
    },
    dismissProblem(): void {
      problem.set(null);
    },
  };
}
