import { realTranslator } from '../../../../testing/real-translator';
import { CustomerDetail, SupplierDetail } from '../data-access/contacts.models';
import {
  contactCard,
  contactLines,
  contactRow,
  customerView,
  historyCard,
  supplierView,
  activationDialog,
} from './contacts-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const LINA: CustomerDetail = {
  id: 'CUST-0021',
  name: 'Lina Haddad',
  phone: '059-000-0142',
  email: 'lina@example.com',
  address: ['12 Garden Street', 'Ramallah', 'Ramallah'],
  active: true,
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
      active: true,
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

  it('words the history as on the history mock', () => {
    const base = {
      date: '2026-10-11',
      outstanding: 0,
      credited: 0,
      status: '',
      place: null,
      invoices: [],
      qty: 0,
    };
    expect(
      visible(
        historyCard(
          {
            ...base,
            kind: 'invoice',
            name: 'SI-1042',
            amount: 320,
            outstanding: 200,
            status: 'Partly Paid',
          },
          'customers',
          'ILS',
          en,
        ),
      ),
    ).toEqual({
      title: 'SI-1042 · ILS 320.00',
      message: 'Invoice confirmed · Partially paid\nPaid 120.00 · Due 200.00',
    });
    expect(
      visible(
        historyCard(
          {
            ...base,
            kind: 'payment',
            name: 'PAY-0154',
            amount: 120,
            place: 'Main cash',
            invoices: ['SI-1042'],
          },
          'customers',
          'ILS',
          en,
        ),
      ),
    ).toEqual({
      title: 'PAY-0154 · ILS 120.00',
      message: 'Customer payment · Main cash\nAllocated to SI-1042',
    });
    expect(
      visible(
        historyCard(
          {
            ...base,
            kind: 'delivery',
            name: 'DLV-0081',
            amount: null,
            place: 'Main warehouse',
            qty: 2,
          },
          'customers',
          'ILS',
          ar,
        ),
      ),
    ).toEqual({ title: 'DLV-0081 · وحدتان', message: 'تم تسليم البضائع · Main warehouse' });
    expect(
      visible(
        historyCard(
          { ...base, kind: 'delivery', name: 'PR-1', amount: null, qty: 1, place: 'Main' },
          'suppliers',
          'ILS',
          en,
        ).message,
      ),
    ).toBe('Goods received · Main');
    expect(
      historyCard(
        { ...base, kind: 'delivery', name: 'DN-2', amount: null, qty: 1 },
        'customers',
        'ILS',
        en,
      ).message,
    ).toBe('Goods delivered');
    expect(
      visible(
        historyCard(
          { ...base, kind: 'invoice', name: 'SI-9', amount: 45, status: 'Credit Note Issued' },
          'customers',
          'ILS',
          en,
        ).message,
      ),
    ).toBe('Invoice confirmed · Credit note issued\nPaid 45.00 · Due 0.00');
    // A credit note took 30 off: only the rest was paid.
    expect(
      visible(
        historyCard(
          {
            ...base,
            kind: 'invoice',
            name: 'SI-8',
            amount: 100,
            outstanding: 0,
            credited: 30,
            status: 'Paid',
          },
          'customers',
          'ILS',
          en,
        ).message,
      ),
    ).toBe('Invoice confirmed · Paid\nPaid 70.00 · Due 0.00');
  });

  it('asks before deactivating, naming what is still owed either way', () => {
    expect(visible(activationDialog('customers', LINA, 'ILS', en))).toEqual({
      title: 'Deactivate Lina Haddad?',
      message:
        "They leave the contact lists and can't be sold to until you reactivate them. Their history stays. While inactive, ERPNext records no sales, orders or payments for them, not even what they owe. They still owe ILS 200.00.",
      actions: [
        { id: 'confirm', label: 'Deactivate', primary: true },
        { id: 'stay', label: 'Keep active' },
      ],
    });
    const settled = { ...LINA, totals: { invoiced: 320, paid: 320, outstanding: 0 } };
    expect(visible(activationDialog('customers', settled, 'ILS', en)).message).not.toContain(
      'still owe',
    );
    // A salesperson sees their own sales only: told the balance may be bigger.
    expect(visible(activationDialog('customers', settled, 'ILS', en, false)).message).toContain(
      'You may not see all of what they owe',
    );
    expect(
      visible(
        activationDialog(
          'suppliers',
          {
            id: 'S',
            name: 'S',
            phone: null,
            email: null,
            address: [],
            active: true,
            outstanding: 1e-9,
            unpaid: null,
            openOrder: null,
          },
          'ILS',
          en,
        ),
      ).message,
    ).not.toContain('still owe');
    const supplier = {
      id: 'Green Clay',
      name: 'Green Clay',
      phone: null,
      email: null,
      address: [],
      active: true,
      outstanding: 170,
      unpaid: null,
      openOrder: null,
    };
    expect(visible(activationDialog('suppliers', supplier, 'ILS', ar)).message).toContain(
      'ما زلت مديناً له بـ ILS 170.00.',
    );
    expect(
      visible(activationDialog('customers', { ...LINA, active: false }, 'ILS', en)),
    ).toMatchObject({
      title: 'Reactivate Lina Haddad?',
      actions: [
        { id: 'confirm', label: 'Reactivate', primary: true },
        { id: 'stay', label: 'Keep inactive' },
      ],
    });
  });
});
