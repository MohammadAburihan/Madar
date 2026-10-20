import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { translocoTesting } from '../../../../testing/real-translator';
import { SessionService } from '../../../core/auth/session.service';
import { DraftUnavailableError } from '../../../core/erpnext/draft';
import { PurchaseOrderStore } from '../data-access/purchase-order.store';
import { PurchaseFlowContainer } from './purchase-flow.container';

function setup(draft: string | null, store: Record<string, unknown>) {
  const query = convertToParamMap(draft ? { draft } : {});
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      provideRouter([]),
      { provide: PurchaseOrderStore, useValue: store },
      { provide: SessionService, useValue: { checkExpired: vi.fn() } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: query, paramMap: convertToParamMap({ name: 'PINV-0068' }) },
          queryParamMap: new BehaviorSubject(query),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PurchaseFlowContainer);
  fixture.detectChanges();
  return fixture;
}

describe('PurchaseFlowContainer', () => {
  it('resumes the task when it is entered from elsewhere', () => {
    const resume = vi.fn();
    setup(null, { resume });
    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledWith(false);
  });

  it('opens the draft named in the address instead of resuming', async () => {
    const resume = vi.fn();
    const openDraft = vi.fn().mockResolvedValue('opened');
    const fixture = setup('DRAFT-1', { resume, openDraft });
    expect(fixture.nativeElement.querySelector('app-draft-gate')).not.toBeNull();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(openDraft).toHaveBeenCalledWith('DRAFT-1');
    expect(resume).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-draft-gate')).toBeNull();
  });

  it('shows an error with a way back, never an empty form, when the draft cannot be opened', async () => {
    const openDraft = vi.fn().mockRejectedValue(new DraftUnavailableError('DRAFT-1'));
    const fixture = setup('DRAFT-1', { resume: vi.fn(), openDraft });
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
    const fixture = setup('DRAFT-1', { resume: vi.fn(), openDraft });
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
});
