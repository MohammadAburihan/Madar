import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { DraftUnavailableError } from '../../../core/erpnext/draft';
import { PaymentAccountsService } from '../../../core/money/payment-accounts.service';
import { SupplierInvoice } from './purchase.models';
import { SupplierInvoiceApiService } from './supplier-invoice-api.service';
import { SupplierPaymentApiService } from './supplier-payment-api.service';
import { SupplierPaymentStore } from './supplier-payment.store';

const INVOICE: SupplierInvoice = {
  name: 'PINV-0068',
  billNo: 'GC-8831',
  supplier: 'Green Clay',
  supplierName: 'Green Clay',
  order: 'PO-2048',
  currency: 'ILS',
  total: 270,
  outstanding: 270,
  submitted: true,
  cancelled: false,
  payments: [],
};

const UNPAID = [
  { name: 'PINV-0060', billNo: null, total: 50, outstanding: 50 },
  { name: 'PINV-0068', billNo: 'GC-8831', total: 270, outstanding: 270 },
];

const ACCOUNTS = [
  { mode: 'Bank Draft', account: 'Main bank - RN', label: 'Main bank', isBank: true },
  { mode: 'Cash', account: 'Cash - RN', label: 'Cash', isBank: false },
];

function setup(persona: Persona = 'owner') {
  const api = {
    unpaidInvoices: vi.fn().mockResolvedValue(UNPAID),
    confirm: vi.fn(),
    saveDraft: vi.fn(),
    find: vi.fn(),
    discard: vi.fn().mockResolvedValue(undefined),
    draftPayment: vi.fn(),
  };
  const accounts = { list: vi.fn().mockResolvedValue(ACCOUNTS) };
  TestBed.configureTestingModule({
    providers: [
      { provide: SupplierPaymentApiService, useValue: api },
      { provide: SessionService, useValue: { capabilities: () => capabilitiesFor(persona) } },
      { provide: SupplierInvoiceApiService, useValue: { invoice: () => Promise.resolve(INVOICE) } },
      { provide: PaymentAccountsService, useValue: accounts },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }) },
      },
    ],
  });
  return { store: TestBed.inject(SupplierPaymentStore), api, accounts };
}

async function loaded() {
  const ctx = setup();
  ctx.store.start('PINV-0068');
  await ctx.store.load('all');
  return ctx;
}

describe('SupplierPaymentStore', () => {
  it('opens on the invoice it came from, suggesting what it owes and the first account', async () => {
    const { store, api, accounts } = await loaded();
    expect(api.unpaidInvoices).toHaveBeenCalledWith(
      'Green Clay',
      'Rehan Nursery',
      'ILS',
      'PINV-0068',
    );
    expect(store.openedNotPayable()).toBe(false);
    expect(accounts.list).toHaveBeenCalledWith('Rehan Nursery', 'all');
    expect([store.selected(), store.amountInput(), store.account()]).toEqual([
      'PINV-0068',
      '270.00',
      'Bank Draft',
    ]);
    expect(store.ready()).toBe(true);
  });

  it('never puts another invoice in place of one that cannot be paid here', async () => {
    const { store, api } = setup();
    // The opened invoice is in another currency, so only the supplier's other invoice is payable.
    api.unpaidInvoices.mockResolvedValue([UNPAID[0]]);
    store.start('PINV-0068');
    await store.load('all');
    expect([store.selected(), store.openedNotPayable(), store.ready()]).toEqual([
      null,
      true,
      false,
    ]);
    store.selectInvoice('PINV-0060');
    expect(store.ready()).toBe(true);
  });

  it('suggests what another invoice owes when it is picked', async () => {
    const { store } = await loaded();
    store.selectInvoice('PINV-0060');
    expect(store.amountInput()).toBe('50.00');
  });

  it('accepts only an amount above zero and up to what the invoice owes', async () => {
    const { store } = await loaded();
    for (const bad of ['0', '-5', '270.5', 'x']) {
      store.setAmount(bad);
      expect(store.ready()).toBe(false);
    }
    store.setAmount('100');
    expect(store.ready()).toBe(true);
  });

  it('pays the chosen invoice from the chosen account and remembers the inserted draft', async () => {
    const { store, api } = await loaded();
    store.setAmount('100');
    store.setAccount('Cash');
    api.confirm.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('PAY-0155');
      return 'PAY-0155';
    });
    await store.confirm();
    expect(api.confirm.mock.calls[0][0]).toEqual({
      reference: store.reference(),
      invoice: 'PINV-0068',
      amount: 100,
      account: { mode: 'Cash', account: 'Cash - RN', label: 'Cash' },
    });
    expect([store.draft(), store.state(), store.result()]).toEqual([
      'PAY-0155',
      'confirmed',
      'PAY-0155',
    ]);
  });

  it('ignores a second tap while confirming', async () => {
    const { store, api } = await loaded();
    api.confirm.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await store.confirm();
    expect(api.confirm).toHaveBeenCalledTimes(1);
  });

  it("won't look the result up while the confirmation is still running", async () => {
    const { store, api } = await loaded();
    api.confirm.mockReturnValue(new Promise(() => undefined));
    void store.confirm();
    await new Promise((resolve) => setTimeout(resolve));
    expect(await store.checkResult()).toBe('pending');
    expect(api.find).not.toHaveBeenCalled();
  });

  it('keeps an unresolved payment through a fresh visit, and finds it by reference', async () => {
    const { store, api } = await loaded();
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    store.resume('PINV-0068');
    expect(store.invoice()).not.toBeNull();
    api.find.mockResolvedValue({ payment: 'PAY-0155' });
    expect(await store.checkResult()).toBe('found');
    expect(api.find).toHaveBeenCalledWith(store.reference());
    expect(store.result()).toBe('PAY-0155');
  });

  it('starts a new reference when an earlier payment of another amount was already recorded', async () => {
    const { store, api } = await loaded();
    const first = store.reference();
    store.draft.set('PAY-0155');
    api.confirm.mockRejectedValue(new PostedEarlierError('PAY-0155'));
    await store.confirm();
    expect([store.failure(), store.draft()]).toEqual(['changed', null]);
    expect(store.reference()).not.toBe(first);
  });

  it('deletes a leftover draft when the task starts over, even after an edit cleared the failure', async () => {
    const { store, api } = await loaded();
    api.confirm.mockImplementation(async (_req, _draft, onInserted) => {
      onInserted('PAY-0155');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    store.setAmount('90');
    expect(store.state()).toBe('idle');
    store.start('PINV-0068');
    expect(api.discard).toHaveBeenCalledWith('PAY-0155');
  });

  it('keeps a draft saved on purpose when the task starts over', async () => {
    const { store, api } = await loaded();
    api.saveDraft.mockResolvedValue('PAY-0155');
    expect(await store.saveDraft()).toBe('PAY-0155');
    await store.saveDraft();
    expect(api.saveDraft.mock.calls[1][1]).toBe('PAY-0155');
    store.start('PINV-0068');
    expect(api.discard).not.toHaveBeenCalled();
  });

  it("doesn't attach a draft saved late to the payment started since", async () => {
    const { store, api } = await loaded();
    let finish!: (name: string) => void;
    api.saveDraft.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const saving = store.saveDraft();
    store.start('PINV-0068');
    finish('PAY-0155');
    expect(await saving).toBeNull();
    expect(store.draft()).toBeNull();
  });

  it('ends the save when an earlier payment turns out to be posted', async () => {
    const { store, api } = await loaded();
    api.saveDraft.mockRejectedValue(new PostedEarlierError('PAY-0155'));
    expect(await store.saveDraft()).toBeNull();
    expect([store.savingDraft(), store.failure()]).toEqual([false, 'changed']);
  });

  it('keeps the task usable when a draft save times out, since nothing can have been paid', async () => {
    const { store, api } = await loaded();
    api.saveDraft.mockRejectedValue(new UnresolvedError());
    expect(await store.saveDraft()).toBeNull();
    expect([store.busy(), store.state(), store.failure()]).toEqual([false, 'failed', 'offline']);
    store.setAmount('90');
    expect(store.ready()).toBe(true);
  });

  it('names a permission failure', async () => {
    const { store, api } = await loaded();
    api.confirm.mockRejectedValue(new HttpErrorResponse({ status: 403 }));
    await store.confirm();
    expect([store.state(), store.failure()]).toEqual(['failed', 'permission']);
  });
});

describe('SupplierPaymentStore.openDraft', () => {
  const DRAFT = {
    name: 'PAY-DRAFT',
    reference: 'PAYS-0A1B2C3',
    invoice: 'PINV-0068',
    amount: 100,
    mode: 'Cash',
  };

  it("loads the draft's invoice, amount and account under its own reference and name", async () => {
    const { store, api } = setup();
    api.draftPayment.mockResolvedValue(DRAFT);

    expect(await store.openDraft('PAY-DRAFT')).toBe('opened');

    expect(api.draftPayment).toHaveBeenCalledWith('PAY-DRAFT', { company: 'Rehan Nursery' });
    expect([store.reference(), store.draft(), store.invoiceName(), store.selected()]).toEqual([
      'PAYS-0A1B2C3',
      'PAY-DRAFT',
      'PINV-0068',
      'PINV-0068',
    ]);
    expect([store.amountInput(), store.account(), store.ready()]).toEqual(['100.00', 'Cash', true]);
  });

  it('confirms the opened draft under its reference instead of inserting another payment', async () => {
    const { store, api } = setup();
    api.draftPayment.mockResolvedValue(DRAFT);
    api.confirm.mockResolvedValue('PAY-DRAFT');
    await store.openDraft('PAY-DRAFT');

    await store.confirm();

    expect(api.confirm.mock.calls[0][0]).toMatchObject({
      reference: 'PAYS-0A1B2C3',
      invoice: 'PINV-0068',
      amount: 100,
    });
    expect(api.confirm.mock.calls[0][1]).toBe('PAY-DRAFT');
  });

  it('leaves the account to the user when the drafted one is not offered to them', async () => {
    const { store, api } = setup();
    api.draftPayment.mockResolvedValue({ ...DRAFT, mode: 'Wire Transfer' });
    await store.openDraft('PAY-DRAFT');
    expect([store.account(), store.ready()]).toEqual([null, false]);
  });

  it('is refused while a confirmation is open', async () => {
    const { store, api } = await loaded();
    store.selectInvoice('PINV-0068');
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    expect(await store.openDraft('PAY-DRAFT')).toBe('busy');
    expect(api.draftPayment).not.toHaveBeenCalled();
  });

  it('keeps unsaved edits when the same draft is opened again', async () => {
    const { store, api } = setup();
    api.draftPayment.mockResolvedValue(DRAFT);
    await store.openDraft('PAY-DRAFT');
    store.setAmount('60');
    expect(await store.openDraft('PAY-DRAFT')).toBe('opened');
    expect(api.draftPayment).toHaveBeenCalledTimes(1);
    expect(store.amountInput()).toBe('60');
  });

  it('refuses a role that cannot pay suppliers', async () => {
    const { store, api } = setup('purchasing');
    await expect(store.openDraft('PAY-DRAFT')).rejects.toBeInstanceOf(DraftUnavailableError);
    expect(api.draftPayment).not.toHaveBeenCalled();
  });

  it('keeps the draft it is already holding when that draft is opened on purpose', async () => {
    const { store, api } = await loaded();
    store.selectInvoice('PINV-0068');
    store.setAmount('100');
    api.confirm.mockImplementation(async (_request, _draft, onInserted) => {
      onInserted('PAY-DRAFT');
      throw new HttpErrorResponse({ status: 417 });
    });
    await store.confirm();
    api.draftPayment.mockResolvedValue(DRAFT);

    expect(await store.openDraft('PAY-DRAFT')).toBe('opened');
    store.start('PINV-0068');

    expect(api.discard).not.toHaveBeenCalled();
  });

  it('is refused while the last result is not yet shown', async () => {
    const { store, api } = await loaded();
    store.selectInvoice('PINV-0068');
    store.setAmount('100');
    api.confirm.mockResolvedValue('PAY-1');
    await store.confirm();

    expect(await store.openDraft('PAY-DRAFT')).toBe('busy');

    expect(api.draftPayment).not.toHaveBeenCalled();
  });

  it('does not touch the task when the draft is not available', async () => {
    const { store, api } = await loaded();
    api.draftPayment.mockRejectedValue(new DraftUnavailableError('PAY-X'));
    await expect(store.openDraft('PAY-X')).rejects.toBeInstanceOf(DraftUnavailableError);
    expect(store.selected()).toBe('PINV-0068');
  });
});
