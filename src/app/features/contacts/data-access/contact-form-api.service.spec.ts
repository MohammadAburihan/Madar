import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { ContactFormApiService } from './contact-form-api.service';

const VALUE = {
  name: ' Nour Saleh ',
  phone: '059-1',
  email: 'nour@example.com',
  address: 'Jerusalem',
};
const api = () => TestBed.inject(ContactFormApiService);

describe('ContactFormApiService', () => {
  it('creates a customer with quick-entry contact and address, and its Madar reference', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.insert': () => ({ name: 'Nour Saleh' }) },
    );
    expect(await api().save('customers', VALUE, null, 'CON-1', 'Palestine')).toBe('Nour Saleh');
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Customer',
      customer_name: 'Nour Saleh',
      customer_type: 'Individual',
      mobile_no: '059-1',
      email_id: 'nour@example.com',
      address_line1: 'Jerusalem',
      city: 'Jerusalem',
      country: 'Palestine',
      customer_details: 'Madar contact CON-1',
    });
  });

  it('reports a lost create as unresolved, and finds it by reference', async () => {
    const { listCalls } = fakeErpnext(
      { Supplier: () => [{ name: 'Nour Saleh' }] },
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
    );
    await expect(api().save('suppliers', VALUE, null, 'CON-1', 'Palestine')).rejects.toBeInstanceOf(
      UnresolvedError,
    );
    expect(await api().find('suppliers', 'CON-1')).toBe('Nour Saleh');
    expect(listCalls[0].query.filters).toEqual([['supplier_details', 'like', '%CON-1%']]);
  });

  it('edits the primary contact and address, then saves the party read afresh', async () => {
    let reads = 0;
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.save': (body) => body['doc'] },
      {
        'Customer/Lina Haddad': () =>
          of({
            name: 'Lina Haddad',
            customer_name: 'Lina Haddad',
            customer_primary_contact: 'C-1',
            customer_primary_address: 'A-1',
            modified: `v${++reads}`,
          }),
        'Contact/C-1': {
          name: 'C-1',
          phone_nos: [
            { phone: '059-old', is_primary_mobile_no: 1 },
            { phone: '02-office', is_primary_phone: 1 },
          ],
          email_ids: [{ email_id: 'old@example.com', is_primary: 1 }],
        },
        'Address/A-1': { name: 'A-1', address_line1: 'Ramallah', city: 'Ramallah' },
      },
    );
    await api().save(
      'customers',
      { name: 'Lina Haddad', phone: '059-new', email: '', address: '12 Garden Street' },
      'Lina Haddad',
      'CON-1',
      'Palestine',
    );
    const [contact, address, party] = postCalls.map(
      (c) => c.body['doc'] as Record<string, unknown>,
    );
    expect(contact['phone_nos']).toEqual([
      { phone: '059-new', is_primary_mobile_no: 1 },
      { phone: '02-office', is_primary_phone: 1 },
    ]);
    expect(contact['email_ids']).toEqual([]);
    expect(address).toMatchObject({ address_line1: '12 Garden Street', city: 'Ramallah' });
    // Saving the contact may have touched the customer: the save uses the second read.
    expect(party).toMatchObject({ customer_name: 'Lina Haddad', modified: 'v2' });
  });

  it('gives a party without a contact or address new ones, linked and made primary', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.client.insert': (body) => ({
          name: (body['doc'] as { doctype: string }).doctype === 'Contact' ? 'C-NEW' : 'A-NEW',
        }),
        'frappe.client.save': (body) => body['doc'],
      },
      { 'Supplier/Green Clay': { name: 'Green Clay', supplier_name: 'Green Clay' } },
    );
    await api().save('suppliers', VALUE, 'Green Clay', 'CON-1', 'Palestine');
    expect(postCalls[0].body['doc']).toMatchObject({
      doctype: 'Contact',
      links: [{ link_doctype: 'Supplier', link_name: 'Green Clay' }],
    });
    expect(postCalls[1].body['doc']).toMatchObject({ doctype: 'Address', country: 'Palestine' });
    expect(postCalls[2].body['doc']).toMatchObject({
      supplier_name: 'Nour Saleh',
      supplier_primary_contact: 'C-NEW',
      supplier_primary_address: 'A-NEW',
    });
  });

  it('unlinks a cleared address, and reuses a contact an earlier failed edit linked', async () => {
    const { postCalls } = fakeErpnext(
      { Contact: () => [{ name: 'C-EARLIER' }] },
      { 'frappe.client.save': (body) => body['doc'] },
      {
        'Customer/Lina Haddad': {
          name: 'Lina Haddad',
          customer_name: 'Lina Haddad',
          customer_primary_address: 'A-1',
        },
        'Contact/C-EARLIER': { name: 'C-EARLIER', phone_nos: [], email_ids: [] },
      },
    );
    await api().save(
      'customers',
      { name: 'Lina Haddad', phone: '059-1', email: '', address: '' },
      'Lina Haddad',
      'CON-1',
      'Palestine',
    );
    expect(postCalls.map((c) => c.method)).toEqual(['frappe.client.save', 'frappe.client.save']);
    expect(postCalls[1].body['doc']).toMatchObject({
      customer_primary_contact: 'C-EARLIER',
      customer_primary_address: null,
    });
  });
});
