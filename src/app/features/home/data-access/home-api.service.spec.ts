import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
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
    listAll: (doctype: string, query: ListQuery) => firstValueFrom(client.list(doctype, query)),
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

    const { data, allForbidden } = await api.load(scope('salesperson'));

    expect(allForbidden).toBe(true);
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

    expect((await first).allForbidden).toBe(false);
    expect((await first).data.todaySales).toBeUndefined();
    expect((await second).allForbidden).toBe(false);
  });

  it('sums sales in company currency and converts grouped foreign receivables', async () => {
    const { api, calls } = setup({
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
        if (q.groupBy) {
          return [
            { party_account_currency: 'ILS', conversion_rate: 1, 'SUM(`outstanding_amount`)': 400 },
            {
              party_account_currency: 'USD',
              conversion_rate: 3.7,
              'SUM(`outstanding_amount`)': 100,
            },
          ];
        }
        return [];
      },
      Warehouse: WAREHOUSES,
    });

    const { data } = await api.load(scope('owner'));

    expect(data.todaySales).toBe(2850);
    expect(data.receivables).toBeCloseTo(770);
    expect(calls.find((c) => c.query.groupBy)?.query.groupBy).toBe(
      'party_account_currency, conversion_rate',
    );
  });

  it('only lists the salesperson’s own invoices to follow up', async () => {
    const { api, calls } = setup({});

    await api.load(scope('salesperson'));

    const due = calls.find((c) => c.query.orderBy === 'due_date asc');
    expect(due?.query.filters).toContainEqual(['owner', '=', 'lina@rehan.example']);
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

  it('marks the latest drafts Madar can finish, and counts unfinished purchases for roles that buy', async () => {
    const { api } = setup(
      {
        'Sales Invoice': (q) =>
          q.orderBy === 'modified desc'
            ? [
                {
                  name: 'SI-2',
                  customer_name: 'Lina Haddad',
                  modified: '2026-10-13 09:00:00',
                  grand_total: 320,
                  currency: 'ILS',
                  remarks: 'Madar quick sale SALE-0A1B2C3',
                  update_stock: 1,
                  is_return: 0,
                },
              ]
            : [],
        Quotation: (q) =>
          q.orderBy === 'modified desc'
            ? [
                {
                  name: 'QT-1',
                  customer_name: 'Samir Nasser',
                  modified: '2026-10-12 09:00:00',
                  grand_total: 90,
                  currency: 'ILS',
                  quotation_to: 'Lead',
                  utm_content: 'QUO-0A1B2C3',
                },
              ]
            : [],
      },
      { 'Sales Invoice': 1, Quotation: 1, 'Purchase Order': 2, 'Payment Entry': 1 },
    );

    const { data } = await api.load({
      ...scope('owner'),
      buying: { orders: true, payments: true },
    });

    expect(data.drafts?.count).toBe(5);
    expect(data.drafts?.recent.map((d) => [d.name, d.continuable])).toEqual([
      ['SI-2', true],
      ['QT-1', false],
    ]);
  });

  it('counts only the purchase drafts for a purchasing officer, who sells nothing', async () => {
    const { api, calls } = setup({}, { 'Purchase Order': 2, 'Payment Entry': 5 });
    const { data } = await api.load({
      ...scope('purchasing'),
      buying: { orders: true, payments: false },
    });
    expect(data.drafts).toEqual({ count: 2, recent: [] });
    expect(
      calls.some((c) => c.doctype === 'Sales Invoice' && c.query.orderBy === 'modified desc'),
    ).toBe(false);
  });

  it('shows the first line still to arrive and only what has not been received', async () => {
    const { api } = setup({
      Warehouse: WAREHOUSES,
      'Purchase Order': () => [
        {
          name: 'PO-1',
          supplier_name: 'Green Clay',
          schedule_date: '2026-10-13',
          item_name: 'Soil',
          qty: 4,
          received_qty: 4,
        },
        {
          name: 'PO-1',
          supplier_name: 'Green Clay',
          schedule_date: '2026-10-13',
          item_name: 'Planter',
          qty: 10,
          received_qty: 8,
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
        qty: 2,
      },
    ]);
  });

  it('does not report "all forbidden" when some data was readable', async () => {
    const { api } = setup({ 'Sales Invoice': 'forbidden', 'Sales Order': () => [] });

    const { allForbidden } = await api.load(scope('salesperson'));

    expect(allForbidden).toBe(false);
  });

  it('shows what a project still needs and counts stock in the request’s source warehouse', async () => {
    const { api } = setup({
      Warehouse: WAREHOUSES,
      'Material Request': () => [
        {
          name: 'MR-1',
          schedule_date: '2026-10-13',
          material_request_type: 'Material Transfer',
          project: 'P-1',
          item_code: 'PLANTER',
          item_name: 'Planter',
          stock_qty: 100,
          ordered_qty: 80,
          from_warehouse: 'Main warehouse - RN',
          warehouse: 'Stores - RN',
        },
        {
          name: 'MR-2',
          schedule_date: '2026-10-13',
          material_request_type: 'Material Issue',
          project: 'P-1',
          item_code: 'SOIL',
          item_name: 'Soil',
          stock_qty: 5,
          ordered_qty: 0,
          from_warehouse: null,
          warehouse: 'Stores - RN',
        },
        {
          name: 'MR-3',
          schedule_date: '2026-10-13',
          material_request_type: 'Material Transfer',
          project: 'P-1',
          item_code: 'CLAY',
          item_name: 'Clay',
          stock_qty: 4,
          ordered_qty: 4,
          from_warehouse: null,
          warehouse: null,
        },
      ],
      Project: () => [{ name: 'P-1', project_name: 'Garden installation' }],
      Bin: () => [
        { item_code: 'PLANTER', warehouse: 'Main warehouse - RN', actual_qty: 8 },
        { item_code: 'SOIL', warehouse: 'Stores - RN', actual_qty: 2 },
        { item_code: 'SOIL', warehouse: 'Main warehouse - RN', actual_qty: 50 },
      ],
    });

    const { data } = await api.load(scope('warehouse'));

    expect(data.supply?.map((n) => [n.name, n.qty, n.available])).toEqual([
      ['MR-1', 20, 8],
      ['MR-2', 5, 2],
    ]);
  });

  it('leaves disabled items out of the low-stock count', async () => {
    const { api } = setup({
      Warehouse: WAREHOUSES,
      'Item Reorder': () => [
        { parent: 'PLANTER', warehouse: 'Main warehouse - RN', warehouse_reorder_level: 20 },
        { parent: 'OLD-POT', warehouse: 'Main warehouse - RN', warehouse_reorder_level: 20 },
      ],
      Item: (q) =>
        q.filters?.some(([f, , v]) => f === 'disabled' && v === 1) ? [{ name: 'OLD-POT' }] : [],
      Bin: () => [],
    });

    const { data } = await api.load(scope('warehouse'));

    expect(data.lowStock?.count).toBe(1);
  });

  it('batches long warehouse lists so filters stay URL-safe', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ name: `W${i} - RN` }));
    const { api, calls } = setup({
      Warehouse: () => many,
      'Item Reorder': () => [
        { parent: 'PLANTER', warehouse: 'W0 - RN', warehouse_reorder_level: 5 },
      ],
      Bin: () => [],
    });

    await api.load(scope('warehouse'));

    const sizes = calls
      .filter((c) => c.doctype === 'Item Reorder' || c.doctype === 'Bin')
      .map((c) => (c.query.filters?.find(([f]) => f === 'warehouse')?.[2] as string[]).length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(50);
    expect(calls.filter((c) => c.doctype === 'Item Reorder').length).toBe(3);
  });
});
