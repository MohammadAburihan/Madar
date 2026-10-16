import { realTranslator } from '../../../../testing/real-translator';
import { CustomerDetail, SupplierDetail } from '../data-access/contacts.models';
import { contactCard, contactLines, contactRow, customerView, supplierView } from './contacts-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const LINA: CustomerDetail = {
  id: 'CUST-0021',
  name: 'Lina Haddad',
  phone: '059-000-0142',
  email: 'lina@example.com',
  address: ['12 Garden Street', 'Ramallah', 'Ramallah'],
  totals: { invoiced: 320, paid: 120, outstanding: 200 },
  latest: {
    name: 'SI-1042',
    date: '2026-10-11',
    status: 'Partly Paid',
    total: 320,
    outstanding: 200,
  },
  recent: [
    { kind: 'payment', name: 'PAY-0154', date: '2026-10-11', amount: 120 },
    { kind: 'invoice', name: 'SI-1042', date: '2026-10-11', amount: 320 },
  ],
};

describe('contacts view', () => {
  it('lists a contact as on the customer list mock, and leaves money out where it is hidden', () => {
    const row = {
      id: 'L',
      name: 'Lina Haddad',
      phone: '059-000-0142',
      city: 'Ramallah',
      outstanding: 200,
    };
    expect(visible(contactCard(row, 'ILS', en))).toEqual({
      id: 'L',
      title: 'Lina Haddad',
      meta: '059-000-0142 · Ramallah',
      balance: 'Outstanding ILS 200.00',
    });
    expect(contactCard({ ...row, outstanding: null }, 'ILS', en).balance).toBeNull();
    expect(contactRow({ ...row, outstanding: null }, 'ILS')).toEqual(['Lina Haddad', 'Ramallah']);
  });

  it('writes the contact block once per line', () => {
    expect(contactLines(LINA)).toBe('059-000-0142\nlina@example.com\n12 Garden Street\nRamallah');
  });

  it('sums the customer up: totals, latest sale and recent activity', () => {
    const view = visible(customerView(LINA, 'ILS', 'en', en));
    expect(view.totals.map((r) => [r.label, r.value])).toEqual([
      ['Invoice total', 'ILS 320.00'],
      ['Amount paid', 'ILS 120.00'],
      ['Outstanding', 'ILS 200.00'],
    ]);
    expect(view.latest).toEqual({
      title: 'Latest sale · SI-1042',
      message: '11 Oct 2026 · Invoice confirmed\nPartially paid',
      summary: 'SI-1042 · ILS 320.00 invoiced · ILS 120.00 paid',
    });
    expect(view.recent[0]).toBe('11 Oct 2026 · PAY-0154 · ILS 120.00');
    expect(visible(customerView(LINA, 'ILS', 'ar', ar)).totals[2].label).toBe('المتبقي');
  });

  it('shows a supplier’s balance and open order, without money for roles that can’t see it', () => {
    const supplier: SupplierDetail = {
      id: 'SUP-0014',
      name: 'Green Clay',
      phone: null,
      email: null,
      address: [],
      outstanding: 170,
      unpaid: { name: 'PINV-0068', total: 270, paid: 100, remaining: 170 },
      openOrder: { name: 'PO-2048', ordered: 10, received: 6, billed: 6 },
    };
    expect(visible(supplierView(supplier, 'ILS', en))).toEqual({
      balance: {
        title: 'Outstanding ILS 170.00',
        message: 'Invoice PINV-0068: ILS 270.00\nPaid ILS 100.00 · Remaining ILS 170.00',
      },
      order: {
        title: 'Open purchase order',
        message: 'PO-2048 · 10 ordered\n6 received · 6 billed · 4 outstanding',
      },
    });
    expect(supplierView({ ...supplier, outstanding: null }, 'ILS', en).balance).toBeNull();
  });
});
