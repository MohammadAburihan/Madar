import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { OpeningBalanceApiService, OpeningChangedError } from './opening-balance-api.service';
import { OpeningBalanceStore } from './opening-balance.store';

const TARGET = {
  id: 'Lina Haddad',
  name: 'Lina Haddad',
  blocked: null,
  account: 'Temporary Opening - RN',
  costCenter: 'Main - RN',
  uom: 'Nos',
  precision: 2,
};

function setup(target: unknown = TARGET) {
  const api = {
    target: vi.fn().mockResolvedValue(target),
    record: vi.fn(),
    posted: vi.fn(),
  };
  const user = signal<{ id: string } | null>({ id: 'rehan' });
  const company = signal<{ name: string; currency: string } | null>({
    name: 'Rehan Nursery',
    currency: 'ILS',
  });
  const session = { user, checkExpired: vi.fn().mockResolvedValue(undefined) };
  TestBed.configureTestingModule({
    providers: [
      { provide: OpeningBalanceApiService, useValue: api },
      { provide: SessionService, useValue: session },
      {
        provide: BusinessService,
        useValue: {
          ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }),
          active: company,
        },
      },
      {
        provide: SiteClockService,
        useValue: { ensure: () => Promise.resolve(), now: () => new Date(2026, 9, 30, 9, 41) },
      },
    ],
  });
  return { store: TestBed.inject(OpeningBalanceStore), api, user, company, session };
}

async function filled(amount = '250.50') {
  const ctx = setup();
  ctx.store.start('customers', 'Lina Haddad');
  await ctx.store.load();
  ctx.store.setAmount(amount);
  return ctx;
}

describe('OpeningBalanceStore', () => {
  it("loads the contact and suggests the site's today; needs an amount above 0", async () => {
    const { store } = setup();
    store.start('customers', 'Lina Haddad');
    await store.load();
    expect([store.loaded(), store.date(), store.today(), store.ready()]).toEqual([
      true,
      '2026-10-30',
      '2026-10-30',
      false,
    ]);
    store.setAmount('0');
    expect(store.ready()).toBe(false);
    store.setAmount('250.50');
    expect(store.ready()).toBe(true);
  });

  it('reads typed Arabic digits and posts the amount typed', async () => {
    const { store } = setup();
    store.setAmount('٣٠٠٫٥');
    expect(store.postedAmount()).toBe(300.5);
    store.setAmount('٣٠٠٫٥٠٤');
    expect(store.amount()).toBeCloseTo(300.504);
    expect(store.amountProblem()).toBe('decimals');
    store.setAmount('abc');
    expect(store.postedAmount()).toBe(0);
  });

  it('accepts earlier dates but not a later one than the site’s today', async () => {
    const { store } = await filled();
    store.setDate('2025-03-01');
    expect(store.ready()).toBe(true);
    store.setDate('2026-10-31');
    expect(store.ready()).toBe(false);
    store.setDate('');
    expect(store.ready()).toBe(false);
  });

  it('refuses more decimals than the money precision instead of rounding them away', async () => {
    const ctx = setup({ ...TARGET, precision: 0 });
    ctx.store.start('customers', 'Lina Haddad');
    await ctx.store.load();
    ctx.store.setAmount('10.5');
    expect([ctx.store.amountProblem(), ctx.store.ready(), ctx.store.postedAmount()]).toEqual([
      'decimals',
      false,
      0,
    ]);
    ctx.store.setAmount('10');
    expect([ctx.store.amountProblem(), ctx.store.ready(), ctx.store.postedAmount()]).toEqual([
      null,
      true,
      10,
    ]);
    ctx.store.setAmount('0');
    expect(ctx.store.amountProblem()).toBe('invalid');
  });

  it('allows three decimals where ERPNext keeps three, and refuses a fourth', async () => {
    const ctx = setup({ ...TARGET, precision: 3 });
    ctx.store.start('customers', 'Lina Haddad');
    await ctx.store.load();
    ctx.store.setAmount('10.125');
    expect([ctx.store.amountProblem(), ctx.store.postedAmount()]).toEqual([null, 10.125]);
    ctx.store.setAmount('10.1255');
    expect(ctx.store.amountProblem()).toBe('decimals');
  });

  it('is never ready for a blocked contact', async () => {
    const ctx = setup({ ...TARGET, blocked: 'disabled' });
    ctx.store.start('customers', 'Lina Haddad');
    await ctx.store.load();
    ctx.store.setAmount('10');
    expect(ctx.store.ready()).toBe(false);
  });

  it('says the load failed, and can try again', async () => {
    const { store, api } = setup();
    api.target.mockRejectedValueOnce(new Error('down'));
    store.start('customers', 'Lina Haddad');
    await store.load();
    expect([store.loaded(), store.loadFailed()]).toEqual([false, true]);
    await store.load();
    expect([store.loaded(), store.loadFailed()]).toEqual([true, false]);
  });

  it('ignores a contact that loads after the task was restarted for another', async () => {
    const { store, api } = setup();
    let release: (value: unknown) => void = () => undefined;
    api.target.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    store.start('customers', 'Lina Haddad');
    const slow = store.load();
    store.start('suppliers', 'Green Clay');
    release(TARGET);
    await slow;
    expect([store.target(), store.loaded()]).toEqual([null, false]);
  });

  it('moves to the review only when ready, and back to edit', async () => {
    const { store } = await filled('0');
    store.review();
    expect(store.step()).toBe('form');
    store.setAmount('250.50');
    store.review();
    expect(store.step()).toBe('review');
    store.back();
    expect(store.step()).toBe('form');
  });

  it('records the typed details in the company currency and shows the invoice', async () => {
    const { store, api } = await filled();
    store.setDate('2026-01-03');
    store.setNote('Old job');
    api.record.mockResolvedValue({ name: 'ACC-SINV-0770', total: 250.5 });
    await store.confirm('Opening balance');
    expect(api.record.mock.calls[0][0]).toEqual({
      reference: store.reference(),
      kind: 'customers',
      party: 'Lina Haddad',
      company: 'Rehan Nursery',
      currency: 'ILS',
      amount: 250.5,
      date: '2026-01-03',
      note: 'Old job',
      itemName: 'Opening balance',
      account: 'Temporary Opening - RN',
      costCenter: 'Main - RN',
      uom: 'Nos',
      precision: 2,
    });
    expect([store.state(), store.result()]).toEqual([
      'confirmed',
      { name: 'ACC-SINV-0770', total: 250.5 },
    ]);
  });

  it('records once for a double tap', async () => {
    const { store, api } = await filled();
    api.record.mockResolvedValue({ name: 'ACC-SINV-0770', total: 250.5 });
    await Promise.all([store.confirm('x'), store.confirm('x')]);
    expect(api.record).toHaveBeenCalledTimes(1);
  });

  it('a lost answer locks the details and offers only a check', async () => {
    const { store, api } = await filled();
    api.record.mockRejectedValue(new UnresolvedError());
    await store.confirm('x');
    expect([store.state(), store.lost(), store.busy(), store.locked()]).toEqual([
      'unresolved',
      true,
      true,
      true,
    ]);
    store.setAmount('999');
    expect(store.amountInput()).toBe('250.50');
    await store.confirm('x');
    expect(api.record).toHaveBeenCalledTimes(1);
  });

  it('check result shows the invoice found, without sending anything', async () => {
    const { store, api } = await filled();
    api.record.mockRejectedValue(new UnresolvedError());
    await store.confirm('x');
    api.posted.mockResolvedValue({ name: 'ACC-SINV-0770', total: 250.5 });
    expect(await store.checkResult()).toBe('found');
    expect([store.state(), store.result()?.name]).toEqual(['confirmed', 'ACC-SINV-0770']);
    expect(api.record).toHaveBeenCalledTimes(1);
    expect(api.posted.mock.calls[0][0].reference).toBe(store.reference());
  });

  it('check result finding nothing returns to the review with the same reference and locked details', async () => {
    const { store, api } = await filled();
    const reference = store.reference();
    api.record.mockRejectedValue(new UnresolvedError());
    await store.confirm('x');
    api.posted.mockResolvedValue(null);
    expect(await store.checkResult()).toBe('not-found');
    expect([store.state(), store.notCreated(), store.reference(), store.locked()]).toEqual([
      'idle',
      true,
      reference,
      true,
    ]);
    api.record.mockResolvedValue({ name: 'ACC-SINV-0770', total: 250.5 });
    await store.confirm('x');
    expect(api.record.mock.calls[1][0].reference).toBe(reference);
    expect(store.state()).toBe('confirmed');
  });

  it('check result only runs once the confirmation gave up', async () => {
    const { store, api } = await filled();
    let release: (value: unknown) => void = () => undefined;
    api.record.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const confirming = store.confirm('x');
    expect(await store.checkResult()).toBe('pending');
    expect(api.posted).not.toHaveBeenCalled();
    release({ name: 'ACC-SINV-0770', total: 250.5 });
    await confirming;
    expect(store.state()).toBe('confirmed');
  });

  it('stays unresolved when the check itself cannot reach ERPNext', async () => {
    const { store, api } = await filled();
    api.record.mockRejectedValue(new UnresolvedError());
    await store.confirm('x');
    api.posted.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    expect(await store.checkResult()).toBe('pending');
    expect(store.state()).toBe('unresolved');
  });

  it('keeps the form editable after a definite refusal and names the reason', async () => {
    const { store, api, session } = await filled();
    api.record.mockRejectedValue(new HttpErrorResponse({ status: 403 }));
    await store.confirm('x');
    expect([store.state(), store.failure(), store.lost()]).toEqual(['failed', 'permission', false]);
    expect(session.checkExpired).toHaveBeenCalled();
    store.setAmount('300');
    expect([store.state(), store.failure(), store.amountInput()]).toEqual(['idle', null, '300']);
    api.record.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    await store.confirm('x');
    expect(store.failure()).toBe('offline');
    api.record.mockRejectedValue(new HttpErrorResponse({ status: 417 }));
    await store.confirm('x');
    expect(store.failure()).toBe('error');
  });

  it("keeps ERPNext's own words for a refusal, and drops the old request when the form is edited", async () => {
    const { store, api } = await filled('100');
    api.record.mockRejectedValue(
      new HttpErrorResponse({
        status: 417,
        error: {
          _server_messages: JSON.stringify([JSON.stringify({ message: 'Credit limit crossed' })]),
        },
      }),
    );
    await store.confirm('x');
    expect([store.failure(), store.failureMessage(), store.sent()?.amount]).toEqual([
      'error',
      'Credit limit crossed',
      100,
    ]);
    store.setAmount('50');
    expect([store.failureMessage(), store.sent()]).toEqual([null, null]);
    api.record.mockResolvedValue({ name: 'ACC-SINV-1', total: 50 });
    await store.confirm('x');
    expect(api.record.mock.calls[1][0].amount).toBe(50);
  });

  it('keeps a lost task for the same contact after a not-found check, with its reference and details', async () => {
    const { store, api } = await filled('100');
    const reference = store.reference();
    api.record.mockRejectedValue(new UnresolvedError());
    await store.confirm('x');
    api.posted.mockResolvedValue(null);
    await store.checkResult();
    expect(store.resume('customers', 'Lina Haddad')).toBe(false);
    expect([store.reference(), store.amountInput(), store.lost(), store.state()]).toEqual([
      reference,
      '100',
      true,
      'idle',
    ]);
    // Another contact starts fresh.
    expect(store.resume('suppliers', 'Green Clay')).toBe(false);
    expect([store.reference() === reference, store.amountInput(), store.lost()]).toEqual([
      false,
      '',
      false,
    ]);
  });

  it('reports a posted invoice that no longer matches as changed, with a new reference', async () => {
    const { store, api } = await filled();
    const reference = store.reference();
    api.record.mockRejectedValue(new OpeningChangedError('ACC-SINV-0770'));
    await store.confirm('x');
    expect([store.state(), store.failure()]).toEqual(['failed', 'changed']);
    expect(store.reference()).not.toBe(reference);
    expect(store.result()).toBeNull();
  });

  it('ignores an answer that lands after the task restarted', async () => {
    const { store, api } = await filled();
    let release: (value: unknown) => void = () => undefined;
    api.record.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const confirming = store.confirm('x');
    store.start('suppliers', 'Green Clay');
    release({ name: 'ACC-SINV-0770', total: 250.5 });
    await confirming;
    expect([store.state(), store.result()]).toEqual(['idle', null]);
  });

  it('resume keeps a running or unseen task, and starts over otherwise', async () => {
    const { store, api } = await filled();
    api.record.mockRejectedValue(new UnresolvedError());
    await store.confirm('x');
    const reference = store.reference();
    expect(store.resume('customers', 'Lina Haddad')).toBe(false);
    expect(store.reference()).toBe(reference);
    expect(store.resume('suppliers', 'Green Clay')).toBe(true);
    expect(store.partyId()).toBe('Lina Haddad');

    api.posted.mockResolvedValue({ name: 'ACC-SINV-0770', total: 250.5 });
    await store.checkResult();
    expect(store.resume('suppliers', 'Green Clay')).toBe(true);
    store.resultShown.set(true);
    expect(store.resume('suppliers', 'Green Clay')).toBe(false);
    expect([store.kind(), store.partyId(), store.state(), store.amountInput()]).toEqual([
      'suppliers',
      'Green Clay',
      'idle',
      '',
    ]);
    expect(store.reference()).not.toBe(reference);
  });

  it('counts as an open task while confirming, so signing out is refused', async () => {
    const { store, api } = await filled();
    api.record.mockRejectedValue(new UnresolvedError());
    await store.confirm('x');
    expect(TestBed.inject(OpenTasksService).any()).toBe(true);
    api.posted.mockResolvedValue({ name: 'ACC-SINV-0770', total: 250.5 });
    await store.checkResult();
    expect(TestBed.inject(OpenTasksService).any()).toBe(false);
  });

  it('clears when another user signs in or the business changes', async () => {
    const { store, user, company } = await filled();
    TestBed.tick();
    user.set({ id: 'lina' });
    TestBed.tick();
    expect([store.amountInput(), store.target()]).toEqual(['', null]);
    store.setAmount('5');
    company.set({ name: 'Other Co', currency: 'ILS' });
    TestBed.tick();
    expect(store.amountInput()).toBe('');
  });
});
