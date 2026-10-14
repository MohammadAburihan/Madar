import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ReceiptStore } from '../data-access/receipt.store';
import { ReceiptFlowContainer } from './receipt-flow.container';

describe('ReceiptFlowContainer', () => {
  it("resumes the task for the URL's order when it is entered from elsewhere", () => {
    const resume = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ReceiptStore, useValue: { resume } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ name: 'PO-2048' }) } },
        },
      ],
    });
    TestBed.createComponent(ReceiptFlowContainer);
    expect(resume).toHaveBeenCalledExactlyOnceWith('PO-2048');
  });
});
