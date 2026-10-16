import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { QuotationStore } from '../data-access/quotation.store';
import { QuotationFlowContainer } from './quotation-flow.container';

describe('QuotationFlowContainer', () => {
  it('resumes the task when it is entered from elsewhere', () => {
    const resume = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: QuotationStore, useValue: { resume } }],
    });
    TestBed.createComponent(QuotationFlowContainer);
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
