import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CollectionStore } from '../data-access/collection.store';
import { CollectFlowContainer } from './collect-flow.container';

describe('CollectFlowContainer', () => {
  it('starts the task over when it is entered from elsewhere', () => {
    const resume = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: CollectionStore, useValue: { resume } }],
    });
    TestBed.createComponent(CollectFlowContainer);
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
