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
});
