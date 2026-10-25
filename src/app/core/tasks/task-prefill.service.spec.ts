import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SessionService } from '../auth/session.service';
import { BusinessService } from '../business/business.service';
import { PREFILL_TTL_MS, PrefillRequest, TaskPrefillService } from './task-prefill.service';

const SALE: PrefillRequest = {
  kind: 'quick_sale',
  payload: { customer: 'Lina Haddad', lines: [{ item_code: 'OLV-20', qty: 2 }] },
};
const QUOTE: PrefillRequest = {
  kind: 'quotation',
  payload: { customer: 'Lina Haddad', lines: [{ item_code: 'OLV-20', qty: 1 }] },
};

function setup() {
  const user = signal<{ id: string } | null>({ id: 'lina@rehan.example' });
  const business = signal<{ name: string } | null>({ name: 'Rehan Nursery' });
  TestBed.configureTestingModule({
    providers: [
      { provide: SessionService, useValue: { user } },
      { provide: BusinessService, useValue: { active: business } },
    ],
  });
  const service = TestBed.inject(TaskPrefillService);
  TestBed.tick();
  return { service, user, business };
}

describe('TaskPrefillService', () => {
  afterEach(() => vi.useRealTimers());

  it('gives a proposal to the task it was made for, under the id it was put with', () => {
    const { service } = setup();
    const id = service.put(SALE)!;
    expect(id).toMatch(/^PF-/);
    expect(service.take('quick_sale', id)).toEqual(SALE.payload);
  });

  it('gives it up once', () => {
    const { service } = setup();
    const id = service.put(SALE)!;
    service.take('quick_sale', id);
    expect(service.take('quick_sale', id)).toBeNull();
  });

  it('keeps one proposal per task: a newer one replaces the older, other tasks are left alone', () => {
    const { service } = setup();
    const first = service.put(SALE)!;
    const quote = service.put(QUOTE)!;
    const second = service.put(SALE)!;
    expect(service.take('quick_sale', first)).toBeNull();
    expect(service.take('quick_sale', second)).toEqual(SALE.payload);
    expect(service.take('quotation', quote)).toEqual(QUOTE.payload);
  });

  it('refuses another id and another task', () => {
    const { service } = setup();
    const id = service.put(SALE)!;
    expect(service.take('quick_sale', 'PF-0000000')).toBeNull();
    expect(service.take('quotation', id)).toBeNull();
    expect(service.take('quick_sale', id)).toEqual(SALE.payload);
  });

  it('refuses a proposal ten minutes old, and still uses it up', () => {
    vi.useFakeTimers();
    const { service } = setup();
    const id = service.put(SALE)!;
    vi.advanceTimersByTime(PREFILL_TTL_MS - 1);
    expect(service.take('quick_sale', id)).toEqual(SALE.payload);
    const stale = service.put(SALE)!;
    vi.advanceTimersByTime(PREFILL_TTL_MS);
    expect(service.take('quick_sale', stale)).toBeNull();
    expect(service.take('quick_sale', stale)).toBeNull();
  });

  it("refuses another user's proposal without waiting for the effect to clear it", () => {
    const { service, user } = setup();
    const id = service.put(SALE)!;
    user.set({ id: 'sami@rehan.example' });
    expect(service.take('quick_sale', id)).toBeNull();
  });

  it("refuses another business's proposal", () => {
    const { service, business } = setup();
    const id = service.put(SALE)!;
    business.set({ name: 'Other Business' });
    expect(service.take('quick_sale', id)).toBeNull();
  });

  it('forgets what it held when the user or the business changes, even if they change back', () => {
    const { service, user } = setup();
    const id = service.put(SALE)!;
    user.set(null);
    TestBed.tick();
    user.set({ id: 'lina@rehan.example' });
    TestBed.tick();
    expect(service.take('quick_sale', id)).toBeNull();
  });

  it('keeps it when the same user is read again as a new object', () => {
    const { service, user } = setup();
    const id = service.put(SALE)!;
    user.set({ id: 'lina@rehan.example' });
    TestBed.tick();
    expect(service.take('quick_sale', id)).toEqual(SALE.payload);
  });

  it('holds nothing for nobody: without a signed-in user or a business there is no id', () => {
    const { service, user, business } = setup();
    user.set(null);
    expect(service.put(SALE)).toBeNull();
    user.set({ id: 'lina@rehan.example' });
    business.set(null);
    expect(service.put(SALE)).toBeNull();
  });
});
