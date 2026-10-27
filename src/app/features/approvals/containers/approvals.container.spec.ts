import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { translocoTesting } from '../../../../testing/real-translator';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ViewportService } from '../../../core/layout/viewport.service';
import { LoadMoreComponent } from '../../../shared/ui/load-more.component';
import { ApprovalsApiService } from '../data-access/approvals-api.service';
import { ApprovalsContainer } from './approvals.container';

describe('ApprovalsContainer search over loaded rows', () => {
  function setup(more: boolean) {
    const business = { name: 'Rehan Nursery', currency: 'ILS' };
    const inbox = async () => ({ items: [], more });
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ApprovalsApiService, useValue: { inbox: () => inbox } },
        {
          provide: BusinessService,
          useValue: { ensure: async () => business, active: () => business },
        },
        { provide: ViewportService, useValue: { viewport: signal('mobile') } },
        {
          provide: SessionService,
          useValue: {
            capabilities: signal(capabilitiesFor('owner')),
            persona: signal('owner'),
            user: signal({ id: 'lina@example.com' }),
            checkExpired: vi.fn(),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ApprovalsContainer);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const type = (text: string) => {
      const input = el.querySelector('app-search-field input') as HTMLInputElement;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const loadMore = () =>
      fixture.debugElement.query(By.directive(LoadMoreComponent))?.componentInstance as
        LoadMoreComponent | undefined;
    return { fixture, el, type, loadMore };
  }

  it('puts the Leave requests button above the search field', async () => {
    const { fixture, el } = setup(false);
    await fixture.whenStable();
    fixture.detectChanges();
    const primary = el.querySelector('button.md-btn--primary') as HTMLElement;
    const search = el.querySelector('app-search-field') as HTMLElement;
    expect(primary).not.toBeNull();
    expect(primary.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('tells the search covers only what is loaded, and stops loading by scroll while a term is typed', async () => {
    const { fixture, el, type, loadMore } = setup(true);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(loadMore()).toBeDefined();
    });
    expect(loadMore()!.autoLoad()).toBe(true);

    type('zzz');
    expect(el.textContent).toContain('Searching the loaded entries');
    expect(el.textContent).not.toContain('Nothing waiting matches your search.');
    expect(loadMore()!.autoLoad()).toBe(false);

    type('');
    expect(loadMore()!.autoLoad()).toBe(true);
  });

  it('says plainly that nothing matches once everything is loaded', async () => {
    const { fixture, el, type } = setup(false);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('app-search-field')).not.toBeNull();
      expect(el.textContent).not.toMatch(/Loading/);
    });
    type('zzz');
    expect(el.textContent).not.toContain('Searching the loaded entries');
    expect(el.textContent).toContain('Nothing waiting matches your search.');
  });
});
