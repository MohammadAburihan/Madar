import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { SupplierInvoiceStore } from '../data-access/supplier-invoice.store';
import { InvoiceFlowContainer } from './invoice-flow.container';

describe('InvoiceFlowContainer', () => {
  it("resumes the task for the URL's order when it is entered from elsewhere", () => {
    const resume = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SupplierInvoiceStore, useValue: { resume } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ name: 'PO-2048' }) } },
        },
      ],
    });
    TestBed.createComponent(InvoiceFlowContainer);
    expect(resume).toHaveBeenCalledExactlyOnceWith('PO-2048');
  });
});
