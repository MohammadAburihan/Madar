import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { ErpnextClient, Filter, ListQuery } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { HomeApiService, HomeScope } from './home-api.service';

type Responder = (query: ListQuery) => unknown[];

function setup(
  responses: Record<string, Responder | 'forbidden'>,
  counts: Record<string, number> = {},
) {
  const calls: { doctype: string; query: ListQuery }[] = [];
  const reply = <T>(doctype: string, value: () => T): Observable<T> =>
    responses[doctype] === 'forbidden'
      ? throwError(() => new ErpnextError('forbidden', 'nope', 403))
      : of(value());
  const client = {
    list: (doctype: string, query: ListQuery) => {
      calls.push({ doctype, query });
      const response = responses[doctype];
      return reply(doctype, () => (typeof response === 'function' ? response(query) : []));
    },
    count: (doctype: string) => reply(doctype, () => counts[doctype] ?? 0),
  };
  TestBed.configureTestingModule({ providers: [{ provide: ErpnextClient, useValue: client }] });
  return { api: TestBed.inject(HomeApiService), calls };
}

const scope = (persona: HomeScope['persona']): HomeScope => ({
  persona,
  company: 'Rehan Nursery',
  companyAbbr: 'RN',
  companyCurrency: 'ILS',
  userId: 'lina@rehan.example',
  today: new Date(2026, 9, 13),
});

const hasFilter = (filters: Filter[] | undefined, field: string, op: string) =>
  !!filters?.some(([f, o]) => f === field && o === op);

const WAREHOUSES = () => [{ name: 'Main warehouse - RN' }, { name: 'Stores - RN' }];

describe('HomeApiService', () => {
  it('counts items below their reorder level within the company warehouses', async () => {
    const { api, calls } = setup({
      Warehouse: WAREHOUSES,
      'Item Reorder': () => [
        { parent: 'PLANTER', warehouse: 'Main warehouse - RN', warehouse_reorder_level: 20 },
        { parent: 'CLAY', warehouse: 'Main warehouse - RN', warehouse_reorder_level: 10 },
        { parent: 'SOIL', warehouse: 'Main warehouse - RN', warehouse_reorder_level: 12 },
        { parent: 'OLIVE', warehouse: 'Main warehouse - RN', warehouse_reorder_level: 5 },
      ],
      Bin: () => [
        { item_code: 'PLANTER', warehouse: 'Main warehouse - RN', actual_qty: 8 },
        { item_code: 'CLAY', warehouse: 'Main warehouse - RN', actual_qty: 3 },
        { item_code: 'OLIVE', warehouse: 'Main warehouse - RN', actual_qty: 30 },
      ],
    });

    const { data } = await api.load(scope('warehouse'));

    expect(data.lowStock).toEqual({ count: 3, warehouse: 'Main warehouse' });
    const warehouseScoped = calls.filter(
      (c) => c.doctype === 'Item Reorder' || c.doctype === 'Bin',
    );
    expect(
      warehouseScoped.every((c) =>
        c.query.filters?.some(
          ([f, o, v]) => f === 'warehouse' && o === 'in' && (v as string[]).includes('Stores - RN'),
        ),
      ),
    ).toBe(true);
    expect(calls.find((c) => c.doctype === 'Warehouse')?.query.filters).toContainEqual([
      'company',
      '=',
      'Rehan Nursery',
    ]);
  });

  it('leaves out data the role cannot read and reports it', async () => {
    const { api } = setup({
      'Sales Invoice': 'forbidden',
      'Sales Order': 'forbidden',
      Quotation: 'forbidden',
    });

    const { data, forbidden } = await api.load(scope('salesperson'));

    expect(forbidden).toBe(true);
    expect(data.todaySales).toBeUndefined();
    expect(data.drafts).toBeUndefined();
    expect(data.invoicesDue).toBeUndefined();
  });

  it('keeps permission errors separate between overlapping loads', async () => {
    let denySales = true;
    const { api } = setup({ Warehouse: WAREHOUSES });
    const client = TestBed.inject(ErpnextClient) as unknown as {
      list: (d: string, q: ListQuery) => Observable<unknown[]>;
    };
    const original = client.list;
    client.list = (doctype, query) =>
      doctype === 'Sales Invoice' && denySales
        ? throwError(() => new ErpnextError('forbidden', 'nope', 403))
        : original(doctype, query);

    const first = api.load(scope('owner'));
    denySales = false;
    const second = api.load(scope('warehouse'));

    expect((await first).forbidden).toBe(true);
    expect((await second).forbidden).toBe(false);
  });

  it('sums sales in company currency and converts foreign receivables', async () => {
    const { api } = setup({
      'Sales Invoice': (q) => {
        const fields = q.fields as unknown[];
        if (
          fields.some(
            (f) =>
              typeof f === 'object' && (f as Record<string, string>)['SUM'] === 'base_grand_total',
          )
        ) {
          return [{ 'SUM(`base_grand_total`)': 2850 }];
        }
        if (hasFilter(q.filters, 'party_account_currency', '=')) {
          return [{ 'SUM(`outstanding_amount`)': 400 }];
        }
        if (hasFilter(q.filters, 'party_account_currency', '!=')) {
          return [{ outstanding_amount: 100, conversion_rate: 3.7 }];
        }
        return [];
      },
      Warehouse: WAREHOUSES,
    });

    const { data } = await api.load(scope('owner'));

    expect(data.todaySales).toBe(2850);
    expect(data.receivables).toBeCloseTo(770);
  });

  it('counts drafts on the server and only fetches the latest of each kind', async () => {
    const { api, calls } = setup(
      {
        'Sales Invoice': (q) =>
          hasFilter(q.filters, 'docstatus', '=') && q.orderBy === 'modified desc'
            ? [
                {
                  name: 'SI-2',
                  customer_name: 'Lina Haddad',
                  modified: '2026-10-13 09:00:00',
                  grand_total: 320,
                  currency: 'ILS',
                },
              ]
            : [],
        'Sales Order': (q) =>
          q.orderBy === 'modified desc'
            ? [
                {
                  name: 'SO-1',
                  customer_name: 'Samir Nasser',
                  modified: '2026-10-12 09:00:00',
                  grand_total: 110,
                  currency: 'USD',
                },
              ]
            : [],
      },
      { 'Sales Invoice': 4, 'Sales Order': 3, Quotation: 0 },
    );

    const { data } = await api.load(scope('salesperson'));

    expect(data.drafts?.count).toBe(7);
    expect(data.drafts?.recent.map((d) => d.name)).toEqual(['SI-2', 'SO-1']);
    const latest = calls.filter((c) => c.query.orderBy === 'modified desc');
    expect(latest.every((c) => c.query.limit === 1)).toBe(true);
    expect(
      latest.every((c) =>
        c.query.filters?.some(([f, , v]) => f === 'owner' && v === 'lina@rehan.example'),
      ),
    ).toBe(true);
    expect(calls.some((c) => c.doctype === 'Bin' || c.doctype === 'Item Reorder')).toBe(false);
  });

  it('keeps the first item of each purchase order for deliveries', async () => {
    const { api } = setup({
      Warehouse: WAREHOUSES,
      'Purchase Order': () => [
        {
          name: 'PO-1',
          supplier_name: 'Green Clay',
          schedule_date: '2026-10-13',
          item_name: 'Planter',
          qty: 10,
        },
        {
          name: 'PO-1',
          supplier_name: 'Green Clay',
          schedule_date: '2026-10-13',
          item_name: 'Soil',
          qty: 4,
        },
      ],
    });

    const { data } = await api.load(scope('owner'));

    expect(data.deliveries).toEqual([
      {
        name: 'PO-1',
        supplier: 'Green Clay',
        scheduleDate: '2026-10-13',
        itemName: 'Planter',
        qty: 10,
      },
    ]);
  });
});
