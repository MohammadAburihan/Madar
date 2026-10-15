import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
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
