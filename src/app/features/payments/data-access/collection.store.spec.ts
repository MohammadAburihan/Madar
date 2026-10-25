import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { PrefillUnavailableError } from '../../../core/tasks/prefill-entry';
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
  {
    name: 'SI-1',
    postingDate: '2026-10-01',
    dueDate: null,
    total: 100,
    outstanding: 50,
    receivable: 'Debtors - RN',
  },
  {
    name: 'SI-2',
    postingDate: '2026-10-05',
    dueDate: null,
    total: 320,
    outstanding: 200,
    receivable: 'Debtors - RN',
  },
];
const OTHER_ACCOUNT: UnpaidInvoice = {
  ...INVOICES[1],
  name: 'SI-3',
  receivable: 'Retail debtors - RN',
};
const CASH = { mode: 'Cash', account: 'Cash - RN', label: 'Cash', isBank: false };
const RESULT: CollectionResult = {
  payment: 'PAY-1',
  postingDate: '2026-10-14',
  amount: 250,
  invoices: [],
};

function setup(persona: Persona = 'salesperson') {
  TestBed.resetTestingModule();
  const byId = vi.fn().mockResolvedValue(LINA);
  const api = {
    unpaidInvoices: vi.fn().mockResolvedValue(INVOICES),
    confirm: vi.fn(),
    find: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
  };
  const accounts = { list: vi.fn().mockResolvedValue([CASH]) };
  TestBed.configureTestingModule({
    providers: [
      { provide: CollectionApiService, useValue: api },
      { provide: PaymentAccountsService, useValue: accounts },
      {
        provide: CustomerDirectoryService,
        useValue: { search: vi.fn().mockResolvedValue([LINA]), byId },
      },
      { provide: SessionService, useValue: { capabilities: () => capabilitiesFor(persona) } },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }) },
      },
    ],
  });
  return { store: TestBed.inject(CollectionStore), api, accounts, byId };
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
    expect(api.unpaidInvoices).toHaveBeenCalledWith('Lina Haddad', 'Rehan Nursery', 'ILS');
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
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    api.find.mockResolvedValueOnce({ draft: 'PAY-7' });
    expect(await store.checkResult()).toBe('not-found');
    expect(store.draft()).toBe('PAY-7');
    expect(store.state()).toBe('idle');

    store.state.set('unresolved');
    api.find.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    expect(await store.checkResult()).toBe('pending');
    expect(store.state()).toBe('unresolved');

    api.find.mockResolvedValueOnce(RESULT);
    expect(await store.checkResult()).toBe('found');
    expect(store.state()).toBe('confirmed');
  });

  it('only pays invoices on one receivable account together', async () => {
    const { store, api } = setup();
    api.unpaidInvoices.mockResolvedValue([...INVOICES, OTHER_ACCOUNT]);
    await store.selectCustomer(LINA);
    expect([...store.selected()]).toEqual(['SI-1', 'SI-2']);
    expect(api.unpaidInvoices).toHaveBeenCalledWith('Lina Haddad', 'Rehan Nursery', 'ILS');

    store.toggle('SI-3');
    expect([...store.selected()]).toEqual(['SI-3']);
    store.toggle('SI-1');
    expect([...store.selected()]).toEqual(['SI-1']);
  });

  it('reports a failed invoice load instead of "nothing owed", and can retry', async () => {
    const { store, api } = setup();
    api.unpaidInvoices.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    await store.selectCustomer(LINA);
    expect(store.invoicesFailed()).toBe(true);
    expect(store.loadingInvoices()).toBe(false);

    await store.selectCustomer(LINA);
    expect(store.invoicesFailed()).toBe(false);
    expect(store.invoices()).toEqual(INVOICES);
  });

  it('keeps loading for the latest customer when an earlier load finishes last', async () => {
    const { store, api } = setup();
    let finishFirst!: (rows: UnpaidInvoice[]) => void;
    api.unpaidInvoices
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
      .mockReturnValueOnce(new Promise(() => undefined));
    void store.selectCustomer(LINA);
    await Promise.resolve();
    void store.selectCustomer({ ...LINA, id: 'Samir Nasser', name: 'Samir Nasser' });
    await new Promise((resolve) => setTimeout(resolve));
    finishFirst(INVOICES);
    await new Promise((resolve) => setTimeout(resolve));

    expect(store.loadingInvoices()).toBe(true);
    expect(store.invoices()).toEqual([]);
  });

  it('ignores a second confirm while the first is running', async () => {
    const { store, api } = await ready();
    let finish!: (result: CollectionResult) => void;
    api.confirm.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const first = store.confirm();
    const second = store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    finish(RESULT);
    await Promise.all([first, second]);
    expect(api.confirm).toHaveBeenCalledTimes(1);
  });

  it('starts over on a fresh visit after a failure, deleting its draft; editing keeps it', async () => {
    const { store, api } = await ready();
    api.confirm.mockImplementationOnce(async (_r, _d, onInserted: (name: string) => void) => {
      onInserted('PAY-5');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    expect(store.state()).toBe('failed');

    store.resume();
    expect(api.discard).toHaveBeenCalledWith('PAY-5');
    expect(store.customer()).toBeNull();
    expect(store.state()).toBe('idle');
  });

  it('starts a half-done collection over when the task is entered again, but keeps an unresolved one', async () => {
    const { store, api } = await ready();
    store.resume();
    expect(store.customer()).toBeNull();
    expect(store.invoices()).toEqual([]);

    await store.selectCustomer(LINA);
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    const reference = store.reference();
    store.resume();
    expect(store.reference()).toBe(reference);
    expect(store.state()).toBe('unresolved');
  });

  it('keeps a running confirmation when the task is entered again', async () => {
    const { store, api } = await ready();
    let finish!: (result: CollectionResult) => void;
    api.confirm.mockImplementation(
      (_r: unknown, _d: unknown, onInserted: (name: string) => void) => {
        onInserted('PAY-7');
        return new Promise((resolve) => (finish = resolve));
      },
    );
    const running = store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    const reference = store.reference();

    store.resume();
    expect(store.reference()).toBe(reference);
    expect(api.discard).not.toHaveBeenCalled();

    finish(RESULT);
    await running;
    expect(store.state()).toBe('confirmed');
  });

  it('drops the outcome of a confirmation whose collection was replaced', async () => {
    const { store, api } = await ready();
    let finish!: (result: CollectionResult) => void;
    api.confirm.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const running = store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    store.state.set('idle');
    store.start();

    finish(RESULT);
    await running;
    expect(store.result()).toBeNull();
    expect(store.state()).toBe('idle');
  });

  it('keeps a recorded payment when the task is entered again, so its receipt still shows', async () => {
    const { store, api } = await ready();
    api.confirm.mockResolvedValue(RESULT);
    await store.confirm();
    store.resume();
    expect(store.result()).toEqual(RESULT);
    expect(store.state()).toBe('confirmed');
  });

  it('remembers whether the recorded result has been shown, until starting over', async () => {
    const { store, api } = await ready();
    api.confirm.mockResolvedValue(RESULT);
    await store.confirm();
    expect(store.resultShown()).toBe(false);
    store.resultShown.set(true);
    store.start();
    expect(store.resultShown()).toBe(false);
  });

  it('clears an old failure when the customer or invoices change', async () => {
    const { store, api } = await ready();
    api.confirm.mockRejectedValueOnce(new HttpErrorResponse({ status: 417 }));
    await store.confirm();
    expect(store.failure()).toBe('error');
    store.toggle('SI-1');
    expect(store.state()).toBe('idle');
    expect(store.failure()).toBeNull();
  });

  it('deletes the draft a failed confirmation left when starting over', async () => {
    const { store, api } = await ready();
    api.confirm.mockImplementationOnce(async (_r, _d, onInserted: (name: string) => void) => {
      onInserted('PAY-5');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    store.start();
    expect(api.discard).toHaveBeenCalledWith('PAY-5');
    expect(store.draft()).toBeNull();
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

  it("won't look the result up while the confirmation is still running", async () => {
    const { store, api } = await ready();
    api.confirm.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(await store.checkResult()).toBe('pending');
    expect(api.find).not.toHaveBeenCalled();
    expect(store.state()).toBe('confirming');
  });
});

describe('CollectionStore.openPrefill', () => {
  it('opens a fresh collection on the customer, with their unpaid invoices chosen and everything due asked', async () => {
    const { store, api, byId } = setup();
    expect(await store.openPrefill({ customer: 'Lina Haddad' })).toBe('opened');
    expect(byId).toHaveBeenCalledWith('Lina Haddad', { name: 'Rehan Nursery', currency: 'ILS' });
    expect(api.unpaidInvoices).toHaveBeenCalledWith('Lina Haddad', 'Rehan Nursery', 'ILS');
    expect(store.customer()?.id).toBe('Lina Haddad');
    expect([...store.selected()]).toEqual(['SI-1', 'SI-2']);
    expect(store.amountInput()).toBe('250.00');
    expect(store.prefill()).toBe('filled');
    expect(store.reference()).toMatch(/^COLL-/);
    expect(store.draft()).toBeNull();
  });

  it('puts the proposed amount in the field', async () => {
    const { store } = setup();
    await store.openPrefill({ customer: 'Lina Haddad', amount: 120.5 });
    expect(store.amountInput()).toBe('120.50');
    expect(store.amount()).toBe(120.5);
    expect(store.amountValid()).toBe(true);
  });

  it('shows an amount above what is due as it is, so the form can say it is too much', async () => {
    const { store } = setup();
    await store.openPrefill({ customer: 'Lina Haddad', amount: 900 });
    expect(store.amountInput()).toBe('900.00');
    expect(store.amountValid()).toBe(false);
  });

  it('ignores a proposed amount that is not above zero', async () => {
    const { store } = setup();
    await store.openPrefill({ customer: 'Lina Haddad', amount: 0 });
    expect(store.amountInput()).toBe('250.00');
  });

  it('starts over from a collection that was only being filled in', async () => {
    const { store } = await ready();
    store.toggle('SI-1');
    await store.openPrefill({ customer: 'Lina Haddad' });
    expect([...store.selected()]).toEqual(['SI-1', 'SI-2']);
  });

  it('refuses a disabled or missing customer, before touching the task', async () => {
    const { store, byId, api } = await ready();
    byId.mockResolvedValue(null);
    await expect(store.openPrefill({ customer: 'Gone' })).rejects.toBeInstanceOf(
      PrefillUnavailableError,
    );
    expect(store.customer()?.id).toBe('Lina Haddad');
    expect(store.prefill()).toBeNull();
    expect(api.unpaidInvoices).toHaveBeenCalledTimes(1);
  });

  it('refuses a role that may not collect', async () => {
    const { store } = setup('warehouse');
    await expect(store.openPrefill({ customer: 'Lina Haddad' })).rejects.toBeInstanceOf(
      PrefillUnavailableError,
    );
  });

  it('keeps a confirmation that is running or a result not yet seen', async () => {
    const { store, byId } = setup();
    store.state.set('unresolved');
    expect(await store.openPrefill({ customer: 'Lina Haddad' })).toBe('busy');
    expect(byId).not.toHaveBeenCalled();
    store.state.set('confirmed');
    expect(await store.openPrefill({ customer: 'Lina Haddad' })).toBe('busy');
    store.resultShown.set(true);
    expect(await store.openPrefill({ customer: 'Lina Haddad' })).toBe('opened');
  });

  it('keeps a confirmation that starts while the customer loads', async () => {
    const { store, byId } = setup();
    let release: (customer: CustomerOption) => void = () => undefined;
    byId.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const opening = store.openPrefill({ customer: 'Lina Haddad' });
    store.state.set('confirming');
    release(LINA);
    expect(await opening).toBe('busy');
    expect(store.customer()).toBeNull();
  });

  it('leaves a fresh collection with a notice when a proposal could not be opened', async () => {
    const { store } = await ready();
    store.prefillFailed('expired');
    expect(store.customer()).toBeNull();
    expect(store.prefill()).toBe('expired');
    store.state.set('confirming');
    store.prefillFailed('unavailable');
    expect(store.prefill()).toBe('expired');
  });
});
