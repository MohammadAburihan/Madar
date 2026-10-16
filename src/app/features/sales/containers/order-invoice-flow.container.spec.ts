import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { OrderInvoiceStore } from '../data-access/order-invoice.store';
import { OrderInvoiceFlowContainer } from './order-invoice-flow.container';

describe('OrderInvoiceFlowContainer', () => {
  it("resumes the task for the URL's order when it is entered from elsewhere", () => {
    const resume = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: OrderInvoiceStore, useValue: { resume } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ name: 'SO-0187' }) } },
        },
      ],
    });
    TestBed.createComponent(OrderInvoiceFlowContainer);
    expect(resume).toHaveBeenCalledExactlyOnceWith('SO-0187');
  });
});
