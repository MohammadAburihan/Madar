import { deletedDraftState, readDeletedDraft } from './deleted-draft-state';

describe('readDeletedDraft', () => {
  const draft = { kind: 'sale' as const, name: 'SI-9', party: 'Lina' };

  it('reads what deletedDraftState wrote', () => {
    expect(readDeletedDraft(deletedDraftState(draft))).toEqual(draft);
  });

  it('keeps an empty party name', () => {
    expect(readDeletedDraft(deletedDraftState({ ...draft, party: '' }))?.party).toBe('');
  });

  it.each([null, undefined, 'text', 4, {}, { deletedDraft: 'x' }])('returns null for %j', (s) => {
    expect(readDeletedDraft(s)).toBeNull();
  });

  it('returns null without a name or a kind', () => {
    expect(readDeletedDraft({ deletedDraft: { kind: 'sale', party: 'Lina' } })).toBeNull();
    expect(readDeletedDraft({ deletedDraft: { name: 'SI-9', party: 'Lina' } })).toBeNull();
  });
});
