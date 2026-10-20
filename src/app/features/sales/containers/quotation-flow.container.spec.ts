import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { translocoTesting } from '../../../../testing/real-translator';
import { SessionService } from '../../../core/auth/session.service';
import { DraftUnavailableError } from '../../../core/erpnext/draft';
import { QuotationStore } from '../data-access/quotation.store';
import { QuotationFlowContainer } from './quotation-flow.container';

function setup(draft: string | null, store: Record<string, unknown>) {
  const query = convertToParamMap(draft ? { draft } : {});
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      provideRouter([]),
      { provide: QuotationStore, useValue: store },
      { provide: SessionService, useValue: { checkExpired: vi.fn() } },
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
});
