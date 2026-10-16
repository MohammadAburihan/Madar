import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { SalesReturnStore } from '../data-access/sales-return.store';
import { ReturnFlowContainer } from './return-flow.container';

describe('ReturnFlowContainer', () => {
  it("resumes the task for the URL's invoice when it is entered from elsewhere", () => {
    const resume = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SalesReturnStore, useValue: { resume } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ name: 'SI-1042' }) } },
        },
      ],
    });
    TestBed.createComponent(ReturnFlowContainer);
    expect(resume).toHaveBeenCalledExactlyOnceWith('SI-1042');
  });
});
