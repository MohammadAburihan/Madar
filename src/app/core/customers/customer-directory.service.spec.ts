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
});
