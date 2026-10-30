import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import {
  OpeningBalanceApiService,
  OpeningChangedError,
  OpeningRequest,
} from './opening-balance-api.service';

const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };
const TEMPORARY =
  'erpnext.accounts.doctype.opening_invoice_creation_tool.opening_invoice_creation_tool.get_temporary_opening_account';

const request = (overrides: Partial<OpeningRequest> = {}): OpeningRequest => ({
  reference: 'OPN-ABC1234',
  kind: 'customers',
  party: 'Lina Haddad',
  company: 'Rehan Nursery',
  currency: 'ILS',
  amount: 250.5,
  date: '2026-01-03',
  note: '',
  itemName: 'Opening balance',
  account: 'Temporary Opening - RN',
  costCenter: 'Main - RN',
  uom: 'Nos',
  precision: 2,
  ...overrides,
});

const POSTED = {
  name: 'ACC-SINV-0770',
  docstatus: 1,
  is_opening: 'Yes',
  customer: 'Lina Haddad',
  grand_total: 250.5,
  rounded_total: 0,
};

const api = () => TestBed.inject(OpeningBalanceApiService);

interface Setup {
  party?: Record<string, unknown>;
  partyAccount?: string | null;
  accountCurrency?: string;
  temporary?: string | (() => never);
  costCenter?: string | null;
  found?: unknown[];
  docs?: Record<string, unknown>;
  insert?: (body: Record<string, unknown>) => unknown;
  submit?: (body: Record<string, unknown>) => unknown;
  stockUom?: string | null | (() => never);
  currencyPrecision?: string;
  numberFormat?: string;
}

function setup(s: Setup = {}) {
  const fake = fakeErpnext(
    { 'Sales Invoice': () => s.found ?? [], 'Purchase Invoice': () => s.found ?? [] },
    {
      'erpnext.accounts.party.get_party_account': () =>
        s.partyAccount === undefined ? 'Debtors - RN' : s.partyAccount,
      [TEMPORARY]: () =>
        typeof s.temporary === 'function'
          ? s.temporary()
          : (s.temporary ?? 'Temporary Opening - RN'),
      'frappe.client.get_value': (body) =>
        body['doctype'] === 'Company'
          ? { cost_center: s.costCenter === undefined ? 'Main - RN' : s.costCenter }
          : { account_currency: s.accountCurrency ?? 'ILS' },
      'frappe.client.get_single_value': (body) =>
        body['doctype'] === 'System Settings'
          ? body['field'] === 'currency_precision'
            ? (s.currencyPrecision ?? '')
            : (s.numberFormat ?? '#,###.##')
          : typeof s.stockUom === 'function'
            ? s.stockUom()
            : s.stockUom === undefined
              ? 'Unit'
              : s.stockUom,
      'frappe.client.insert': s.insert ?? (() => POSTED),
      'frappe.client.submit': s.submit ?? (() => POSTED),
    },
    {
      'Customer/Lina Haddad': {
        name: 'Lina Haddad',
        customer_name: 'Lina Haddad',
        disabled: 0,
        ...s.party,
      },
      'Supplier/Green Clay': {
        name: 'Green Clay',
        supplier_name: 'Green Clay',
        disabled: 0,
        ...s.party,
      },
      ...s.docs,
    },
  );
  return fake;
}

describe('OpeningBalanceApiService target', () => {
  it('finds the accounts, cost center and unit an opening invoice needs', async () => {
    setup();
    expect(await api().target('customers', 'Lina Haddad', BUSINESS)).toEqual({
      id: 'Lina Haddad',
      name: 'Lina Haddad',
      blocked: null,
      account: 'Temporary Opening - RN',
      costCenter: 'Main - RN',
      uom: 'Unit',
      precision: 2,
    });
  });

  it('reads the money precision from System Settings, else from the number format, else two', async () => {
    setup({ currencyPrecision: '3' });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).precision).toBe(3);
    TestBed.resetTestingModule();
    setup({ currencyPrecision: '0' });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).precision).toBe(0);
    TestBed.resetTestingModule();
    setup({ numberFormat: '#.###' });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).precision).toBe(0);
    TestBed.resetTestingModule();
    setup({ numberFormat: '#.###,###' });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).precision).toBe(3);
    TestBed.resetTestingModule();
    setup({ numberFormat: 'something new' });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).precision).toBe(2);
  });

  it('blocks the walk-in customer, by id or by name', async () => {
    setup({
      party: { name: 'Walk-in Customer', customer_name: 'Walk-in Customer' },
      docs: {
        'Customer/Walk-in Customer': {
          name: 'Walk-in Customer',
          customer_name: 'Walk-in Customer',
          disabled: 0,
        },
      },
    });
    expect((await api().target('customers', 'Walk-in Customer', BUSINESS)).blocked).toBe('walkIn');
    TestBed.resetTestingModule();
    setup({
      docs: {
        'Customer/CUST-7': { name: 'CUST-7', customer_name: 'Walk-in Customer', disabled: 0 },
      },
    });
    expect((await api().target('customers', 'CUST-7', BUSINESS)).blocked).toBe('walkIn');
  });

  it("falls back to ERPNext's default unit when Stock Settings can't be read", async () => {
    setup({
      stockUom: () => {
        throw new HttpErrorResponse({ status: 403 });
      },
    });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).uom).toBe('Nos');
  });

  it('blocks a disabled customer or supplier before anything else is read', async () => {
    const { getCalls, postCalls } = setup({ party: { disabled: 1 } });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).blocked).toBe('disabled');
    expect(getCalls).toEqual([]);
    expect(postCalls).toEqual([]);
  });

  it("blocks a contact billed in another currency, by its own currency or its ledger account's", async () => {
    setup({ party: { default_currency: 'USD' } });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).blocked).toBe('currency');
    TestBed.resetTestingModule();
    setup({ accountCurrency: 'USD' });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).blocked).toBe('currency');
    TestBed.resetTestingModule();
    setup({ party: { default_currency: 'ILS' } });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).blocked).toBeNull();
  });

  it('blocks when the business has no Temporary Opening account, cost center or party account', async () => {
    setup({
      temporary: () => {
        throw new HttpErrorResponse({ status: 417, error: { exc_type: 'ValidationError' } });
      },
    });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).blocked).toBe('setup');
    TestBed.resetTestingModule();
    setup({ costCenter: null });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).blocked).toBe('setup');
    TestBed.resetTestingModule();
    setup({ partyAccount: null });
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).blocked).toBe('setup');
  });

  it('reports a contact that does not exist', async () => {
    setup({
      docs: { 'Customer/Lina Haddad': undefined },
    });
    const erpnext = TestBed.inject(OpeningBalanceApiService) as unknown as {
      erpnext: { doc: () => unknown };
    };
    erpnext.erpnext.doc = () => throwError(() => new HttpErrorResponse({ status: 404 }));
    expect((await api().target('customers', 'Lina Haddad', BUSINESS)).blocked).toBe('missing');
  });
});

describe('OpeningBalanceApiService record', () => {
  it('posts a customer balance the way the Opening Invoice Creation Tool does', async () => {
    const { postCalls } = setup();
    expect(await api().record(request())).toEqual({ name: 'ACC-SINV-0770', total: 250.5 });
    const insert = postCalls.find((c) => c.method === 'frappe.client.insert')!;
    expect(insert.body['doc']).toEqual({
      doctype: 'Sales Invoice',
      company: 'Rehan Nursery',
      customer: 'Lina Haddad',
      is_opening: 'Yes',
      set_posting_time: 1,
      posting_date: '2026-01-03',
      due_date: '2026-01-03',
      update_stock: 0,
      is_pos: 0,
      currency: 'ILS',
      conversion_rate: 1,
      ignore_pricing_rule: 1,
      disable_rounded_total: 1,
      taxes_and_charges: '',
      taxes: [],
      remarks: 'Madar opening balance OPN-ABC1234',
      docstatus: 1,
      items: [
        {
          item_name: 'Opening balance',
          description: 'Opening balance',
          qty: 1,
          uom: 'Nos',
          conversion_factor: 1,
          price_list_rate: 250.5,
          rate: 250.5,
          income_account: 'Temporary Opening - RN',
          cost_center: 'Main - RN',
        },
      ],
    });
  });

  it('posts a supplier balance as a Purchase Invoice against an expense account, with the note first', async () => {
    const { postCalls } = setup({
      insert: () => ({
        ...POSTED,
        name: 'ACC-PINV-0084',
        customer: undefined,
        supplier: 'Green Clay',
      }),
    });
    const result = await api().record(
      request({ kind: 'suppliers', party: 'Green Clay', note: ' Clay from 2025 ' }),
    );
    expect(result.name).toBe('ACC-PINV-0084');
    const doc = postCalls.find((c) => c.method === 'frappe.client.insert')!.body['doc'] as Record<
      string,
      unknown
    >;
    expect(doc['doctype']).toBe('Purchase Invoice');
    expect(doc['supplier']).toBe('Green Clay');
    expect(doc['remarks']).toBe('Clay from 2025\n\nMadar opening balance OPN-ABC1234');
    const row = (doc['items'] as Record<string, unknown>[])[0];
    expect(row['expense_account']).toBe('Temporary Opening - RN');
    expect(row['income_account']).toBeUndefined();
  });

  it('looks the reference up first and uses an invoice that is already posted, never inserting again', async () => {
    const { postCalls, listCalls } = setup({ found: [POSTED] });
    expect(await api().record(request())).toEqual({ name: 'ACC-SINV-0770', total: 250.5 });
    expect(postCalls).toEqual([]);
    expect(listCalls[0].query.filters).toEqual([
      ['remarks', 'like', '%Madar opening balance OPN-ABC1234%'],
      ['docstatus', '<', 2],
    ]);
  });

  it('submits a draft left behind instead of inserting a second invoice', async () => {
    const draft = { ...POSTED, docstatus: 0 };
    const { postCalls } = setup({
      found: [draft],
      docs: { 'Sales Invoice/ACC-SINV-0770': draft },
    });
    expect((await api().record(request())).name).toBe('ACC-SINV-0770');
    expect(postCalls.map((c) => c.method)).toEqual(['frappe.client.submit']);
    expect(postCalls[0].body['doc']).toEqual(draft);
  });

  it('refuses to report a posted invoice whose party or amount no longer matches', async () => {
    setup({ found: [{ ...POSTED, grand_total: 300 }] });
    await expect(api().record(request())).rejects.toBeInstanceOf(OpeningChangedError);
    TestBed.resetTestingModule();
    setup({ found: [{ ...POSTED, customer: 'Someone Else' }] });
    await expect(api().record(request())).rejects.toBeInstanceOf(OpeningChangedError);
  });

  it('compares the rounded total when ERPNext rounded it', async () => {
    setup({ found: [{ ...POSTED, grand_total: 250.4, rounded_total: 250.5 }] });
    expect((await api().record(request())).total).toBe(250.5);
  });

  it('does not read a rounding-only difference as a change, at any money precision', async () => {
    for (const [precision, total, amount] of [
      [0, 251, 251],
      [1, 250.5, 250.5],
      [3, 250.505, 250.505],
    ] as const) {
      TestBed.resetTestingModule();
      setup({ found: [{ ...POSTED, grand_total: total }] });
      expect((await api().record(request({ precision, amount }))).total).toBe(total);
    }
    // ERPNext rounded 250.504 to the cent: still the amount asked for at precision 2.
    TestBed.resetTestingModule();
    setup({ found: [{ ...POSTED, grand_total: 250.5 }] });
    expect((await api().record(request({ amount: 250.504 }))).total).toBe(250.5);
    // A whole unit apart is a change at precision 0.
    TestBed.resetTestingModule();
    setup({ found: [{ ...POSTED, grand_total: 252 }] });
    await expect(api().record(request({ precision: 0, amount: 251 }))).rejects.toBeInstanceOf(
      OpeningChangedError,
    );
  });

  it('turns a dropped connection into UnresolvedError, not into a refusal', async () => {
    setup({ insert: () => throwError(() => new HttpErrorResponse({ status: 0 })) });
    await expect(api().record(request())).rejects.toBeInstanceOf(UnresolvedError);
  });

  it('turns a lost answer into UnresolvedError', async () => {
    setup({ insert: () => throwError(() => new HttpErrorResponse({ status: 504 })) });
    await expect(api().record(request())).rejects.toBeInstanceOf(UnresolvedError);
  });

  it('keeps a definite refusal as it is', async () => {
    setup({
      insert: () =>
        throwError(
          () => new HttpErrorResponse({ status: 417, error: { exc_type: 'ValidationError' } }),
        ),
    });
    await expect(api().record(request())).rejects.not.toBeInstanceOf(UnresolvedError);
  });
});

describe('OpeningBalanceApiService posted', () => {
  it('returns the posted invoice found by reference, or null for none or a draft; it writes nothing', async () => {
    const { postCalls } = setup({ found: [POSTED] });
    expect(await api().posted(request())).toEqual({ name: 'ACC-SINV-0770', total: 250.5 });
    TestBed.resetTestingModule();
    const empty = setup({ found: [] });
    expect(await api().posted(request())).toBeNull();
    TestBed.resetTestingModule();
    const drafts = setup({ found: [{ ...POSTED, docstatus: 0 }] });
    expect(await api().posted(request())).toBeNull();
    expect([postCalls, empty.postCalls, drafts.postCalls]).toEqual([[], [], []]);
  });
});
