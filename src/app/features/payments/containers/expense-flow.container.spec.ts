import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ExpenseStore } from '../data-access/expense.store';
import { ExpenseFlowContainer } from './expense-flow.container';

describe('ExpenseFlowContainer', () => {
  it('starts the task over when it is entered from elsewhere', () => {
    const resume = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ExpenseStore, useValue: { resume } }],
    });
    TestBed.createComponent(ExpenseFlowContainer);
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
