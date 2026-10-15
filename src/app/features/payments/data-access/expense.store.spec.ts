import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { BusinessService } from '../../../core/business/business.service';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { PaymentAccountsService } from '../../../core/money/payment-accounts.service';
import { ProjectDirectoryService } from '../../../core/projects/project-directory.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { ExpenseApiService } from './expense-api.service';
import { ExpenseStore } from './expense.store';

const ACCOUNTS = [
  { mode: 'Cash', account: 'Cash - RN', label: 'Main cash', isBank: false, currency: 'ILS' },
  { mode: 'Bank Draft', account: 'Bank - RN', label: 'Main bank', isBank: true },
  { mode: 'Wire', account: 'USD Bank - RN', label: 'USD bank', isBank: true, currency: 'USD' },
];

function setup(
  projects: () => Promise<unknown> = () => Promise.resolve([{ id: 'PROJ-0001', name: 'Garden' }]),
  accounts: unknown[] = ACCOUNTS,
) {
  const api = {
    categories: vi
      .fn()
      .mockResolvedValue([{ account: 'Travel Expenses - RN', name: 'Travel Expenses' }]),
    record: vi.fn(),
    find: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
    attachReceipt: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ExpenseApiService, useValue: api },
      { provide: PaymentAccountsService, useValue: { list: () => Promise.resolve(accounts) } },
      { provide: ProjectDirectoryService, useValue: { open: projects } },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }) },
      },
      {
        provide: SiteClockService,
        useValue: { ensure: () => Promise.resolve(), now: () => new Date(2026, 9, 11, 9, 41) },
      },
    ],
  });
  return { store: TestBed.inject(ExpenseStore), api };
}

async function filled() {
  const ctx = setup();
  ctx.store.start();
  await ctx.store.load('all');
  ctx.store.setCategory('Travel Expenses - RN');
  ctx.store.setAmount('36.50');
  return ctx;
}

const receipt = () => new File(['x'], 'receipt.jpg', { type: 'image/jpeg' });

describe('ExpenseStore', () => {
  it("suggests the site's today and the first account, and needs a category and an amount", async () => {
    const { store } = setup();
    store.start();
    await store.load('all');
    expect([store.date(), store.account(), store.ready()]).toEqual(['2026-10-11', 'Cash', false]);
    store.setCategory('Travel Expenses - RN');
    store.setAmount('0');
    expect(store.ready()).toBe(false);
    store.setAmount('36.50');
    expect(store.ready()).toBe(true);
  });

  it('offers only accounts in the company currency, which needs no exchange rate', async () => {
    const { store } = setup();
    store.start();
    await store.load('all');
    expect(store.accounts().map((a) => a.mode)).toEqual(['Cash', 'Bank Draft']);
  });

  it('suggests the first company-currency account, not a foreign one listed first', async () => {
    const { store } = setup(undefined, [ACCOUNTS[2], ACCOUNTS[1]]);
    store.start();
    await store.load('all');
    expect(store.account()).toBe('Bank Draft');
  });

  it("records without a project when the role can't read projects", async () => {
    const { store } = setup(() => Promise.reject(new HttpErrorResponse({ status: 403 })));
    store.start();
    await store.load('all');
    expect([store.loaded(), store.projects()]).toEqual([true, []]);
  });

  it('records the category, amount, date, account and project, and remembers the draft', async () => {
    const { store, api } = await filled();
    store.setAccount('Bank Draft');
    store.setProject('PROJ-0001');
    api.record.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('ACC-JV-0091');
      return 'ACC-JV-0091';
    });
    await store.confirm();
    expect(api.record.mock.calls[0][0]).toEqual({
      reference: store.reference(),
      company: 'Rehan Nursery',
      category: 'Travel Expenses - RN',
      amount: 36.5,
      date: '2026-10-11',
      account: { mode: 'Bank Draft', account: 'Bank - RN', label: 'Main bank', isBank: true },
      project: 'PROJ-0001',
    });
    expect([store.draft(), store.state(), store.result()]).toEqual([
      'ACC-JV-0091',
      'confirmed',
      'ACC-JV-0091',
    ]);
  });

  it('ignores a second tap while confirming', async () => {
    const { store, api } = await filled();
    api.record.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(api.record).toHaveBeenCalledTimes(1);
  });

  it('attaches the receipt after recording, and keeps the expense recorded if that fails', async () => {
    const { store, api } = await filled();
    store.setReceipt(receipt());
    api.record.mockResolvedValue('ACC-JV-0091');
    api.attachReceipt.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    await store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect([store.state(), store.receiptState()]).toEqual(['confirmed', 'failed']);
    await store.attachReceipt();
    expect(store.receiptState()).toBe('attached');
    expect(api.attachReceipt).toHaveBeenLastCalledWith('ACC-JV-0091', expect.any(File));
  });

  it("attaches a new expense's receipt even after an earlier one's was attached", async () => {
    const { store, api } = await filled();
    store.setReceipt(receipt());
    api.record.mockResolvedValueOnce('ACC-JV-0091').mockResolvedValueOnce('ACC-JV-0092');
    await store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(store.receiptState()).toBe('attached');
    store.state.set('idle');
    await store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(api.attachReceipt).toHaveBeenLastCalledWith('ACC-JV-0092', expect.any(File));
    expect(store.receiptState()).toBe('attached');
  });

  it("won't look the result up while the confirmation is still running", async () => {
    const { store, api } = await filled();
    api.record.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(await store.checkResult()).toBe('pending');
    expect(api.find).not.toHaveBeenCalled();
  });

  it('keeps an unresolved expense through a fresh visit, and finds it by reference', async () => {
    const { store, api } = await filled();
    api.record.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    store.resume();
    expect(store.chosenCategory()).not.toBeNull();
    api.find.mockResolvedValue({ expense: 'ACC-JV-0091' });
    expect(await store.checkResult()).toBe('found');
    expect(api.find).toHaveBeenCalledWith(store.reference());
  });

  it('starts a new reference when an earlier, different expense was already recorded', async () => {
    const { store, api } = await filled();
    const first = store.reference();
    store.draft.set('ACC-JV-0091');
    api.record.mockRejectedValue(new PostedEarlierError('ACC-JV-0091'));
    await store.confirm();
    expect([store.failure(), store.draft()]).toEqual(['changed', null]);
    expect(store.reference()).not.toBe(first);
  });

  it('deletes a leftover draft when the task starts over, even after an edit cleared the failure', async () => {
    const { store, api } = await filled();
    api.record.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('ACC-JV-0091');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    store.setAmount('40');
    expect(store.state()).toBe('idle');
    store.start();
    expect(api.discard).toHaveBeenCalledWith('ACC-JV-0091');
  });

  it('names a permission failure', async () => {
    const { store, api } = await filled();
    api.record.mockRejectedValue(new HttpErrorResponse({ status: 403 }));
    await store.confirm();
    expect([store.state(), store.failure()]).toEqual(['failed', 'permission']);
  });
});
