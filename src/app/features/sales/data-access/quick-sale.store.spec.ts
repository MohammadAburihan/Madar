import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { QuickSaleStore } from './quick-sale.store';
import { CatalogItem, SaleResult } from './sale.models';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { SalesApiService, WALK_IN_CUSTOMER } from './sales-api.service';

const OLIVE: CatalogItem = {
  code: 'OLV-20',
  name: 'Olive tree',
  uom: 'Unit',
  isStock: true,
  price: 85,
  stock: { 'Main - RN': 24 },
};
const CONSULTATION: CatalogItem = {
  code: 'SRV-GARDEN',
  name: 'Garden consultation',
  uom: 'Visit',
  isStock: false,
  price: 150,
  stock: {},
};
const CASH = { mode: 'Cash', account: 'Cash - RN', label: 'Cash', isBank: false };
const RESULT: SaleResult = {
  invoice: 'SI-1',
  postingDate: '2026-10-13',
  total: 320,
  paid: 320,
  outstanding: 0,
  payment: 'PAY-1',
  paymentFailed: false,
};

function setup() {
  const api = {
    warehouses: vi.fn().mockResolvedValue([{ id: 'Main - RN', name: 'Main warehouse' }]),
    paymentAccounts: vi.fn().mockResolvedValue([CASH]),
    confirm: vi.fn(),
    find: vi.fn(),
    saveDraft: vi.fn().mockResolvedValue('SI-9'),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SalesApiService, useValue: api },
      { provide: SessionService, useValue: { capabilities: () => capabilitiesFor('salesperson') } },
      {
        provide: BusinessService,
        useValue: {
          ensure: () => Promise.resolve({ name: 'Rehan Nursery', country: 'Palestine' }),
        },
      },
    ],
  });
  const store = TestBed.inject(QuickSaleStore);
  return { store, api };
}

function withBasket(store: QuickSaleStore) {
  store.selectCustomer({
    id: 'Lina Haddad',
    name: 'Lina Haddad',
    phone: null,
    city: null,
    outstanding: 0,
    unpaidInvoices: 0,
  });
  store.setWarehouse('Main - RN');
  store.add(OLIVE);
  store.add(OLIVE);
  store.add(CONSULTATION);
}

describe('QuickSaleStore', () => {
  it('adds items, merges repeats, and removes a line at quantity 0', () => {
    const { store } = setup();
    withBasket(store);
    expect(store.lines().map((l) => [l.item.code, l.qty, l.rate])).toEqual([
      ['OLV-20', 2, 85],
      ['SRV-GARDEN', 1, 150],
    ]);
    expect(store.units()).toBe(3);
    expect(store.total()).toBe(320);

    store.setQty(0, 0);
    expect(store.lines().map((l) => l.item.code)).toEqual(['SRV-GARDEN']);
  });

  it('applies line discounts to the total', () => {
    const { store } = setup();
    withBasket(store);
    store.updateLine(0, { discount: 10 });
    expect(store.total()).toBe(303);
  });

  it('works out the amount paid and outstanding for each payment status', () => {
    const { store } = setup();
    withBasket(store);

    expect(store.amountPaid()).toBe(320);
    expect(store.outstanding()).toBe(0);

    store.paymentStatus.set('partial');
    store.amountInput.set('120');
    expect(store.amountPaid()).toBe(120);
    expect(store.outstanding()).toBe(200);
    expect(store.amountValid()).toBe(true);

    store.paymentStatus.set('unpaid');
    expect(store.amountPaid()).toBe(0);
    expect(store.outstanding()).toBe(320);
  });

  it('accepts partial amounts only between zero and the total', () => {
    const { store } = setup();
    withBasket(store);
    store.paymentStatus.set('partial');
    for (const value of ['0', '320', '400', 'abc']) {
      store.amountInput.set(value);
      expect(store.amountValid()).toBe(false);
    }
    store.amountInput.set('1,00');
    expect(store.amountValid()).toBe(true);
  });

  it('counts stock in the chosen warehouse and treats services as unlimited', () => {
    const { store } = setup();
    expect(store.available(OLIVE)).toBe(0);
    store.setWarehouse('Main - RN');
    expect(store.available(OLIVE)).toBe(24);
    expect(store.available(OLIVE, 'Garden - RN')).toBe(0);
    expect(store.available(CONSULTATION)).toBe(Infinity);
  });

  it('loads warehouses and the accounts the role may use', async () => {
    const { store, api } = setup();
    await store.loadOptions();
    expect(api.paymentAccounts).toHaveBeenCalledWith('Rehan Nursery', ['Cash', 'Credit Card']);
    expect(store.warehouses()).toEqual([{ id: 'Main - RN', name: 'Main warehouse' }]);
    expect(store.account()).toEqual(CASH);
  });

  it('confirms the sale and keeps the confirmed lines for the receipt', async () => {
    const { store, api } = setup();
    await store.loadOptions();
    withBasket(store);
    api.confirm.mockResolvedValue(RESULT);

    await store.confirm();

    const [request, draft] = api.confirm.mock.calls[0];
    expect(request).toMatchObject({
      reference: store.reference(),
      company: 'Rehan Nursery',
      customer: 'Lina Haddad',
      warehouse: 'Main - RN',
      amountPaid: 320,
      account: CASH,
    });
    expect(draft).toBeNull();
    expect(store.state()).toBe('confirmed');
    expect(store.result()).toEqual(RESULT);
    expect(store.confirmedLines()).toHaveLength(2);
    expect(store.dirty()).toBe(false);
  });

  it('sells to the walk-in customer and sends no account when unpaid', async () => {
    const { store, api } = setup();
    await store.loadOptions();
    withBasket(store);
    store.useWalkIn();
    store.paymentStatus.set('unpaid');
    api.confirm.mockResolvedValue(RESULT);

    await store.confirm();

    expect(api.confirm.mock.calls[0][0]).toMatchObject({
      customer: WALK_IN_CUSTOMER,
      amountPaid: 0,
      account: null,
    });
  });

  it('marks a timed-out confirmation unresolved', async () => {
    const { store, api } = setup();
    withBasket(store);
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    expect(store.state()).toBe('unresolved');
    expect(store.failure()).toBeNull();
  });

  it('keeps the draft a rejected confirmation inserted, so retrying submits it', async () => {
    const { store, api } = setup();
    withBasket(store);
    api.confirm.mockImplementationOnce(
      async (_sale, _draft, onInserted: (name: string) => void) => {
        onInserted('SI-5');
        throw new HttpErrorResponse({ status: 417, error: { message: 'Insufficient stock' } });
      },
    );
    await store.confirm();
    expect(store.draft()).toBe('SI-5');
    api.confirm.mockResolvedValue(RESULT);
    await store.confirm();
    expect(api.confirm.mock.calls[1][1]).toBe('SI-5');
  });

  it("doesn't prompt to save or discard once a confirmation is unresolved", async () => {
    const { store, api } = setup();
    withBasket(store);
    expect(store.dirty()).toBe(true);
    api.confirm.mockRejectedValue(new UnresolvedError());
    await store.confirm();
    expect(store.dirty()).toBe(false);
  });

  it('reads amounts typed with Arabic digits', () => {
    const { store } = setup();
    withBasket(store);
    store.paymentStatus.set('partial');
    store.amountInput.set('٥٠٫٥');
    expect(store.amountPaid()).toBe(50.5);
    expect(store.amountValid()).toBe(true);
  });

  it('classifies failures', async () => {
    const { store, api } = setup();
    withBasket(store);
    const cases: [unknown, string][] = [
      [new HttpErrorResponse({ status: 403 }), 'permission'],
      [
        new HttpErrorResponse({ status: 417, error: { message: 'Insufficient stock for OLV-20' } }),
        'stock',
      ],
      [new HttpErrorResponse({ status: 500 }), 'error'],
    ];
    for (const [error, failure] of cases) {
      api.confirm.mockRejectedValueOnce(error);
      await store.confirm();
      expect(store.state()).toBe('failed');
      expect(store.failure()).toBe(failure);
    }
  });

  it('adopts the draft a timed-out confirmation left, so confirming again submits it', async () => {
    const { store, api } = setup();
    withBasket(store);
    api.find.mockResolvedValue({ draft: 'SI-7' });

    expect(await store.checkResult()).toBe('not-found');
    expect(store.draft()).toBe('SI-7');
    expect(store.state()).toBe('idle');

    api.confirm.mockResolvedValue(RESULT);
    await store.confirm();
    expect(api.confirm.mock.calls[0][1]).toBe('SI-7');
  });

  it('opens the result when the check finds the sale, and stays unresolved when it fails', async () => {
    const { store, api } = setup();
    withBasket(store);
    api.find.mockResolvedValueOnce('not-found');
    expect(await store.checkResult()).toBe('not-found');
    expect(store.draft()).toBeNull();

    api.find.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    expect(await store.checkResult()).toBe('pending');
    expect(store.state()).toBe('unresolved');

    api.find.mockResolvedValueOnce(RESULT);
    expect(await store.checkResult()).toBe('found');
    expect(store.state()).toBe('confirmed');
  });

  it('saves a draft and reuses it on the next save', async () => {
    const { store, api } = setup();
    withBasket(store);
    await store.saveDraft();
    await store.saveDraft();
    expect(api.saveDraft.mock.calls.map((c) => c[1])).toEqual([null, 'SI-9']);
  });

  it('starts a fresh sale with a new reference', async () => {
    const { store, api } = setup();
    withBasket(store);
    api.confirm.mockResolvedValue(RESULT);
    await store.confirm();
    const reference = store.reference();

    store.start();

    expect(store.reference()).not.toBe(reference);
    expect(store.reference()).toMatch(/^SALE-[0-9A-Z]{7}$/);
    expect(store.lines()).toEqual([]);
    expect(store.hasCustomer()).toBe(false);
    expect(store.warehouse()).toBeNull();
    expect(store.paymentStatus()).toBe('paid');
    expect(store.draft()).toBeNull();
    expect(store.state()).toBe('idle');
    expect(store.result()).toBeNull();
  });
});
