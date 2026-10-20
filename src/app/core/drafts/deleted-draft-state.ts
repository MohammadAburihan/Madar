import { DraftKind } from './draft-kind';

export interface DeletedDraftState {
  kind: DraftKind;
  name: string;
  party: string;
}

/** Navigation state that lets Unfinished work report a delete made on a draft's own page. */
export function deletedDraftState(target: DeletedDraftState): { deletedDraft: DeletedDraftState } {
  return { deletedDraft: { kind: target.kind, name: target.name, party: target.party } };
}

export function readDeletedDraft(state: unknown): DeletedDraftState | null {
  const draft = (state as { deletedDraft?: Partial<DeletedDraftState> } | null | undefined)
    ?.deletedDraft;
  return draft && draft.kind && draft.name && typeof draft.party === 'string'
    ? { kind: draft.kind, name: draft.name, party: draft.party }
    : null;
}
