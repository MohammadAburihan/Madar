import { capabilitiesFor } from '../../../core/auth/capabilities';
import { realTranslator } from '../../../../testing/real-translator';
import { CustomerDetail, SupplierDetail } from '../data-access/contacts.models';
import { contactActions, contactKinds, editableKinds, isWalkIn } from './contacts-access';

const en = realTranslator('en');
const visible = (labels: string[]) => labels.map((l) => l.replace(/[⁨⁩]/g, ''));

const CUSTOMER: CustomerDetail = {
  id: 'Lina Haddad',
  name: 'Lina Haddad',
  phone: null,
  email: null,
  address: [],
  active: true,
  about: null,
  totals: { invoiced: 320, paid: 120, outstanding: 200 },
  latest: null,
  recent: [],
};
const SUPPLIER: SupplierDetail = {
  id: 'Green Clay',
  name: 'Green Clay',
  phone: null,
  email: null,
  address: [],
  active: true,
  about: null,
  outstanding: 170,
  unpaid: { name: 'PINV-0068', total: 270, paid: 100, remaining: 170 },
  openOrder: null,
};

describe('contacts access', () => {
  it('recognises the walk-in by id or by customer name, customers only', () => {
    expect(isWalkIn('customers', 'Walk-in Customer', null)).toBe(true);
    expect(isWalkIn('customers', 'CUST-0007', 'Walk-in Customer')).toBe(true);
    expect(isWalkIn('customers', 'CUST-0008', 'Lina Haddad')).toBe(false);
    expect(isWalkIn('suppliers', 'SUP-0001', 'Walk-in Customer')).toBe(false);
  });

  it('gives each role the lists it works with', () => {
    expect(contactKinds(capabilitiesFor('owner'))).toEqual(['customers', 'suppliers']);
    expect(contactKinds(capabilitiesFor('salesperson'))).toEqual(['customers']);
    expect(contactKinds(capabilitiesFor('warehouse'))).toEqual(['suppliers']);
    expect(contactKinds(capabilitiesFor('projectManager'))).toEqual(['customers']);
  });

  it('offers the tasks the role may start, with the contact chosen', () => {
    const owner = capabilitiesFor('owner');
    const customer = contactActions('customers', CUSTOMER, owner, en);
    expect(visible(customer.map((a) => a.label))).toEqual(['Receive payment', 'Sell to Lina']);
    expect(customer[1]).toMatchObject({
      route: ['/sales/new'],
      query: { customer: 'Lina Haddad' },
    });
    // Nothing owed: no payment to receive.
    const settled = { ...CUSTOMER, totals: { invoiced: 320, paid: 320, outstanding: 0 } };
    expect(contactActions('customers', settled, owner, en).map((a) => a.id)).toEqual(['sell']);

    expect(contactActions('suppliers', SUPPLIER, owner, en)).toEqual([
      {
        id: 'buy',
        label: expect.any(String),
        route: ['/purchases/new'],
        query: { supplier: 'Green Clay' },
      },
      {
        id: 'pay',
        label: 'Pay supplier',
        route: ['/purchases/invoice', 'PINV-0068', 'pay'],
        query: {},
      },
    ]);
    expect(contactActions('suppliers', SUPPLIER, capabilitiesFor('warehouse'), en)).toEqual([]);
  });

  it('lets each role add and edit the contacts ERPNext allows it to', () => {
    expect(editableKinds(capabilitiesFor('owner'), 'add')).toEqual(['customers', 'suppliers']);
    expect(editableKinds(capabilitiesFor('salesperson'), 'add')).toEqual(['customers']);
    // Purchase User can't create suppliers in v16; Purchase Manager can edit them.
    expect(editableKinds(capabilitiesFor('purchasing', ['Purchase User']), 'add')).toEqual([]);
    expect(editableKinds(capabilitiesFor('purchasing', ['Purchase Manager']), 'edit')).toEqual([
      'suppliers',
    ]);
    expect(editableKinds(capabilitiesFor('projectManager', ['Projects User']), 'add')).toEqual([]);
  });
});
