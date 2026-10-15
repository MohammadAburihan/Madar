import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { SupplyStore } from '../data-access/supply.store';
import { SupplyFlowContainer } from './supply-flow.container';

describe('SupplyFlowContainer', () => {
  it("resumes the task for the URL's project and item when it is entered from elsewhere", () => {
    const resume = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SupplyStore, useValue: { resume } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ name: 'PROJ-0001', item: 'POT-30' }) },
          },
        },
      ],
    });
    TestBed.createComponent(SupplyFlowContainer);
    expect(resume).toHaveBeenCalledExactlyOnceWith('PROJ-0001', 'POT-30');
  });
});
