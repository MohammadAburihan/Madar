import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { translocoTesting } from '../../../../testing/real-translator';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SalesRecordsApiService } from '../data-access/sales-records-api.service';
import { SalesContainer } from './sales.container';

const invoice = {
  name: 'SI-1',
  customer: 'Lina Haddad',
  docstatus: 1,
  status: 'Unpaid',
  isReturn: false,
  delivered: true,
  total: 100,
  outstanding: 100,
  date: '2026-10-10',
};

describe('SalesContainer', () => {
  it('rewords the cards on a language switch without loading the list again', async () => {
    const invoices = vi.fn().mockResolvedValue({ items: [invoice], more: false });
    const business = { name: 'Rehan Nursery', currency: 'ILS' };
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: SalesRecordsApiService, useValue: { invoices } },
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
    const fixture = TestBed.createComponent(SalesContainer);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      cards: () => { message: string }[];
    };
    await vi.waitFor(() => expect(page.cards().length).toBe(1));
    const english = page.cards()[0].message;

    const primary = (fixture.nativeElement as HTMLElement).querySelector(
      'button.md-btn--primary',
    ) as HTMLElement;
    const search = (fixture.nativeElement as HTMLElement).querySelector(
      'app-search-field',
    ) as HTMLElement;
    expect(primary).not.toBeNull();
    expect(primary.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await TestBed.inject(LanguageService).use('ar');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(invoices).toHaveBeenCalledTimes(1);
    expect(page.cards()[0].message).not.toBe(english);
  });
});
