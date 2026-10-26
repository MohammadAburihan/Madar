import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../testing/fake-erpnext';
import { CustomerDirectoryService, WALK_IN_CUSTOMER } from './customer-directory.service';

describe('CustomerDirectoryService', () => {
  it('searches customers with their unpaid balance and invoice count', async () => {
    const { listCalls } = fakeErpnext({
      Customer: () => [
        {
          name: 'Lina Haddad',
          customer_name: 'Lina Haddad',
          mobile_no: '059',
          primary_address: 'Ramallah<br>Palestine',
        },
        { name: 'Samir', customer_name: 'Samir', mobile_no: null, primary_address: null },
      ],
      'Sales Invoice': () => [
        { customer: 'Lina Haddad', 'SUM(`outstanding_amount`)': 200, 'COUNT(`name`)': 1 },
      ],
    });
    const directory = TestBed.inject(CustomerDirectoryService);

    expect(await directory.search('lin')).toEqual([
      {
        id: 'Lina Haddad',
        name: 'Lina Haddad',
        phone: '059',
        city: 'Ramallah',
        outstanding: 200,
        unpaidInvoices: 1,
      },
      { id: 'Samir', name: 'Samir', phone: null, city: null, outstanding: 0, unpaidInvoices: 0 },
    ]);
    expect(listCalls[0].query.filters).toContainEqual(['name', '!=', WALK_IN_CUSTOMER]);
    expect(listCalls[0].query.filters).toContainEqual(['customer_name', '!=', WALK_IN_CUSTOMER]);
    expect(listCalls[0].query.orFilters).toContainEqual(['customer_name', 'like', '%lin%']);
    expect(listCalls[1].query.groupBy).toBe('customer');
  });

  it("counts only the business's invoices in its currency", async () => {
    const { listCalls } = fakeErpnext({
      Customer: () => [
        { name: 'Lina', customer_name: 'Lina', mobile_no: null, primary_address: null },
      ],
    });
    await TestBed.inject(CustomerDirectoryService).search('lin', {
      name: 'Rehan Nursery',
      currency: 'ILS',
    });
    expect(listCalls[1].query.filters).toEqual(
      expect.arrayContaining([
        ['company', '=', 'Rehan Nursery'],
        ['currency', '=', 'ILS'],
      ]),
    );
  });

  it('reads enabled customers whose names share letters with the typed one, id and name only, up to the cap', async () => {
    const { listCalls } = fakeErpnext({
      Customer: () => [{ name: 'C-1', customer_name: 'Lina Haddad', disabled: 0 }],
    });
    const found = await TestBed.inject(CustomerDirectoryService).candidates('Leena');
    expect(found).toEqual({ rows: [{ id: 'C-1', name: 'Lina Haddad' }], capped: false });
    const { query, maxRows } = listCalls[0];
    expect(maxRows).toBe(1001);
    expect(query.fields).toEqual(['name', 'customer_name', 'disabled']);
    expect(query.filters).toEqual(
      expect.arrayContaining([
        ['disabled', '=', 0],
        ['name', '!=', WALK_IN_CUSTOMER],
      ]),
    );
    expect(query.orFilters).toEqual(
      expect.arrayContaining([
        ['customer_name', 'like', '%Leena%'],
        ['customer_name', 'like', '%l%n%'],
      ]),
    );
  });

  it('flags a candidate read with more rows than the cap, however old the match is', async () => {
    const many = (count: number) => () =>
      Array.from({ length: count }, (_, i) => ({
        name: `C-${i}`,
        customer_name: `Customer ${i}`,
        disabled: 0,
      }));
    const { listCalls } = fakeErpnext({ Customer: many(1001) });
    const found = await TestBed.inject(CustomerDirectoryService).candidates('Leena');
    expect(found.capped).toBe(true);
    expect(found.rows).toHaveLength(1000);
    expect(listCalls[0].maxRows).toBe(1001);

    TestBed.resetTestingModule();
    fakeErpnext({ Customer: many(1000) });
    const exact = await TestBed.inject(CustomerDirectoryService).candidates('Leena');
    expect(exact.capped).toBe(false);
    expect(exact.rows).toHaveLength(1000);
  });

  it('finds a stored twin with the narrow read, disabled ones marked, and stops there', async () => {
    const { listCalls } = fakeErpnext({
      Customer: () => [{ name: 'C-5', customer_name: 'AlNoor Trading', disabled: 1 }],
    });
    const found = await TestBed.inject(CustomerDirectoryService).spelledLike('Al Noor Trading');
    expect(found).toEqual({
      rows: [{ id: 'C-5', name: 'AlNoor Trading', disabled: true }],
      capped: false,
    });
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0].query.filters).toEqual([]);
    expect(listCalls[0].query.orFilters).toEqual([['customer_name', 'like', '%Al%No%or%Tr%ng%']]);
    expect(listCalls[0].maxRows).toBe(1001);
  });

  it('falls back to the letters-in-order read when the narrow one finds no twin', async () => {
    const { listCalls } = fakeErpnext({
      Customer: (query) =>
        JSON.stringify(query.orFilters).includes('%A%l%N%')
          ? [{ name: 'C-6', customer_name: 'A. L. Noor Trading', disabled: 0 }]
          : [{ name: 'C-7', customer_name: 'Al Nora Tradings', disabled: 0 }],
    });
    const found = await TestBed.inject(CustomerDirectoryService).spelledLike('Al Noor Trading');
    expect(listCalls).toHaveLength(2);
    expect(found.capped).toBe(false);
    expect(found.rows).toEqual([{ id: 'C-6', name: 'A. L. Noor Trading', disabled: false }]);
  });

  it('reports a loose read with more rows than the cap as capped', async () => {
    fakeErpnext({
      Customer: (query) =>
        JSON.stringify(query.orFilters).includes('%A%l%i%')
          ? Array.from({ length: 1001 }, (_, i) => ({
              name: `C-${i}`,
              customer_name: `Alice ${i}`,
              disabled: 0,
            }))
          : [],
    });
    const found = await TestBed.inject(CustomerDirectoryService).spelledLike('Ali');
    expect(found.capped).toBe(true);
    expect(found.rows).toHaveLength(1000);
  });

  it('reads no candidates for a query with nothing to search on', async () => {
    const { listCalls } = fakeErpnext();
    expect(await TestBed.inject(CustomerDirectoryService).candidates(' % ')).toEqual({
      rows: [],
      capped: false,
    });
    expect(listCalls).toEqual([]);
  });

  it('lists recent customers without a search term', async () => {
    const { listCalls } = fakeErpnext();
    const directory = TestBed.inject(CustomerDirectoryService);
    expect(await directory.search('  ')).toEqual([]);
    expect(listCalls[0].query.orFilters).toBeUndefined();
    expect(listCalls).toHaveLength(1);
  });

  it('creates a customer from the quick-entry fields', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.client.insert': (body) => ({
          name: 'Nour',
          customer_name: (body['doc'] as { customer_name: string }).customer_name,
          mobile_no: '059',
        }),
      },
    );
    const directory = TestBed.inject(CustomerDirectoryService);

    const created = await directory.create(
      { name: ' Nour ', phone: '059', email: '', address: 'Jenin' },
      'Palestine',
    );

    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Customer',
      customer_name: 'Nour',
      customer_type: 'Individual',
      mobile_no: '059',
      address_line1: 'Jenin',
      city: 'Jenin',
      country: 'Palestine',
    });
    expect(created).toEqual({
      id: 'Nour',
      name: 'Nour',
      phone: '059',
      city: 'Jenin',
      outstanding: 0,
      unpaidInvoices: 0,
    });
  });

  it('finds one customer by exact id, or none', async () => {
    const { listCalls } = fakeErpnext({
      Customer: () => [
        {
          name: 'Lina Haddad',
          customer_name: 'Lina Haddad',
          mobile_no: '059',
          primary_address: 'Ramallah<br>',
        },
      ],
    });
    expect(await TestBed.inject(CustomerDirectoryService).byId('Lina Haddad')).toMatchObject({
      id: 'Lina Haddad',
      phone: '059',
      city: 'Ramallah',
    });
    expect(listCalls[0].query.filters).toEqual([['name', '=', 'Lina Haddad']]);
  });
});

describe('CustomerDirectoryService.walkIn', () => {
  it('uses the customer whose id is the walk-in name', async () => {
    const { postCalls } = fakeErpnext({
      Customer: (query) =>
        query.filters?.some((f) => f[0] === 'name') ? [{ name: WALK_IN_CUSTOMER }] : [],
    });
    expect(await TestBed.inject(CustomerDirectoryService).walkIn()).toBe(WALK_IN_CUSTOMER);
    expect(postCalls).toEqual([]);
  });

  it('finds it by customer name when a naming series gave it another id', async () => {
    const { postCalls } = fakeErpnext({
      Customer: (query) =>
        query.filters?.some((f) => f[0] === 'customer_name') ? [{ name: 'CUST-0007' }] : [],
    });
    const directory = TestBed.inject(CustomerDirectoryService);
    expect(await directory.walkIn()).toBe('CUST-0007');
    expect(await directory.walkIn()).toBe('CUST-0007');
    expect(postCalls).toEqual([]);
  });

  it('creates it when the site has none', async () => {
    const { postCalls } = fakeErpnext(
      { Customer: () => [] },
      { 'frappe.client.insert': () => ({ name: 'CUST-0001' }) },
    );
    expect(await TestBed.inject(CustomerDirectoryService).walkIn()).toBe('CUST-0001');
    expect(postCalls).toHaveLength(1);
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Customer',
      customer_name: WALK_IN_CUSTOMER,
      customer_type: 'Individual',
    });
  });

  it('creates it once for concurrent callers, and remembers it', async () => {
    const { postCalls, listCalls } = fakeErpnext(
      { Customer: () => [] },
      { 'frappe.client.insert': () => ({ name: 'CUST-0001' }) },
    );
    const directory = TestBed.inject(CustomerDirectoryService);
    const ids = await Promise.all([directory.walkIn(), directory.walkIn(), directory.walkIn()]);
    expect(ids).toEqual(['CUST-0001', 'CUST-0001', 'CUST-0001']);
    await directory.walkIn();
    expect(postCalls).toHaveLength(1);
    expect(listCalls).toHaveLength(2);
  });

  it('looks up by customer name oldest first', async () => {
    const { listCalls } = fakeErpnext({
      Customer: (query) =>
        query.filters?.some((f) => f[0] === 'customer_name') ? [{ name: 'CUST-0007' }] : [],
    });
    await TestBed.inject(CustomerDirectoryService).walkIn();
    expect(listCalls[0].query.orderBy).toBeUndefined();
    expect(listCalls[1].query.orderBy).toBe('creation asc');
  });

  it('returns the walk-in another device created when the insert fails', async () => {
    let lookups = 0;
    fakeErpnext(
      { Customer: () => (++lookups > 2 ? [{ name: 'CUST-0009' }] : []) },
      {
        'frappe.client.insert': () => {
          throw new Error('duplicate');
        },
      },
    );
    expect(await TestBed.inject(CustomerDirectoryService).walkIn()).toBe('CUST-0009');
  });

  it('rejects with the insert error when the insert fails and nothing is found', async () => {
    fakeErpnext(
      { Customer: () => [] },
      {
        'frappe.client.insert': () => {
          throw new Error('duplicate');
        },
      },
    );
    await expect(TestBed.inject(CustomerDirectoryService).walkIn()).rejects.toThrow('duplicate');
  });

  it('looks again after a failed lookup instead of remembering the failure', async () => {
    let fail = true;
    fakeErpnext({
      Customer: () => {
        if (fail) {
          throw new Error('down');
        }
        return [{ name: WALK_IN_CUSTOMER }];
      },
    });
    const directory = TestBed.inject(CustomerDirectoryService);
    await expect(directory.walkIn()).rejects.toThrow('down');
    fail = false;
    expect(await directory.walkIn()).toBe(WALK_IN_CUSTOMER);
  });

  it('finds customers by exact id or name, disabled ones included and marked', async () => {
    const { listCalls } = fakeErpnext({
      Customer: () => [
        {
          name: 'CUST-1',
          customer_name: 'Lina Haddad',
          mobile_no: '059',
          primary_address: 'Ramallah<br>Palestine',
          disabled: 1,
        },
        {
          name: 'CUST-2',
          customer_name: 'Lina Haddad',
          mobile_no: null,
          primary_address: null,
          disabled: 0,
        },
      ],
    });
    expect(await TestBed.inject(CustomerDirectoryService).exact(' Lina Haddad ')).toEqual([
      { id: 'CUST-1', name: 'Lina Haddad', phone: '059', city: 'Ramallah', disabled: true },
      { id: 'CUST-2', name: 'Lina Haddad', phone: null, city: null, disabled: false },
    ]);
    expect(listCalls[0].query.orFilters).toEqual([
      ['name', '=', 'Lina Haddad'],
      ['customer_name', '=', 'Lina Haddad'],
    ]);
    expect(listCalls[0].query.filters).toBeUndefined();
  });
});
