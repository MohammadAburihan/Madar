import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, finalize, map, of, throwError, timer } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { ProjectsApiService, SiteWarehouseMissingError } from './projects-api.service';

const PROJECT = {
  name: 'PROJ-0001',
  project_name: 'Garden installation',
  project_type: 'External',
  customer: 'CUST-LINA',
  status: 'Open',
  estimated_costing: 5000,
  expected_start_date: '2026-10-11',
  company: 'Rehan Nursery',
};

const api = () => TestBed.inject(ProjectsApiService);

describe('ProjectsApiService', () => {
  it('lists projects as customer or internal, with the customer name', async () => {
    fakeErpnext({
      Project: () => [
        PROJECT,
        {
          ...PROJECT,
          name: 'PROJ-0002',
          project_name: 'Warehouse expansion',
          project_type: 'Internal',
          customer: null,
        },
      ],
      Customer: () => [{ name: 'CUST-LINA', customer_name: 'Lina Haddad' }],
    });
    expect(await api().list('Rehan Nursery')).toEqual([
      {
        name: 'PROJ-0001',
        title: 'Garden installation',
        kind: 'customer',
        customer: 'CUST-LINA',
        customerName: 'Lina Haddad',
        status: 'open',
      },
      {
        name: 'PROJ-0002',
        title: 'Warehouse expansion',
        kind: 'internal',
        customer: null,
        customerName: null,
        status: 'open',
      },
    ]);
  });

  it('searches names and ids, plus the projects of customers whose name matches', async () => {
    const { listCalls } = fakeErpnext({
      Project: () => [PROJECT],
      Customer: (q) =>
        q.orFilters
          ? [{ name: 'CUST-LINA' }]
          : [{ name: 'CUST-LINA', customer_name: 'Lina Haddad' }],
    });
    await api().list('Rehan Nursery', ' أحمد ');
    const customers = listCalls.find((c) => c.doctype === 'Customer')!.query;
    expect(customers.orFilters).toContainEqual(['customer_name', 'like', '%احمد%']);
    expect(customers.orFilters).toContainEqual(['customer_name', 'like', '%أحمد%']);
    const projects = listCalls.filter((c) => c.doctype === 'Project').map((c) => c.query);
    expect(projects.every((q) => JSON.stringify(q.filters).includes('Rehan Nursery'))).toBe(true);
    const byName = projects.find((q) => q.orFilters)!;
    expect(byName.orFilters).toContainEqual(['project_name', 'like', '%احمد%']);
    expect(byName.orFilters).toContainEqual(['name', 'like', '%أحمد%']);
    expect(projects.some((q) => q.filters?.some((f) => f[0] === 'customer'))).toBe(true);
  });

  it('finds every word in any order, across the title and the customer', async () => {
    const lina = { ...PROJECT, modified: '2026-10-01' };
    fakeErpnext({
      Project: (q) => {
        const customerRead = q.filters?.some((f) => f[0] === 'customer');
        const like = (q.orFilters ?? []).map((f) => String(f[2]));
        if (customerRead) {
          return [lina];
        }
        return like.includes('%Garden%') ? [lina] : [];
      },
      Customer: (q) => {
        if (!q.orFilters) {
          return [{ name: 'CUST-LINA', customer_name: 'Lina Haddad' }];
        }
        return q.orFilters.some((f) => f[2] === '%Haddad%' || f[2] === '%Lina%')
          ? [{ name: 'CUST-LINA' }]
          : [];
      },
    });
    expect((await api().list('Rehan Nursery', 'Haddad  Lina')).map((p) => p.name)).toEqual([
      'PROJ-0001',
    ]);
    expect((await api().list('Rehan Nursery', 'Garden Lina')).map((p) => p.name)).toEqual([
      'PROJ-0001',
    ]);
    expect(await api().list('Rehan Nursery', 'Garden Zed')).toEqual([]);
  });

  it('escapes % and _ in the typed text instead of dropping them', async () => {
    const { listCalls } = fakeErpnext({ Project: () => [], Customer: () => [] });
    await api().list('Rehan Nursery', '50%_off');
    const filters = listCalls.flatMap((c) => c.query.orFilters ?? []);
    expect(filters).toContainEqual(['project_name', 'like', '%50\\%\\_off%']);
  });

  it('reads all matching customers, then their projects in batches of 30 merged by name', async () => {
    const customers = Array.from({ length: 65 }, (_, i) => ({ name: `CUST-${i}` }));
    const { listCalls } = fakeErpnext({
      Customer: (q) => (q.orFilters ? customers : []),
      Project: (q) => {
        const group = q.filters?.find((f) => f[0] === 'customer')?.[2] as string[] | undefined;
        return group
          ? [{ ...PROJECT, name: `P-${group[0]}`, customer: group[0], modified: group[0] }]
          : [];
      },
    });
    const { projects, capped } = await api().search('Rehan Nursery', 'Lina');
    const reads = listCalls.filter(
      (c) => c.doctype === 'Project' && c.query.filters?.some((f) => f[0] === 'customer'),
    );
    expect(reads.map((c) => (c.query.filters![1][2] as string[]).length)).toEqual([30, 30, 5]);
    expect(projects.map((p) => p.name).sort()).toEqual(
      ['P-CUST-0', 'P-CUST-30', 'P-CUST-60'].sort(),
    );
    expect(capped).toBe(false);
  });

  it('searches only the first 4 distinct words, one read at a time', async () => {
    let active = 0;
    let overlapped = false;
    const slow = (rows: unknown[]): Observable<unknown[]> =>
      new Observable<unknown[]>((subscriber) => {
        active++;
        overlapped ||= active > 1;
        return timer(1)
          .pipe(
            map(() => rows),
            finalize(() => active--),
          )
          .subscribe(subscriber);
      });
    const { listCalls } = fakeErpnext({
      Customer: (q) => (q.orFilters ? slow([{ name: 'CUST-LINA' }]) : of([])),
      Project: () => slow([]),
    });
    await api().search('Rehan Nursery', 'a b c d e f g a');
    const words = listCalls
      .filter((c) => c.doctype === 'Customer' && c.query.orFilters)
      .map((c) => c.query.orFilters![0][2]);
    expect(words).toEqual(['%a%', '%b%', '%c%', '%d%']);
    expect(overlapped).toBe(false);
  });

  it('flags a customer match cut at the hard cap', async () => {
    const { listCalls } = fakeErpnext({
      Customer: (q) =>
        q.orFilters ? Array.from({ length: 1001 }, (_, i) => ({ name: `C-${i}` })) : [],
    });
    const { capped } = await api().search('Rehan Nursery', 'Lina');
    expect(capped).toBe(true);
    expect(listCalls.find((c) => c.doctype === 'Customer')!.maxRows).toBe(1001);
  });

  it('searches names alone when customers are forbidden, but fails the list on any other error', async () => {
    fakeErpnext({
      Project: () => [PROJECT],
      Customer: (q) =>
        q.orFilters ? throwError(() => new HttpErrorResponse({ status: 403 })) : [],
    });
    expect(await api().list('Rehan Nursery', 'Garden')).toHaveLength(1);
    TestBed.resetTestingModule();
    fakeErpnext({
      Project: () => [PROJECT],
      Customer: (q) =>
        q.orFilters ? throwError(() => new HttpErrorResponse({ status: 500 })) : [],
    });
    await expect(api().list('Rehan Nursery', 'Garden')).rejects.toBeTruthy();
  });

  it('filters nothing for an empty search', async () => {
    const { listCalls } = fakeErpnext({ Project: () => [PROJECT] });
    await api().list('Rehan Nursery', '  ');
    expect(listCalls.find((c) => c.doctype === 'Project')!.query.orFilters).toBeUndefined();
    expect(listCalls.some((c) => c.doctype === 'Customer' && c.query.orFilters)).toBe(false);
  });

  it("reads a project's budget, ledger cost, tasks, requirements, attachments and linked records", async () => {
    const { listCalls } = fakeErpnext(
      {
        Customer: () => [{ name: 'CUST-LINA', customer_name: 'Lina Haddad' }],
        Task: () => [
          {
            subject: 'Install 12 planters',
            exp_end_date: '2026-10-14',
            status: 'Open',
            _assign: '["yara@rehan.example"]',
          },
        ],
        User: () => [{ name: 'yara@rehan.example', full_name: 'Yara' }],
        'Material Request': () => [
          {
            project: 'PROJ-0001',
            item_code: 'POT-30',
            item_name: 'Ceramic planter',
            stock_uom: 'Unit',
            stock_qty: 8,
            qty: 8,
            ordered_qty: 0,
          },
          // A request for 2 boxes of 4 counts in the stock unit; 4 units (in the stock unit) were delivered.
          {
            project: 'PROJ-0001',
            item_code: 'POT-30',
            item_name: 'Ceramic planter',
            stock_uom: 'Unit',
            stock_qty: 8,
            qty: 2,
            ordered_qty: 4,
          },
          // Another project's row on the same request doesn't count.
          {
            project: 'PROJ-0009',
            item_code: 'POT-30',
            item_name: 'Ceramic planter',
            stock_uom: 'Unit',
            stock_qty: 50,
            qty: 50,
            ordered_qty: 0,
          },
        ],
        Bin: () => [
          { item_code: 'POT-30', warehouse: 'Main warehouse - RN', actual_qty: 8 },
          { item_code: 'POT-30', warehouse: 'Project sites - RN', actual_qty: 3 },
        ],
        Warehouse: () => [{ name: 'Main warehouse - RN' }],
        File: () => [
          { file_name: 'Site plan.pdf', file_size: 1800000, creation: '2026-10-10 09:00:00' },
        ],
        'Sales Invoice': () => [
          // A USD invoice: the company-currency totals are the ones shown.
          { name: 'SI-042', base_grand_total: 500, base_rounded_total: 500, status: 'Paid' },
        ],
        // An entry split across two projects: only this project's rows count.
        'Journal Entry Account': () => [
          { parent: 'JV-019', debit: 1000, credit: 0 },
          { parent: 'JV-019', debit: 320, credit: 0 },
        ],
        Account: () => [{ name: 'Travel Expenses - RN' }],
        'GL Entry': () => [{ 'SUM(`debit`)': 1400, 'SUM(`credit`)': 80 }],
      },
      {},
      { 'Project/PROJ-0001': PROJECT },
    );
    const project = await api().project('PROJ-0001');
    expect(project).toMatchObject({
      title: 'Garden installation',
      customerName: 'Lina Haddad',
      budget: 5000,
      actual: 1320,
      plannedDate: '2026-10-11',
      tasks: [
        { subject: 'Install 12 planters', due: '2026-10-14', owners: ['Yara'], status: 'Open' },
      ],
      requirements: [
        { item: 'POT-30', itemName: 'Ceramic planter', uom: 'Unit', required: 12, available: 8 },
      ],
      attachments: [{ name: 'Site plan.pdf', size: 1800000, date: '2026-10-10' }],
    });
    expect(project.linked).toEqual([
      { kind: 'sale', name: 'SI-042', detail: 'Paid', amount: 500 },
      { kind: 'expense', name: 'JV-019', detail: '', amount: 1320 },
    ]);
    expect(listCalls.find((c) => c.doctype === 'GL Entry')!.query.filters).toContainEqual([
      'project',
      '=',
      'PROJ-0001',
    ]);
  });

  it("lists what the project holds at the site, from its share of the site warehouse's ledger", async () => {
    const { listCalls } = fakeErpnext(
      {
        Warehouse: (query) =>
          query.filters?.some((f) => f[0] === 'warehouse_name' && f[1] === '=')
            ? [{ name: 'Project sites - RN' }]
            : [],
        'Stock Ledger Entry': () => [
          { item_code: 'POT-30', 'SUM(`actual_qty`)': 3 },
          { item_code: 'SOIL', 'SUM(`actual_qty`)': 0 },
        ],
        Item: () => [{ name: 'POT-30', item_name: 'Ceramic planter', stock_uom: 'Unit' }],
      },
      {},
      { 'Project/PROJ-0001': PROJECT },
    );
    const project = await api().project('PROJ-0001');
    expect(project.siteItems).toEqual([
      { item: 'POT-30', itemName: 'Ceramic planter', uom: 'Unit', atSite: 3 },
    ]);
    const ledger = listCalls.find((c) => c.doctype === 'Stock Ledger Entry')!.query;
    expect(ledger.filters).toContainEqual(['warehouse', '=', 'Project sites - RN']);
    expect(ledger.filters).toContainEqual(['project', '=', 'PROJ-0001']);
    expect(ledger.groupBy).toBe('item_code');
  });

  it("fails the load when requirements can't be read, rather than show none; a forbidden read shows none", async () => {
    fakeErpnext(
      { 'Material Request': () => throwError(() => new HttpErrorResponse({ status: 500 })) },
      {},
      { 'Project/PROJ-0001': PROJECT },
    );
    await expect(api().project('PROJ-0001')).rejects.toBeTruthy();
    TestBed.resetTestingModule();
    fakeErpnext(
      { 'Material Request': () => throwError(() => new HttpErrorResponse({ status: 403 })) },
      {},
      { 'Project/PROJ-0001': PROJECT },
    );
    expect((await api().project('PROJ-0001')).requirements).toEqual([]);
  });

  describe('sales to a project', () => {
    const SCOPE = { company: 'Rehan Nursery', owner: null };
    const lists = {
      Customer: () => [{ name: 'CUST-LINA', customer_name: 'Lina Haddad', disabled: 0 }],
      'Sales Invoice': (query: { fields: unknown[]; filters?: unknown[] }) =>
        JSON.stringify(query.fields).includes('SUM')
          ? JSON.stringify(query.filters).includes('"!="')
            ? [{ 'SUM(`base_rounded_total`)': 100.5 }]
            : [{ 'SUM(`base_grand_total`)': 179.5 }]
          : [
              {
                name: 'SI-2',
                status: 'Credit Note Issued',
                is_return: 1,
                base_grand_total: -40,
                base_rounded_total: 0,
                creation: '2026-10-20 10:00:00',
              },
              {
                name: 'SI-1',
                status: 'Paid',
                is_return: 0,
                base_grand_total: 320,
                base_rounded_total: 0,
                creation: '2026-10-18 10:00:00',
              },
            ],
      'Sales Order': () => [
        {
          name: 'SO-1',
          status: 'To Deliver and Bill',
          base_grand_total: 500,
          base_rounded_total: 0,
          creation: '2026-10-19 10:00:00',
        },
      ],
    };

    it('lists the submitted invoices and orders newest first with the billed total', async () => {
      const { listCalls } = fakeErpnext(lists, {}, { 'Project/PROJ-0001': PROJECT });
      const project = await api().project('PROJ-0001', SCOPE);
      expect(project.sales).toEqual({
        rows: [
          {
            kind: 'invoice',
            name: 'SI-2',
            status: 'Credit Note Issued',
            isReturn: true,
            amount: -40,
          },
          {
            kind: 'order',
            name: 'SO-1',
            status: 'To Deliver and Bill',
            isReturn: false,
            amount: 500,
          },
          { kind: 'invoice', name: 'SI-1', status: 'Paid', isReturn: false, amount: 320 },
        ],
        billed: 280,
        moreInvoices: 0,
        moreOrders: 0,
      });
      expect(project.customerActive).toBe(true);
      const invoices = listCalls.filter(
        (c) => c.doctype === 'Sales Invoice' && c.query.limit === 20,
      );
      expect(invoices[0].query.filters).toEqual([
        ['project', '=', 'PROJ-0001'],
        ['company', '=', 'Rehan Nursery'],
        ['docstatus', '=', 1],
      ]);
    });

    it('adds the rounded total owed where there is one, the grand total where not', async () => {
      const { listCalls } = fakeErpnext(lists, {}, { 'Project/PROJ-0001': PROJECT });
      expect((await api().project('PROJ-0001', SCOPE)).sales?.billed).toBe(280);
      const sums = listCalls.filter((c) => JSON.stringify(c.query.fields).includes('SUM'));
      expect(sums.map((c) => c.query.fields)).toEqual([
        [{ SUM: 'base_rounded_total' }],
        [{ SUM: 'base_grand_total' }],
      ]);
      expect(sums[0].query.filters).toContainEqual(['base_rounded_total', '!=', 0]);
      expect(sums[1].query.filters).toContainEqual(['base_rounded_total', '=', 0]);
    });

    it('counts the invoices and orders beyond the rows listed', async () => {
      fakeErpnext(
        lists,
        {},
        { 'Project/PROJ-0001': PROJECT },
        { 'Sales Invoice': 27, 'Sales Order': 2 },
      );
      const sales = (await api().project('PROJ-0001', SCOPE)).sales;
      expect(sales?.moreInvoices).toBe(25);
      expect(sales?.moreOrders).toBe(1);
    });

    it('lists only the user’s own sales, with no billed total, for a salesperson', async () => {
      const { listCalls } = fakeErpnext(lists, {}, { 'Project/PROJ-0001': PROJECT });
      const project = await api().project('PROJ-0001', { ...SCOPE, owner: 'lina@example.com' });
      expect(project.sales?.billed).toBeNull();
      for (const call of listCalls.filter(
        (c) => c.doctype.startsWith('Sales') && c.query.limit === 20,
      )) {
        expect(call.query.filters).toContainEqual(['owner', '=', 'lina@example.com']);
      }
    });

    it('reads no sales unless asked, or for a project of another business', async () => {
      fakeErpnext(lists, {}, { 'Project/PROJ-0001': PROJECT });
      expect((await api().project('PROJ-0001')).sales).toBeNull();
      expect(
        (await api().project('PROJ-0001', { company: 'Other Co', owner: null })).sales,
      ).toBeNull();
    });

    it('drops the sales for a role that can’t read invoices but fails on a lost connection', async () => {
      fakeErpnext(
        {
          ...lists,
          'Sales Invoice': () => throwError(() => new HttpErrorResponse({ status: 403 })),
        },
        {},
        { 'Project/PROJ-0001': PROJECT },
      );
      expect((await api().project('PROJ-0001', SCOPE)).sales).toBeNull();
      TestBed.resetTestingModule();
      fakeErpnext(
        { ...lists, 'Sales Invoice': () => throwError(() => new HttpErrorResponse({ status: 0 })) },
        {},
        { 'Project/PROJ-0001': PROJECT },
      );
      await expect(api().project('PROJ-0001', SCOPE)).rejects.toBeTruthy();
    });

    it('reports a disabled customer', async () => {
      fakeErpnext(
        { ...lists, Customer: () => [{ name: 'CUST-LINA', customer_name: 'Lina', disabled: 1 }] },
        {},
        { 'Project/PROJ-0001': PROJECT },
      );
      expect((await api().project('PROJ-0001')).customerActive).toBe(false);
    });
  });

  it('reads the project alone for the edit form, so a stock failure cannot block editing', async () => {
    const { listCalls } = fakeErpnext(
      {
        Customer: () => [{ name: 'CUST-1', customer_name: 'Lina Haddad' }],
        'Material Request': () => throwError(() => new HttpErrorResponse({ status: 500 })),
      },
      {},
      { 'Project/PROJ-0001': PROJECT },
    );
    expect(await api().projectBasics('PROJ-0001')).toMatchObject({
      title: 'Garden installation',
      budget: 5000,
      plannedDate: '2026-10-11',
    });
    expect(listCalls.map((c) => c.doctype)).not.toContain('Material Request');
  });

  it("leaves the cost and tasks out for a role that can't read them", async () => {
    fakeErpnext(
      {
        Account: () => [{ name: 'Travel Expenses - RN' }],
        'GL Entry': () => throwError(() => new HttpErrorResponse({ status: 403 })),
        Task: () => throwError(() => new HttpErrorResponse({ status: 403 })),
      },
      {},
      { 'Project/PROJ-0001': { ...PROJECT, project_type: 'Internal', customer: null } },
    );
    const project = await api().project('PROJ-0001');
    expect([project.actual, project.kind, project.customerName, project.tasks]).toEqual([
      null,
      'internal',
      null,
      null,
    ]);
  });

  it('creates a customer project as External with its customer, and an internal one without', async () => {
    const { postCalls } = fakeErpnext(
      { 'Project Type': () => [{ name: 'Internal' }, { name: 'External' }], Project: () => [] },
      { 'frappe.client.insert': () => ({ name: 'PROJ-0002' }) },
    );
    await api().save(
      'Rehan Nursery',
      {
        title: ' Garden ',
        kind: 'customer',
        customer: 'CUST-LINA',
        budget: 3500,
        plannedDate: '2026-10-20',
      },
      null,
      'PRJ-REF',
    );
    await api().save(
      'Rehan Nursery',
      { title: 'Court', kind: 'internal', customer: 'CUST-LINA', budget: null, plannedDate: null },
      null,
      'PRJ-REF',
    );
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Project',
      company: 'Rehan Nursery',
      status: 'Open',
      notes: 'Madar project PRJ-REF',
      project_name: 'Garden',
      project_type: 'External',
      customer: 'CUST-LINA',
      estimated_costing: 3500,
      expected_start_date: '2026-10-20',
    });
    expect(postCalls[1].body['doc']).toMatchObject({
      project_type: 'Internal',
      customer: null,
      estimated_costing: 0,
    });
  });

  it('leaves the type out where the site named its project types in another language', async () => {
    const { postCalls } = fakeErpnext(
      { 'Project Type': () => [{ name: 'داخلي' }, { name: 'خارجي' }] },
      { 'frappe.client.insert': () => ({ name: 'PROJ-0002' }) },
    );
    await api().save(
      'Rehan Nursery',
      { title: 'Court', kind: 'internal', customer: null, budget: null, plannedDate: null },
      null,
      'PRJ-REF',
    );
    expect(postCalls[0].body['doc']).not.toHaveProperty('project_type');
  });

  it('saves changes over an existing project', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.save': (body) => body['doc'] },
      { 'Project/PROJ-0001': { ...PROJECT, modified: 'm1' } },
    );
    await api().save(
      'Rehan Nursery',
      { title: 'Garden', kind: 'customer', customer: 'CUST-LINA', budget: 6000, plannedDate: null },
      'PROJ-0001',
      'PRJ-REF',
    );
    expect(postCalls[0].body['doc']).toMatchObject({
      name: 'PROJ-0001',
      modified: 'm1',
      estimated_costing: 6000,
    });
  });

  it('finds the project sites warehouse, or creates it under the warehouse root', async () => {
    let sites: unknown[] = [];
    const { postCalls } = fakeErpnext(
      {
        Warehouse: (query) =>
          query.filters?.some((f) => f[0] === 'warehouse_name')
            ? sites
            : [{ name: 'All Warehouses - RN' }],
      },
      { 'frappe.client.insert': () => ({ name: 'Project sites - RN' }) },
    );
    expect(await api().siteWarehouse('Rehan Nursery')).toBe('Project sites - RN');
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Warehouse',
      warehouse_name: 'Project sites',
      company: 'Rehan Nursery',
      parent_warehouse: 'All Warehouses - RN',
    });
    sites = [{ name: 'Project sites - RN' }];
    expect(await api().siteWarehouse('Rehan Nursery')).toBe('Project sites - RN');
    expect(postCalls).toHaveLength(1);
  });

  it('adds a requirement as a submitted transfer request to the project sites, with the reference', async () => {
    const { postCalls } = fakeErpnext(
      { Warehouse: () => [{ name: 'Project sites - RN' }] },
      {
        'frappe.client.insert': () => ({ name: 'MAT-MR-0001', docstatus: 0 }),
        'frappe.client.submit': () => ({ name: 'MAT-MR-0001' }),
      },
      { 'Material Request/MAT-MR-0001': { name: 'MAT-MR-0001', docstatus: 0 } },
    );
    const inserted: string[] = [];
    const name = await api().addRequirement(
      'Rehan Nursery',
      { reference: 'REQ-1', project: 'PROJ-0001', item: 'POT-30', uom: 'Unit', qty: 12 },
      '2026-10-16',
      null,
      (n) => inserted.push(n),
    );
    expect([name, inserted]).toEqual(['MAT-MR-0001', ['MAT-MR-0001']]);
    expect(postCalls[0].body['doc']).toMatchObject({
      material_request_type: 'Material Transfer',
      set_warehouse: 'Project sites - RN',
      title: 'Madar requirement REQ-1',
      items: [
        {
          item_code: 'POT-30',
          qty: 12,
          uom: 'Unit',
          warehouse: 'Project sites - RN',
          project: 'PROJ-0001',
        },
      ],
    });
  });

  it('submits a remembered requirement draft instead of adding another, and reports a submitted one', async () => {
    const request = {
      reference: 'REQ-1',
      project: 'PROJ-0001',
      item: 'POT-30',
      uom: 'Unit',
      qty: 12,
    };
    const items = [{ item_code: 'POT-30', qty: 12, uom: 'Unit', project: 'PROJ-0001' }];
    let draft = { name: 'MAT-MR-0001', docstatus: 0, items };
    const { postCalls } = fakeErpnext(
      { Warehouse: () => [{ name: 'Project sites - RN' }] },
      { 'frappe.client.submit': () => ({ name: 'MAT-MR-0001' }) },
      { 'Material Request/MAT-MR-0001': () => of(draft) },
    );
    expect(await api().addRequirement('Rehan Nursery', request, '2026-10-16', 'MAT-MR-0001')).toBe(
      'MAT-MR-0001',
    );
    expect(postCalls.map((c) => c.method)).toEqual(['frappe.client.submit']);
    draft = { name: 'MAT-MR-0001', docstatus: 1, items };
    expect(await api().addRequirement('Rehan Nursery', request, '2026-10-16', 'MAT-MR-0001')).toBe(
      'MAT-MR-0001',
    );
    expect(postCalls).toHaveLength(1);
  });

  it('turns a timeout into an unresolved result and finds the requirement by reference', async () => {
    let rows: unknown[] = [];
    const { listCalls } = fakeErpnext(
      { Warehouse: () => [{ name: 'Project sites - RN' }], 'Material Request': () => rows },
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
    );
    await expect(
      api().addRequirement(
        'Rehan Nursery',
        { reference: 'REQ-1', project: 'PROJ-0001', item: 'POT-30', uom: 'Unit', qty: 12 },
        '2026-10-16',
        null,
      ),
    ).rejects.toBeInstanceOf(UnresolvedError);
    expect(await api().findRequirement('REQ-1')).toBe('not-found');
    rows = [{ name: 'MAT-MR-0001', docstatus: 1 }];
    expect(await api().findRequirement('REQ-1')).toEqual({ requirement: 'MAT-MR-0001' });
    expect(listCalls.find((c) => c.doctype === 'Material Request')!.query.filters).toContainEqual([
      'title',
      '=',
      'Madar requirement REQ-1',
    ]);
  });

  it("reports a missing site warehouse a role can't create, distinctly", async () => {
    fakeErpnext(
      {
        Warehouse: (query) =>
          query.filters?.some((f) => f[0] === 'warehouse_name') ? [] : [{ name: 'All' }],
      },
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 403 })) },
    );
    await expect(api().siteWarehouse('Rehan Nursery')).rejects.toBeInstanceOf(
      SiteWarehouseMissingError,
    );
  });

  it('reads a project with no type as internal unless it has a customer', async () => {
    fakeErpnext({
      Project: () => [
        { ...PROJECT, name: 'P-1', project_type: null, customer: null },
        { ...PROJECT, name: 'P-2', project_type: null },
      ],
    });
    expect((await api().list('Rehan Nursery')).map((p) => p.kind)).toEqual([
      'internal',
      'customer',
    ]);
  });

  it('shows dated tasks before undated ones', async () => {
    fakeErpnext(
      {
        Task: () => [
          ...Array.from({ length: 5 }, (_, i) => ({
            subject: `Undated ${i}`,
            exp_end_date: null,
            status: 'Open',
            _assign: null,
          })),
          { subject: 'Due soon', exp_end_date: '2026-10-14', status: 'Open', _assign: null },
        ],
        Account: () => [],
      },
      {},
      { 'Project/PROJ-0001': PROJECT },
    );
    expect((await api().project('PROJ-0001')).tasks![0].subject).toBe('Due soon');
  });

  it('replaces a remembered draft whose item or quantity changed, instead of submitting it stale', async () => {
    const { postCalls } = fakeErpnext(
      { Warehouse: () => [{ name: 'Project sites - RN' }] },
      {
        'frappe.client.delete': () => ({}),
        'frappe.client.insert': () => ({ name: 'MAT-MR-0002', docstatus: 0 }),
        'frappe.client.submit': () => ({ name: 'MAT-MR-0002' }),
      },
      {
        'Material Request/MAT-MR-0001': {
          name: 'MAT-MR-0001',
          docstatus: 0,
          items: [{ item_code: 'POT-30', qty: 10, uom: 'Unit', project: 'PROJ-0001' }],
        },
        'Material Request/MAT-MR-0002': { name: 'MAT-MR-0002', docstatus: 0 },
      },
    );
    const request = {
      reference: 'REQ-1',
      project: 'PROJ-0001',
      item: 'POT-30',
      uom: 'Unit',
      qty: 4,
    };
    expect(await api().addRequirement('Rehan Nursery', request, '2026-10-16', 'MAT-MR-0001')).toBe(
      'MAT-MR-0002',
    );
    expect(postCalls.map((c) => c.method)).toEqual([
      'frappe.client.delete',
      'frappe.client.insert',
      'frappe.client.submit',
    ]);
  });

  it("won't report an earlier, different requirement as this one's result", async () => {
    fakeErpnext(
      { Warehouse: () => [{ name: 'Project sites - RN' }] },
      {},
      {
        'Material Request/MAT-MR-0001': {
          name: 'MAT-MR-0001',
          docstatus: 1,
          items: [{ item_code: 'POT-30', qty: 10, uom: 'Unit', project: 'PROJ-0001' }],
        },
      },
    );
    const request = {
      reference: 'REQ-1',
      project: 'PROJ-0001',
      item: 'POT-30',
      uom: 'Unit',
      qty: 4,
    };
    await expect(
      api().addRequirement('Rehan Nursery', request, '2026-10-16', 'MAT-MR-0001'),
    ).rejects.toBeInstanceOf(PostedEarlierError);
  });

  it('finds a project a lost save already created, and saves the latest details over it', async () => {
    const { postCalls, listCalls } = fakeErpnext(
      {
        'Project Type': () => [],
        Project: () => [{ name: 'PROJ-0002' }],
      },
      { 'frappe.client.save': (body) => body['doc'] },
      { 'Project/PROJ-0002': { ...PROJECT, name: 'PROJ-0002', project_name: 'Old title' } },
    );
    expect(
      await api().save(
        'Rehan Nursery',
        { title: 'Court', kind: 'internal', customer: null, budget: null, plannedDate: null },
        null,
        'PRJ-REF',
      ),
    ).toBe('PROJ-0002');
    expect(postCalls.map((c) => c.method)).toEqual(['frappe.client.save']);
    expect(postCalls[0].body['doc']).toMatchObject({ name: 'PROJ-0002', project_name: 'Court' });
    expect(listCalls.find((c) => c.doctype === 'Project')!.query.filters).toEqual([
      ['notes', 'like', '%PRJ-REF%'],
    ]);
  });

  it('leaves fully delivered requirements off the overview', async () => {
    fakeErpnext(
      {
        'Material Request': () => [
          {
            project: 'PROJ-0001',
            item_code: 'POT-30',
            item_name: 'Ceramic planter',
            stock_uom: 'Unit',
            stock_qty: 12,
            qty: 12,
            ordered_qty: 12,
          },
        ],
        Account: () => [],
      },
      {},
      { 'Project/PROJ-0001': PROJECT },
    );
    expect((await api().project('PROJ-0001')).requirements).toEqual([]);
  });

  it('treats a draft ERPNext rounded to 3 decimals as the same requirement', async () => {
    const { postCalls } = fakeErpnext(
      { Warehouse: () => [{ name: 'Project sites - RN' }] },
      { 'frappe.client.submit': () => ({ name: 'MAT-MR-0001' }) },
      {
        'Material Request/MAT-MR-0001': {
          name: 'MAT-MR-0001',
          docstatus: 0,
          items: [{ item_code: 'SOIL', qty: 2.556, uom: 'Kg', project: 'PROJ-0001' }],
        },
      },
    );
    const request = {
      reference: 'REQ-1',
      project: 'PROJ-0001',
      item: 'SOIL',
      uom: 'Kg',
      qty: 2.5555,
    };
    await api().addRequirement('Rehan Nursery', request, '2026-10-16', 'MAT-MR-0001');
    expect(postCalls.map((c) => c.method)).toEqual(['frappe.client.submit']);
  });
});
