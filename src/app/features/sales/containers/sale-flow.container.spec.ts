import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { translocoTesting } from '../../../../testing/real-translator';
import { SessionService } from '../../../core/auth/session.service';
import { DraftUnavailableError } from '../../../core/erpnext/draft';
import { PrefillUnavailableError } from '../../../core/tasks/prefill-entry';
import { TaskPrefillService } from '../../../core/tasks/task-prefill.service';
import { QuickSaleStore } from '../data-access/quick-sale.store';
import { SaleFlowContainer } from './sale-flow.container';

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
      { provide: QuickSaleStore, useValue: { resume: vi.fn(), ...store } },
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
        useValue: {
          snapshot: { queryParamMap: query, paramMap: convertToParamMap({ name: 'PINV-0068' }) },
          queryParamMap: new BehaviorSubject(query),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SaleFlowContainer);
  fixture.detectChanges();
  return fixture;
}

describe('SaleFlowContainer', () => {
  it('shows the steps straight away when no draft is named', () => {
    const openDraft = vi.fn();
    const fixture = setup(null, { openDraft });
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    expect(openDraft).not.toHaveBeenCalled();
  });

  it('starts over a sale left behind with an empty basket when the flow is entered', () => {
    const resume = vi.fn();
    setup(null, { resume });
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('opens the draft named in the address instead of resuming', async () => {
    const openDraft = vi.fn().mockResolvedValue('opened');
    const fixture = setup('DRAFT-1', { openDraft });
    expect(fixture.nativeElement.querySelector('app-draft-gate')).not.toBeNull();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(openDraft).toHaveBeenCalledWith('DRAFT-1');
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-draft-gate')).toBeNull();
  });

  it('shows an error with a way back, never an empty form, when the draft cannot be opened', async () => {
    const openDraft = vi.fn().mockRejectedValue(new DraftUnavailableError('DRAFT-1'));
    const fixture = setup('DRAFT-1', { openDraft });
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull();
    expect(text).toContain("This draft can't be continued");
    expect(text).toContain('Back to drafts');
    expect(text).not.toContain('Try again');
  });

  it('offers a retry when the draft failed to load', async () => {
    const openDraft = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('opened');
    const fixture = setup('DRAFT-1', { openDraft });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("Couldn't open the draft");
    const retry = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Try again'));
    retry?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(openDraft).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('app-draft-gate')).toBeNull();
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
