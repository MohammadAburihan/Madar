import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import {
  CustomerDirectoryService,
  CustomerOption,
} from '../../../core/customers/customer-directory.service';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { PaymentAccountsService } from '../../../core/money/payment-accounts.service';
import { CollectionApiService } from './collection-api.service';
import { CollectionResult, UnpaidInvoice } from './collection.models';
import { CollectionStore } from './collection.store';

const LINA: CustomerOption = {
  id: 'Lina Haddad',
  name: 'Lina Haddad',
  phone: null,
  city: null,
  outstanding: 250,
  unpaidInvoices: 2,
};
const INVOICES: UnpaidInvoice[] = [
  { name: 'SI-1', postingDate: '2026-10-01', dueDate: null, total: 100, outstanding: 50 },
  { name: 'SI-2', postingDate: '2026-10-05', dueDate: null, total: 320, outstanding: 200 },
];
const CASH = { mode: 'Cash', account: 'Cash - RN', label: 'Cash', isBank: false };
const RESULT: CollectionResult = {
  payment: 'PAY-1',
  postingDate: '2026-10-14',
  amount: 250,
  invoices: [],
};

function setup() {
  const api = {
    unpaidInvoices: vi.fn().mockResolvedValue(INVOICES),
    confirm: vi.fn(),
    find: vi.fn(),
  };
  const accounts = { list: vi.fn().mockResolvedValue([CASH]) };
  TestBed.configureTestingModule({
    providers: [
      { provide: CollectionApiService, useValue: api },
      { provide: PaymentAccountsService, useValue: accounts },
      {
        provide: CustomerDirectoryService,
        useValue: { search: vi.fn().mockResolvedValue([LINA]) },
      },
      { provide: SessionService, useValue: { capabilities: () => capabilitiesFor('salesperson') } },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery' }) },
      },
    ],
  });
  return { store: TestBed.inject(CollectionStore), api, accounts };
}

async function ready() {
  const ctx = setup();
  await ctx.store.loadAccounts();
  await ctx.store.selectCustomer(LINA);
  return ctx;
}

describe('CollectionStore', () => {
  it('loads the accounts the role may use and picks the first', async () => {
    const { store, accounts } = setup();
    await store.loadAccounts();
    expect(accounts.list).toHaveBeenCalledWith('Rehan Nursery', ['Cash', 'Credit Card']);
    expect(store.account()).toEqual(CASH);
  });

  it('loads unpaid invoices, selects them all and asks for everything they owe', async () => {
    const { store, api } = await ready();
    expect(api.unpaidInvoices).toHaveBeenCalledWith('Lina Haddad', 'Rehan Nursery');
    expect([...store.selected()]).toEqual(['SI-1', 'SI-2']);
    expect(store.due()).toBe(250);
    expect(store.amountInput()).toBe('250.00');
    expect(store.ready()).toBe(true);
  });

  it('preselects only the deep-linked invoice', async () => {
    const { store } = setup();
    await store.selectCustomer(LINA, 'SI-2');
    expect([...store.selected()]).toEqual(['SI-2']);
    expect(store.amountInput()).toBe('200.00');
  });

  it('resets the amount when the chosen invoices change', async () => {
    const { store } = await ready();
    store.amountInput.set('10');
    store.toggle('SI-2');
    expect([...store.selected()]).toEqual(['SI-1']);
    expect(store.amountInput()).toBe('50.00');
    store.toggle('SI-1');
    expect(store.amountInput()).toBe('');
    expect(store.ready()).toBe(false);
  });

  it('accepts amounts above zero up to what is due, in either digit set', async () => {
    const { store } = await ready();
    for (const [input, valid] of [
      ['0', false],
      ['-5', false],
      ['abc', false],
      ['250.01', false],
      ['250', true],
      ['٧٠٫٥', true],
    ] as const) {
      store.amountInput.set(input);
      expect(store.amountValid()).toBe(valid);
    }
    expect(store.amount()).toBe(70.5);
    expect(store.allocations()).toEqual([
      { invoice: 'SI-1', amount: 50 },
      { invoice: 'SI-2', amount: 20.5 },
    ]);
    expect(store.dueAfter()).toBe(179.5);
    store.amountInput.set('300');
    expect(store.allocations()).toEqual([]);
    expect(store.dueAfter()).toBe(250);
  });

  it('confirms and keeps the result', async () => {
    const { store, api } = await ready();
    api.confirm.mockResolvedValue(RESULT);
    await store.confirm();
    expect(api.confirm.mock.calls[0][0]).toMatchObject({
      company: 'Rehan Nursery',
      customer: 'Lina Haddad',
      account: CASH,
      amount: 250,
      reference: store.reference(),
    });
    expect(store.state()).toBe('confirmed');
    expect(store.result()).toEqual(RESULT);
  });

  it('marks a timed-out confirmation unresolved and busy', async () => {
    const { store, api } = await ready();
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    expect(store.state()).toBe('unresolved');
    expect(store.busy()).toBe(true);
  });

  it('classifies failures', async () => {
    const { store, api } = await ready();
    for (const [status, failure] of [
      [403, 'permission'],
      [500, 'error'],
    ] as const) {
      api.confirm.mockRejectedValueOnce(new HttpErrorResponse({ status }));
      await store.confirm();
      expect(store.state()).toBe('failed');
      expect(store.failure()).toBe(failure);
    }
  });

  it('keeps the draft a rejected confirmation inserted, so a retry submits it', async () => {
    const { store, api } = await ready();
    api.confirm.mockImplementationOnce(async (_r, _d, onInserted: (name: string) => void) => {
      onInserted('PAY-5');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    expect(store.draft()).toBe('PAY-5');
    api.confirm.mockResolvedValue(RESULT);
    await store.confirm();
    expect(api.confirm.mock.calls[1][1]).toBe('PAY-5');
  });

  it('checks an unresolved result: draft, not found, pending or found', async () => {
    const { store, api } = await ready();
    api.find.mockResolvedValueOnce({ draft: 'PAY-7' });
    expect(await store.checkResult()).toBe('not-found');
    expect(store.draft()).toBe('PAY-7');
    expect(store.state()).toBe('idle');

    api.find.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    expect(await store.checkResult()).toBe('pending');
    expect(store.state()).toBe('unresolved');

    api.find.mockResolvedValueOnce(RESULT);
    expect(await store.checkResult()).toBe('found');
    expect(store.state()).toBe('confirmed');
  });

  it('starts a fresh collection with a new reference', async () => {
    const { store, api } = await ready();
    api.confirm.mockResolvedValue(RESULT);
    await store.confirm();
    const reference = store.reference();
    store.start();
    expect(store.reference()).not.toBe(reference);
    expect(store.reference()).toMatch(/^COLL-/);
    expect(store.customer()).toBeNull();
    expect(store.invoices()).toEqual([]);
    expect(store.selected().size).toBe(0);
    expect(store.result()).toBeNull();
    expect(store.state()).toBe('idle');
  });
});
