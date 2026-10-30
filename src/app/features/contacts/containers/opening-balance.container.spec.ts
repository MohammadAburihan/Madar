import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { translocoTesting } from '../../../../testing/real-translator';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { OpeningBalanceApiService } from '../data-access/opening-balance-api.service';
import { OpeningBalanceStore } from '../data-access/opening-balance.store';
import { OpeningBalanceContainer } from './opening-balance.container';

const TARGET = {
  id: 'Lina Haddad',
  name: 'Lina Haddad',
  blocked: null,
  account: 'Temporary Opening - RN',
  costCenter: 'Main - RN',
  uom: 'Nos',
  precision: 2,
};
const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };

async function setup() {
  const api = {
    target: vi.fn().mockResolvedValue(TARGET),
    record: vi.fn(),
    posted: vi.fn(),
  };
  const user = signal<{ id: string } | null>({ id: 'rehan' });
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      provideRouter([]),
      { provide: OpeningBalanceApiService, useValue: api },
      {
        provide: SessionService,
        useValue: {
          user,
          capabilities: signal({ recordOpeningBalance: true }),
          checkExpired: vi.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: BusinessService,
        useValue: { active: signal(BUSINESS), ensure: async () => BUSINESS },
      },
      {
        provide: SiteClockService,
        useValue: { ensure: async () => undefined, now: () => new Date(2026, 9, 30, 9, 41) },
      },
    ],
  });
  const fixture = TestBed.createComponent(OpeningBalanceContainer);
  fixture.componentRef.setInput('kind', 'customers');
  fixture.componentRef.setInput('id', 'Lina Haddad');
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, api, user, store: TestBed.inject(OpeningBalanceStore) };
}

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  for (let i = 0; i < 3; i++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }
}

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/[⁦-⁩]/g, '');

describe('OpeningBalanceContainer', () => {
  it('reviews the amount typed after a refusal and an edit, not the one that was refused', async () => {
    const { fixture, el, api, store } = await setup();
    store.setAmount('100');
    store.review();
    api.record.mockRejectedValue(new HttpErrorResponse({ status: 417 }));
    await store.confirm('x');
    fixture.detectChanges();
    expect(text(el)).toContain('ILS 100.00');

    store.back();
    store.setAmount('50');
    store.review();
    await settle(fixture);
    expect(text(el)).toContain('ILS 50.00');
    expect(text(el)).not.toContain('ILS 100.00');
  });

  it('keeps showing what was sent while the answer is lost', async () => {
    const { fixture, el, api, store } = await setup();
    store.setAmount('100');
    store.review();
    const { UnresolvedError } = await import('../../../core/erpnext/confirmation');
    api.record.mockRejectedValue(new UnresolvedError());
    await store.confirm('x');
    await settle(fixture);
    expect(text(el)).toContain("Couldn't confirm the result");
    api.posted.mockResolvedValue(null);
    await store.checkResult();
    await settle(fixture);
    expect(text(el)).toContain('ILS 100.00');
  });

  it('loads again when the store is reset behind the mounted page', async () => {
    const { fixture, el, api, user, store } = await setup();
    expect(text(el)).toContain('Amount');
    expect(api.target).toHaveBeenCalledTimes(1);
    user.set({ id: 'lina' });
    TestBed.tick();
    await settle(fixture);
    expect(api.target).toHaveBeenCalledTimes(2);
    expect([store.loaded(), store.partyId()]).toEqual([true, 'Lina Haddad']);
    expect(text(el)).not.toContain('Loading');
  });

  it('says why more decimals than the business keeps are refused', async () => {
    const { fixture, el, store } = await setup();
    store.setAmount('10.555');
    const button = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Review'),
    );
    button?.click();
    await settle(fixture);
    expect(text(el)).toContain('Use at most 2 decimals');
  });

  it('does not let a cached page take the store back, even while it is still active', async () => {
    const { fixture: a, api, user } = await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

    // A has not been told it left yet (mid-transition) when B opens another contact.
    const b = TestBed.createComponent(OpeningBalanceContainer);
    b.componentRef.setInput('kind', 'customers');
    b.componentRef.setInput('id', 'Sami Khoury');
    await settle(b);
    await settle(a);
    await settle(b);

    expect(api.target.mock.calls.map((c) => c[1])).toEqual(['Lina Haddad', 'Sami Khoury']);
    expect(TestBed.inject(OpeningBalanceStore).partyId()).toBe('Sami Khoury');
    expect(navigate).not.toHaveBeenCalled();

    // A reset (another user signs in) reloads only the page in view.
    (a.componentInstance as unknown as { ionViewWillLeave(): void }).ionViewWillLeave();
    user.set({ id: 'lina' });
    TestBed.tick();
    await settle(b);
    await settle(a);
    expect(api.target.mock.calls.map((c) => c[1])).toEqual([
      'Lina Haddad',
      'Sami Khoury',
      'Sami Khoury',
    ]);
    expect(TestBed.inject(OpeningBalanceStore).partyId()).toBe('Sami Khoury');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('offers Start over after a check finds nothing, and starts a fresh task', async () => {
    const { fixture, el, api, store } = await setup();
    store.setAmount('100');
    store.review();
    const { UnresolvedError } = await import('../../../core/erpnext/confirmation');
    api.record.mockRejectedValue(new UnresolvedError());
    await store.confirm('x');
    api.posted.mockResolvedValue(null);
    await store.checkResult();
    await settle(fixture);
    const reference = store.reference();
    expect(text(el)).toContain("wasn't found under this reference");
    const button = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Start over'),
    );
    expect(button).toBeTruthy();
    button?.click();
    await settle(fixture);
    expect(store.reference()).not.toBe(reference);
    expect(text(el)).toContain('Amount');
    expect(text(el)).not.toContain('Start over');
  });
});
