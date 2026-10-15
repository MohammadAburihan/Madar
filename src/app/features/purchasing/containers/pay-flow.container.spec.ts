import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { SupplierPaymentStore } from '../data-access/supplier-payment.store';
import { PayFlowContainer } from './pay-flow.container';

describe('PayFlowContainer', () => {
  it("resumes the task for the URL's invoice when it is entered from elsewhere", () => {
    const resume = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SupplierPaymentStore, useValue: { resume } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ name: 'PINV-0068' }) } },
        },
      ],
    });
    TestBed.createComponent(PayFlowContainer);
    expect(resume).toHaveBeenCalledExactlyOnceWith('PINV-0068');
  });
});
