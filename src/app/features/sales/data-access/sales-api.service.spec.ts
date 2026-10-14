import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ErpnextClient, ListQuery } from '../../../core/erpnext/erpnext-client';
import { CatalogItem, SaleRequest } from './sale.models';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { SalesApiService, WALK_IN_CUSTOMER } from './sales-api.service';

type Lister = (query: ListQuery) => unknown[];
type Poster = (body: Record<string, unknown>) => Observable<unknown> | unknown;

function setup(
  lists: Record<string, Lister> = {},
  posts: Record<string, Poster> = {},
  docs: Record<string, unknown> = {},
) {
  const listCalls: { doctype: string; query: ListQuery }[] = [];
  const postCalls: { method: string; body: Record<string, unknown> }[] = [];
  const client = {
    list: (doctype: string, query: ListQuery) => {
      listCalls.push({ doctype, query });
      return of(lists[doctype]?.(query) ?? []);
    },
    post: (method: string, body: Record<string, unknown>) => {
      postCalls.push({ method, body });
      const result = posts[method]?.(body);
      return result instanceof Observable ? result : of(result);
    },
    doc: (doctype: string, name: string) => of(docs[`${doctype}/${name}`]),
  };
  TestBed.configureTestingModule({ providers: [{ provide: ErpnextClient, useValue: client }] });
  return { api: TestBed.inject(SalesApiService), listCalls, postCalls };
}

const OLIVE: CatalogItem = {
  code: 'OLV-20',
  name: 'Olive tree',
  uom: 'Unit',
  isStock: true,
  price: 85,
  stock: {},
};
const CONSULTATION: CatalogItem = {
  ...OLIVE,
  code: 'SRV-GARDEN',
  name: 'Garden consultation',
  uom: 'Visit',
  isStock: false,
  price: 150,
};

const CASH = { mode: 'Cash', account: 'Cash - RN', label: 'Cash', isBank: false };

const sale = (overrides: Partial<SaleRequest> = {}): SaleRequest => ({
  reference: 'SALE-ABC1234',
  company: 'Rehan Nursery',
  customer: 'Lina Haddad',
  warehouse: 'Main warehouse - RN',
  lines: [
    { item: OLIVE, qty: 2, rate: 85, discount: 10 },
    { item: CONSULTATION, qty: 1, rate: 150, discount: 0 },
  ],
  amountPaid: 0,
  account: null,
  ...overrides,
});

const INVOICE = {
  name: 'SI-1',
  docstatus: 1,
  posting_date: '2026-10-13',
  grand_total: 303,
  outstanding_amount: 303,
};

// What ERPNext holds for sale() once submitted: the same customer, lines and rates.
const POSTED = {
  ...INVOICE,
  customer: 'Lina Haddad',
  set_warehouse: 'Main warehouse - RN',
  items: [
    { item_code: 'OLV-20', qty: 2, rate: 76.5, warehouse: 'Main warehouse - RN' },
    { item_code: 'SRV-GARDEN', qty: 1, rate: 150 },
  ],
};

const paymentPosts = (paid = 100): Record<string, Poster> => ({
  'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry': () => ({
    doctype: 'Payment Entry',
    references: [{ reference_name: 'SI-1', allocated_amount: 303 }],
  }),
  'frappe.client.insert': (body) => body['doc'],
  'frappe.client.submit': (body) => ({
    ...(body['doc'] as object),
    name: 'PAY-1',
    paid_amount: paid,
  }),
});

describe('SalesApiService', () => {
  afterEach(() => vi.useRealTimers());

  it('searches items by code, name or barcode and fills prices and stock', async () => {
    const { api, listCalls, postCalls } = setup(
      {
        Item: () => [
          { name: 'OLV-20', item_name: 'Olive tree', stock_uom: 'Unit', is_stock_item: 1 },
          {
            name: 'SRV-GARDEN',
            item_name: 'Garden consultation',
            stock_uom: 'Visit',
            is_stock_item: 0,
          },
        ],
        'Price List': () => [{ name: 'Retail' }, { name: 'Standard Selling' }],
        Bin: () => [
          { item_code: 'OLV-20', warehouse: 'Main warehouse - RN', actual_qty: 24 },
          { item_code: 'OLV-20', warehouse: 'Garden shop - RN', actual_qty: 6 },
        ],
      },
      {
        'erpnext.stock.get_item_details.apply_price_list': () => ({
          children: [
            { name: 'OLV-20', price_list_rate: 85 },
            { name: 'SRV-GARDEN', price_list_rate: null },
          ],
        }),
      },
    );

    const items = await api.searchItems('oli', 'all', 'Rehan Nursery', [
      'Main warehouse - RN',
      'Garden shop - RN',
    ]);

    expect(items).toEqual([
      {
        code: 'OLV-20',
        name: 'Olive tree',
        uom: 'Unit',
        isStock: true,
        price: 85,
        stock: { 'Main warehouse - RN': 24, 'Garden shop - RN': 6 },
      },
      {
        code: 'SRV-GARDEN',
        name: 'Garden consultation',
        uom: 'Visit',
        isStock: false,
        price: 0,
        stock: {},
      },
    ]);
    const item = listCalls.find((c) => c.doctype === 'Item')!.query;
    expect(item.orFilters).toEqual([
      ['item_code', 'like', '%oli%'],
      ['item_name', 'like', '%oli%'],
      ['Item Barcode', 'barcode', 'like', '%oli%'],
    ]);
    const pricing = postCalls[0].body['ctx'] as {
      price_list: string;
      items: Record<string, unknown>[];
    };
    expect(pricing.price_list).toBe('Standard Selling');
    expect(pricing.items[0]).toMatchObject({
      item_code: 'OLV-20',
      parenttype: 'Sales Invoice',
      uom: 'Unit',
    });
  });

  it('filters the catalog to products or services', async () => {
    const { api, listCalls } = setup();
    await api.searchItems('', 'services', 'Rehan Nursery', []);
    const query = listCalls[0].query;
    expect(query.filters).toContainEqual(['is_stock_item', '=', 0]);
    expect(query.orFilters).toBeUndefined();
  });

  it('searches customers without the walk-in customer and adds their balance', async () => {
    const { api, listCalls } = setup({
      Customer: () => [
        {
          name: 'Lina Haddad',
          customer_name: 'Lina Haddad',
          mobile_no: '059',
          primary_address: 'Ramallah<br>Palestine',
        },
      ],
      'Sales Invoice': () => [
        { customer: 'Lina Haddad', 'SUM(`outstanding_amount`)': 460, 'COUNT(`name`)': 2 },
      ],
    });

    const customers = await api.searchCustomers('lin');

    expect(customers).toEqual([
      {
        id: 'Lina Haddad',
        name: 'Lina Haddad',
        phone: '059',
        city: 'Ramallah',
        outstanding: 460,
        unpaidInvoices: 2,
      },
    ]);
    expect(listCalls[0].query.filters).toContainEqual(['name', '!=', WALK_IN_CUSTOMER]);
  });

  it('confirms a sale as a stock-updating invoice without taxes', async () => {
    const { api, postCalls } = setup(
      {},
      {
        'frappe.client.insert': (body) => ({
          ...(body['doc'] as object),
          name: 'SI-1',
          docstatus: 0,
        }),
        'frappe.client.submit': () => INVOICE,
      },
    );

    const result = await api.confirm(sale(), null);

    const doc = postCalls[0].body['doc'] as Record<string, unknown> & {
      items: Record<string, unknown>[];
    };
    expect(doc).toMatchObject({
      doctype: 'Sales Invoice',
      company: 'Rehan Nursery',
      customer: 'Lina Haddad',
      update_stock: 1,
      set_warehouse: 'Main warehouse - RN',
      ignore_pricing_rule: 1,
      disable_rounded_total: 1,
      remarks: 'Madar quick sale SALE-ABC1234',
      taxes: [],
      taxes_and_charges: '',
    });
    expect(doc['posting_date']).toBeUndefined();
    expect(doc.items[0]).toEqual({
      item_code: 'OLV-20',
      qty: 2,
      uom: 'Unit',
      price_list_rate: 85,
      discount_percentage: 10,
      rate: 76.5,
      warehouse: 'Main warehouse - RN',
    });
    expect(doc.items[1]['warehouse']).toBeUndefined();
    expect(postCalls.map((c) => c.method)).toEqual([
      'frappe.client.insert',
      'frappe.client.submit',
    ]);
    expect(result).toEqual({
      invoice: 'SI-1',
      postingDate: '2026-10-13',
      total: 303,
      paid: 0,
      outstanding: 303,
      payment: null,
      paymentFailed: false,
    });
  });

  it('shows a remembered draft that a slow earlier attempt already confirmed, without resubmitting', async () => {
    const { api, postCalls } = setup(
      { 'Sales Invoice': () => [INVOICE], 'Payment Entry': () => [] },
      {},
      { 'Sales Invoice/SI-1': POSTED },
    );
    const result = await api.confirm(sale(), 'SI-1');
    expect(postCalls).toEqual([]);
    expect(result).toMatchObject({ invoice: 'SI-1', payment: null });
  });

  it("won't report an earlier, different sale as this one's result", async () => {
    const { api } = setup(
      {},
      {},
      {
        'Sales Invoice/SI-1': {
          ...POSTED,
          items: [{ item_code: 'OLV-20', qty: 5, rate: 76.5 }],
        },
      },
    );
    await expect(api.confirm(sale(), 'SI-1')).rejects.toBeInstanceOf(PostedEarlierError);
  });

  it('treats a sale posted from another warehouse as an earlier, different version', async () => {
    const { api } = setup({}, {}, { 'Sales Invoice/SI-1': POSTED });
    await expect(
      api.confirm(sale({ warehouse: 'Garden shop - RN' }), 'SI-1'),
    ).rejects.toBeInstanceOf(PostedEarlierError);
  });

  it('submits an existing draft instead of inserting a new invoice', async () => {
    const { api, postCalls } = setup(
      {},
      { 'frappe.client.submit': () => INVOICE },
      { 'Sales Invoice/SI-1': { name: 'SI-1', docstatus: 0, modified: 'x' } },
    );
    await api.confirm(sale(), 'SI-1');
    expect(postCalls.map((c) => c.method)).toEqual(['frappe.client.submit']);
    expect(postCalls[0].body['doc']).toMatchObject({
      name: 'SI-1',
      modified: 'x',
      update_stock: 1,
    });
  });

  it('hands back the inserted draft when the submit is rejected, so a retry reuses it', async () => {
    const { api } = setup(
      {},
      {
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'SI-5' }),
        'frappe.client.submit': () =>
          throwError(() => new HttpErrorResponse({ status: 417, error: 'Insufficient stock' })),
      },
    );
    const inserted: string[] = [];
    await expect(api.confirm(sale(), null, (name) => inserted.push(name))).rejects.toBeTruthy();
    expect(inserted).toEqual(['SI-5']);
  });

  it('pays at most what the invoice still owes', async () => {
    const { api, postCalls } = setup(
      {},
      {
        ...paymentPosts(85),
        'frappe.client.insert': (body) =>
          (body['doc'] as { doctype: string }).doctype === 'Sales Invoice'
            ? { name: 'SI-1', docstatus: 0 }
            : body['doc'],
        'frappe.client.submit': (body) =>
          (body['doc'] as { doctype?: string }).doctype === 'Payment Entry'
            ? { name: 'PAY-1', paid_amount: 85 }
            : { ...INVOICE, grand_total: 85.4, outstanding_amount: 85 },
      },
    );
    const result = await api.confirm(sale({ amountPaid: 85.4, account: CASH }), null);
    const payment = postCalls.find(
      (c) =>
        c.method === 'frappe.client.insert' &&
        (c.body['doc'] as { doctype: string }).doctype === 'Payment Entry',
    )!.body['doc'] as Record<string, unknown>;
    expect(payment['paid_amount']).toBe(85);
    expect(result.outstanding).toBe(0);
  });

  it('records the payment with the mode, account and Madar reference', async () => {
    const { api, postCalls } = setup(
      {},
      {
        ...paymentPosts(100),
        'frappe.client.insert': (body) =>
          (body['doc'] as { doctype: string }).doctype === 'Sales Invoice'
            ? { ...INVOICE, docstatus: 0 }
            : body['doc'],
        'frappe.client.submit': (body) =>
          (body['doc'] as { doctype?: string }).doctype === 'Payment Entry'
            ? { name: 'PAY-1', paid_amount: 100 }
            : INVOICE,
      },
    );

    const result = await api.confirm(sale({ amountPaid: 100, account: CASH }), null);

    const payment = postCalls.find(
      (c) =>
        c.method === 'frappe.client.insert' &&
        (c.body['doc'] as { doctype: string }).doctype === 'Payment Entry',
    )!.body['doc'] as Record<string, unknown> & { references: Record<string, unknown>[] };
    expect(payment).toMatchObject({
      mode_of_payment: 'Cash',
      paid_to: 'Cash - RN',
      paid_amount: 100,
      received_amount: 100,
      reference_no: 'SALE-ABC1234',
      reference_date: '2026-10-13',
      deductions: [],
    });
    expect(payment.references[0]['allocated_amount']).toBe(100);
    expect(
      postCalls.find((c) => c.method.endsWith('get_payment_entry'))!.body['bank_account'],
    ).toBe('Cash - RN');
    expect(result).toMatchObject({
      paid: 100,
      outstanding: 203,
      payment: 'PAY-1',
      paymentFailed: false,
    });
  });

  it('keeps the confirmed invoice when the payment fails', async () => {
    const { api } = setup(
      {},
      {
        'frappe.client.insert': () => ({ ...INVOICE, docstatus: 0 }),
        'frappe.client.submit': () => INVOICE,
        'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry': () =>
          throwError(() => new HttpErrorResponse({ status: 417 })),
      },
    );
    const result = await api.confirm(sale({ amountPaid: 100, account: CASH }), null);
    expect(result).toMatchObject({ invoice: 'SI-1', paid: 0, paymentFailed: true });
  });

  it('reports a gateway timeout or lost connection as unresolved', async () => {
    for (const status of [504, 0]) {
      TestBed.resetTestingModule();
      const { api } = setup(
        {},
        {
          'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status })),
        },
      );
      await expect(api.confirm(sale(), null)).rejects.toBeInstanceOf(UnresolvedError);
    }
  });

  it('reports a request that never answers as unresolved', async () => {
    vi.useFakeTimers();
    const { api } = setup({}, { 'frappe.client.insert': () => NEVER });
    const confirming = api.confirm(sale(), null);
    const outcome = expect(confirming).rejects.toBeInstanceOf(UnresolvedError);
    await vi.advanceTimersByTimeAsync(30_000);
    await outcome;
  });

  it('passes other errors through', async () => {
    const { api } = setup(
      {},
      {
        'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 417 })),
      },
    );
    await expect(api.confirm(sale(), null)).rejects.not.toBeInstanceOf(UnresolvedError);
  });

  describe('find', () => {
    it('reports a sale that never reached ERPNext', async () => {
      const { api, listCalls } = setup();
      expect(await api.find(sale())).toBe('not-found');
      expect(listCalls[0].query.filters).toContainEqual(['remarks', 'like', '%SALE-ABC1234%']);
    });

    it('prefers a confirmed invoice over a leftover draft', async () => {
      const { api, listCalls } = setup();
      await api.find(sale());
      expect(listCalls[0].query.orderBy).toBe('docstatus desc');
    });

    it("doesn't record a payment when it can't tell whether one exists", async () => {
      const { api, postCalls } = setup(
        {
          'Sales Invoice': () => [INVOICE],
          'Payment Entry': () => {
            throw new HttpErrorResponse({ status: 0 });
          },
        },
        paymentPosts(100),
      );
      await expect(api.find(sale({ amountPaid: 100, account: CASH }))).rejects.toBeTruthy();
      expect(postCalls).toEqual([]);
    });

    it('returns the draft a timed-out confirmation left behind', async () => {
      const { api } = setup({ 'Sales Invoice': () => [{ ...INVOICE, docstatus: 0 }] });
      expect(await api.find(sale())).toEqual({ draft: 'SI-1' });
    });

    it('returns the confirmed sale with its payment', async () => {
      const { api } = setup({
        'Sales Invoice': () => [INVOICE],
        'Payment Entry': () => [{ name: 'PAY-1', paid_amount: 100 }],
      });
      expect(await api.find(sale({ amountPaid: 100, account: CASH }))).toEqual({
        invoice: 'SI-1',
        postingDate: '2026-10-13',
        total: 303,
        paid: 100,
        outstanding: 203,
        payment: 'PAY-1',
        paymentFailed: false,
      });
    });

    it('records the payment if the confirmed sale has none yet', async () => {
      const { api, postCalls } = setup({ 'Sales Invoice': () => [INVOICE] }, paymentPosts(100));
      const result = await api.find(sale({ amountPaid: 100, account: CASH }));
      expect(postCalls[0].method).toBe(
        'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry',
      );
      expect(result).toMatchObject({ payment: 'PAY-1', paid: 100 });
    });
  });
});
