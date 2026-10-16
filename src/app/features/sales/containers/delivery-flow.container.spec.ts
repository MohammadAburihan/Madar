import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { DeliveryStore } from '../data-access/delivery.store';
import { DeliveryFlowContainer } from './delivery-flow.container';

describe('DeliveryFlowContainer', () => {
  it("resumes the task for the URL's order when it is entered from elsewhere", () => {
    const resume = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DeliveryStore, useValue: { resume } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ name: 'SO-0187' }) } },
        },
      ],
    });
    TestBed.createComponent(DeliveryFlowContainer);
    expect(resume).toHaveBeenCalledExactlyOnceWith('SO-0187');
  });
});
