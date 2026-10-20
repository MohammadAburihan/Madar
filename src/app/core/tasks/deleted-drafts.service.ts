import { Injectable, Signal, effect, inject, signal, untracked } from '@angular/core';
import { DraftKind } from '../drafts/draft-kind';

export interface DeletedDraft {
  kind: DraftKind;
  name: string;
  /** The customer or supplier, for the notice. */
  party: string;
}

/** Tells everything that may hold a draft in memory (task stores, lists, Home) that it was deleted. */
@Injectable({ providedIn: 'root' })
export class DeletedDraftsService {
  private readonly last = signal<DeletedDraft | null>(null);
  readonly latest = this.last.asReadonly();

  publish(draft: DeletedDraft): void {
    this.last.set({ ...draft });
  }
}

/**
 * For a task store: forgets the draft it holds when that one is deleted. A running or unresolved confirmation
 * keeps it; the confirm finds the draft gone and inserts a new one. Call from the store's constructor.
 */
export function forgetDeletedDrafts(
  kind: DraftKind,
  held: Signal<string | null>,
  busy: Signal<boolean>,
  forget: () => void,
): void {
  const deleted = inject(DeletedDraftsService);
  effect(() => {
    const draft = deleted.latest();
    untracked(() => {
      if (draft && draft.kind === kind && draft.name === held() && !busy()) {
        forget();
      }
    });
  });
}
