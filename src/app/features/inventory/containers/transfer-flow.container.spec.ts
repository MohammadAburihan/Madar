import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { translocoTesting } from '../../../../testing/real-translator';
import { SessionService } from '../../../core/auth/session.service';
import { PrefillUnavailableError } from '../../../core/tasks/prefill-entry';
import { TaskPrefillService } from '../../../core/tasks/task-prefill.service';
import { TransferStore } from '../data-access/transfer.store';
import { TransferFlowContainer } from './transfer-flow.container';

function setup(
  store: Record<string, unknown>,
  prefill: { id: string; payload: unknown } | null = null,
) {
  const query = convertToParamMap(prefill ? { prefill: prefill.id } : {});
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      provideRouter([]),
      { provide: TransferStore, useValue: store },
      { provide: SessionService, useValue: { checkExpired: vi.fn() } },
      {
        provide: TaskPrefillService,
        useValue: {
          drop: vi.fn(),
          peek: vi.fn((_kind: string, id: string) =>
            prefill && id === prefill.id ? prefill.payload : null,
          ),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: query }, queryParamMap: new BehaviorSubject(query) },
      },
    ],
  });
  const fixture = TestBed.createComponent(TransferFlowContainer);
  fixture.detectChanges();
  return fixture;
}

describe('TransferFlowContainer', () => {
  it('starts the task over when it is entered from elsewhere', () => {
    const resume = vi.fn();
    const fixture = setup({ resume });
    expect(resume).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('opens the proposal in the address before showing the steps', async () => {
    const openPrefill = vi.fn().mockResolvedValue('opened');
    const payload = { item_code: 'OLV-20', qty: 2 };
    const fixture = setup({ resume: vi.fn(), openPrefill }, { id: 'PF-1', payload });
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Opening the assistant's proposal");
    await fixture.whenStable();
    fixture.detectChanges();
    expect(openPrefill).toHaveBeenCalledWith(payload);
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('leaves a fresh task with an expiry notice when the proposal is gone', async () => {
    const prefillFailed = vi.fn();
    const fixture = setup(
      { resume: vi.fn(), openPrefill: vi.fn(), prefillFailed },
      { id: 'PF-1', payload: null },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(prefillFailed).toHaveBeenCalledWith('expired');
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('says the proposal cannot be opened when the task refuses it', async () => {
    const prefillFailed = vi.fn();
    const fixture = setup(
      {
        resume: vi.fn(),
        openPrefill: vi.fn().mockRejectedValue(new PrefillUnavailableError('item')),
        prefillFailed,
      },
      { id: 'PF-1', payload: { item_code: 'GONE', qty: 1 } },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(prefillFailed).toHaveBeenCalledWith('unavailable');
  });
});
