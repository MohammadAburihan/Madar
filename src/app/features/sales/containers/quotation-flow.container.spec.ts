import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { translocoTesting } from '../../../../testing/real-translator';
import { SessionService } from '../../../core/auth/session.service';
import { DraftUnavailableError } from '../../../core/erpnext/draft';
import { PrefillUnavailableError } from '../../../core/tasks/prefill-entry';
import { TaskPrefillService } from '../../../core/tasks/task-prefill.service';
import { QuotationStore } from '../data-access/quotation.store';
import { QuotationFlowContainer } from './quotation-flow.container';

function setup(
  draft: string | null,
  store: Record<string, unknown>,
  prefill: { id: string; payload: unknown } | null = null,
) {
  const query = convertToParamMap({
    ...(draft ? { draft } : {}),
    ...(prefill ? { prefill: prefill.id } : {}),
  });
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      provideRouter([]),
      { provide: QuotationStore, useValue: store },
      { provide: SessionService, useValue: { checkExpired: vi.fn() } },
      {
        provide: TaskPrefillService,
        useValue: {
          take: vi.fn((_kind: string, id: string) =>
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
  const fixture = TestBed.createComponent(QuotationFlowContainer);
  fixture.detectChanges();
  return fixture;
}

describe('QuotationFlowContainer', () => {
  it('resumes the task when it is entered from elsewhere', () => {
    const resume = vi.fn();
    setup(null, { resume });
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('opens the draft named in the address instead of resuming', async () => {
    const resume = vi.fn();
    const openDraft = vi.fn().mockResolvedValue('opened');
    const fixture = setup('QT-DRAFT', { resume, openDraft });
    expect(fixture.nativeElement.querySelector('app-draft-gate')).not.toBeNull();
    await fixture.whenStable();
    expect(openDraft).toHaveBeenCalledWith('QT-DRAFT');
    expect(resume).not.toHaveBeenCalled();
  });

  it('shows an error with a way back, never an empty form, when the draft cannot be opened', async () => {
    const openDraft = vi.fn().mockRejectedValue(new DraftUnavailableError('QT-DRAFT'));
    const fixture = setup('QT-DRAFT', { resume: vi.fn(), openDraft });
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(fixture.nativeElement.querySelector('app-draft-gate')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull();
    expect(text).toContain("This draft can't be continued");
    expect(text).toContain('Back to drafts');
  });

  it('opens the proposal in the address before showing the steps', async () => {
    const resume = vi.fn();
    const openPrefill = vi.fn().mockResolvedValue('opened');
    const payload = { ok: true };
    const fixture = setup(
      null,
      { resume, openPrefill, prefillFailed: vi.fn() },
      { id: 'PF-1', payload },
    );
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Opening the assistant's proposal");
    await fixture.whenStable();
    fixture.detectChanges();
    expect(openPrefill).toHaveBeenCalledWith(payload);
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('leaves a fresh task with an expiry notice when the proposal is gone', async () => {
    const openPrefill = vi.fn();
    const prefillFailed = vi.fn();
    const fixture = setup(
      null,
      { resume: vi.fn(), openPrefill, prefillFailed },
      { id: 'PF-1', payload: null },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(openPrefill).not.toHaveBeenCalled();
    expect(prefillFailed).toHaveBeenCalledWith('expired');
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('says the proposal cannot be opened when the task refuses it, never a half-filled form', async () => {
    const openPrefill = vi.fn().mockRejectedValue(new PrefillUnavailableError('customer'));
    const prefillFailed = vi.fn();
    const fixture = setup(
      null,
      { resume: vi.fn(), openPrefill, prefillFailed },
      { id: 'PF-1', payload: { ok: true } },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(prefillFailed).toHaveBeenCalledWith('unavailable');
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });
});
