import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { DraftsApiService } from './drafts-api.service';
import { DraftsScope } from './drafts.models';

const scope = (overrides: Partial<DraftsScope> = {}): DraftsScope => ({
  company: 'Rehan Nursery',
  userId: 'lina@example.com',
  ownSalesOnly: false,
  sell: true,
  orderPurchases: true,
  paySuppliers: true,
  ...overrides,
});

const INVOICE = {
  name: 'SI-1',
  modified: '2026-10-11 08:50:00',
  customer_name: 'Lina Haddad',
  grand_total: 320,
  currency: 'ILS',
  remarks: 'Madar quick sale SALE-0A1B2C3',
  update_stock: 1,
  is_return: 0,
};

describe('DraftsApiService', () => {
  it('lists every kind of draft, newest first, with units and whether Madar can finish it', async () => {
    fakeErpnext({
      'Sales Invoice': () => [
        INVOICE,
        { ...INVOICE, name: 'SI-2', remarks: 'Desk', modified: '2026-10-09 08:00:00' },
      ],
      'Sales Invoice Item': () => [
        { parent: 'SI-1', qty: 2 },
        { parent: 'SI-1', qty: 1 },
        { parent: 'SI-2', qty: 4 },
      ],
      'Sales Order': () => [
        {
          name: 'SO-1',
          modified: '2026-10-10 08:00:00',
          customer_name: 'Samir',
          grand_total: 110,
          currency: 'ILS',
        },
      ],
      'Sales Order Item': () => [{ parent: 'SO-1', qty: 5 }],
      Quotation: () => [
        {
          name: 'QT-1',
          modified: '2026-10-08 08:00:00',
          customer_name: 'Samir',
          grand_total: 90,
          currency: 'ILS',
          quotation_to: 'Customer',
          utm_content: 'QUO-0A1B2C3',
        },
      ],
      'Quotation Item': () => [{ parent: 'QT-1', qty: 2 }],
      'Purchase Order': () => [
        {
          name: 'PO-1',
          modified: '2026-10-07 08:00:00',
          supplier_name: 'Green Clay',
          grand_total: 450,
          currency: 'ILS',
          order_confirmation_no: 'PUR-0A1B2C3',
        },
      ],
      'Purchase Order Item': () => [{ parent: 'PO-1', qty: 10 }],
      'Payment Entry': () => [
        {
          name: 'PAY-1',
          modified: '2026-10-06 08:00:00',
          party_name: 'Green Clay',
          paid_amount: 100,
          paid_from_account_currency: 'ILS',
          reference_no: 'PAYS-0A1B2C3',
        },
      ],
      'Payment Entry Reference': () => [
        { parent: 'PAY-1', reference_doctype: 'Purchase Invoice', reference_name: 'PINV-1' },
      ],
    });

    const { entries, allForbidden } = await TestBed.inject(DraftsApiService).load(scope());

    expect(allForbidden).toBe(false);
    expect(
      entries.map((e) => [e.kind, e.name, e.party, e.total, e.units, e.continuable, e.invoice]),
    ).toEqual([
      ['sale', 'SI-1', 'Lina Haddad', 320, 3, true, null],
      ['order', 'SO-1', 'Samir', 110, 5, false, null],
      ['sale', 'SI-2', 'Lina Haddad', 320, 4, false, null],
      ['quotation', 'QT-1', 'Samir', 90, 2, true, null],
      ['purchase', 'PO-1', 'Green Clay', 450, 10, true, null],
      ['payment', 'PAY-1', 'Green Clay', 100, null, true, 'PINV-1'],
    ]);
  });

  it("asks ERPNext once per doctype and ownership whether the user's roles may delete", async () => {
    const { getCalls } = fakeErpnext(
      {
        'Sales Invoice': () => [
          { ...INVOICE, owner: 'lina@example.com' },
          { ...INVOICE, name: 'SI-2', owner: 'lina@example.com' },
          { ...INVOICE, name: 'SI-3', owner: 'sami@example.com' },
        ],
        'Sales Invoice Item': () => [],
        'Purchase Order': () => [
          { name: 'PO-1', modified: '2026-10-07 08:00:00', owner: 'sami@example.com' },
        ],
        'Purchase Order Item': () => [],
      },
      {
        'frappe.client.has_permission': (params) => ({
          has_permission: params['doctype'] === 'Purchase Order' || params['docname'] === 'SI-1',
        }),
      },
    );

    const { entries } = await TestBed.inject(DraftsApiService).load(scope({ paySuppliers: false }));

    expect(getCalls.map((c) => [c.method, c.params['doctype'], c.params['perm_type']])).toEqual(
      expect.arrayContaining([
        ['frappe.client.has_permission', 'Sales Invoice', 'delete'],
        ['frappe.client.has_permission', 'Purchase Order', 'delete'],
      ]),
    );
    expect(getCalls).toHaveLength(3);
    expect(entries.map((e) => [e.name, e.deletable]).sort()).toEqual([
      ['PO-1', true],
      ['SI-1', true],
      ['SI-2', true],
      ['SI-3', false],
    ]);
  });

  it('keeps the draft but hides Delete when ERPNext refuses the check', async () => {
    fakeErpnext(
      { 'Sales Invoice': () => [INVOICE], 'Sales Invoice Item': () => [] },
      {
        'frappe.client.has_permission': () =>
          throwError(() => new ErpnextError('forbidden', 'no', 403)),
      },
    );
    const { entries } = await TestBed.inject(DraftsApiService).load(
      scope({ orderPurchases: false, paySuppliers: false }),
    );
    expect(entries.map((e) => [e.name, e.deletable])).toEqual([['SI-1', false]]);
  });

  it('asks for drafts of the business only, and supplier payments only', async () => {
    const { listCalls } = fakeErpnext();
    await TestBed.inject(DraftsApiService).load(scope());
    const filtersOf = (doctype: string) =>
      listCalls.find((c) => c.doctype === doctype)?.query.filters;

    for (const doctype of [
      'Sales Invoice',
      'Sales Order',
      'Quotation',
      'Purchase Order',
      'Payment Entry',
    ]) {
      expect(filtersOf(doctype)).toEqual(
        expect.arrayContaining([
          ['company', '=', 'Rehan Nursery'],
          ['docstatus', '=', 0],
        ]),
      );
    }
    expect(filtersOf('Payment Entry')).toEqual(
      expect.arrayContaining([
        ['payment_type', '=', 'Pay'],
        ['party_type', '=', 'Supplier'],
      ]),
    );
  });

  it('limits sales documents to the own ones for salespeople and store associates, but not purchases', async () => {
    const { listCalls } = fakeErpnext();
    await TestBed.inject(DraftsApiService).load(scope({ ownSalesOnly: true }));
    const owned = (doctype: string) =>
      listCalls
        .find((c) => c.doctype === doctype)
        ?.query.filters?.some(([f, , v]) => f === 'owner' && v === 'lina@example.com');
    expect([owned('Sales Invoice'), owned('Sales Order'), owned('Quotation')]).toEqual([
      true,
      true,
      true,
    ]);
    expect(owned('Purchase Order')).toBeFalsy();
  });

  it('only asks for the doctypes the role may use', async () => {
    const { listCalls } = fakeErpnext();
    await TestBed.inject(DraftsApiService).load(
      scope({ sell: false, orderPurchases: true, paySuppliers: false }),
    );
    expect([...new Set(listCalls.map((c) => c.doctype))]).toEqual(['Purchase Order']);
  });

  it('skips a doctype the role cannot read, and fails on any other error', async () => {
    fakeErpnext({
      'Sales Invoice': () => [INVOICE],
      'Sales Invoice Item': () => [],
      'Sales Order': () => {
        throw new ErpnextError('forbidden', 'no', 403);
      },
    });
    const { entries } = await TestBed.inject(DraftsApiService).load(
      scope({ orderPurchases: false, paySuppliers: false }),
    );
    expect(entries.map((e) => e.name)).toEqual(['SI-1']);
  });

  it('fails on a lost connection rather than showing nothing', async () => {
    fakeErpnext({ 'Sales Invoice': () => throwError(() => new ErpnextError('offline', 'down')) });
    await expect(TestBed.inject(DraftsApiService).load(scope())).rejects.toMatchObject({
      kind: 'offline',
    });
  });

  it('reports every query refused, which is what an expired session looks like', async () => {
    const refused = () => throwError(() => new ErpnextError('forbidden', 'no', 403));
    fakeErpnext({
      'Sales Invoice': refused,
      'Sales Order': refused,
      Quotation: refused,
      'Purchase Order': refused,
      'Payment Entry': refused,
    });
    expect(await TestBed.inject(DraftsApiService).load(scope())).toEqual({
      entries: [],
      allForbidden: true,
    });
  });
});
