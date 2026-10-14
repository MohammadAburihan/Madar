import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { TransferStore } from '../data-access/transfer.store';
import { TransferFlowContainer } from './transfer-flow.container';

describe('TransferFlowContainer', () => {
  it('starts the task over when it is entered from elsewhere', () => {
    const resume = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TransferStore, useValue: { resume } }],
    });
    TestBed.createComponent(TransferFlowContainer);
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
