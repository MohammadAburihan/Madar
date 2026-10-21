import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DeletedDraftsService, forgetDeletedDrafts } from './deleted-drafts.service';

function setup(held: string | null, busy = false) {
  const draft = signal<string | null>(held);
  const forget = vi.fn();
  TestBed.runInInjectionContext(() => forgetDeletedDrafts('sale', draft, signal(busy), forget));
  TestBed.tick();
  return { forget, deleted: TestBed.inject(DeletedDraftsService) };
}

describe('forgetDeletedDrafts', () => {
  it('forgets the draft the store holds when that one is deleted', () => {
    const { forget, deleted } = setup('SI-1');
    deleted.publish({ kind: 'sale', name: 'SI-1', party: 'Lina' });
    TestBed.tick();
    expect(forget).toHaveBeenCalledTimes(1);
  });

  it('ignores other drafts, other kinds and an old deletion', () => {
    const { forget, deleted } = setup('SI-1');
    deleted.publish({ kind: 'sale', name: 'SI-2', party: 'Lina' });
    deleted.publish({ kind: 'order', name: 'SI-1', party: 'Lina' });
    TestBed.tick();
    expect(forget).not.toHaveBeenCalled();
  });

  it('keeps the draft while a confirmation is running', () => {
    const { forget, deleted } = setup('SI-1', true);
    deleted.publish({ kind: 'sale', name: 'SI-1', party: 'Lina' });
    TestBed.tick();
    expect(forget).not.toHaveBeenCalled();
  });
});
