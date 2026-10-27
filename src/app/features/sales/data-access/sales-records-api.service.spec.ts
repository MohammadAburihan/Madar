import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { SalesRecordsApiService } from './sales-records-api.service';

const api = () => TestBed.inject(SalesRecordsApiService);

describe('SalesRecordsApiService', () => {
  it("lists the company's invoices newest first, in company currency, searchable by number or customer", async () => {
    const { listCalls } = fakeErpnext({
      'Sales Invoice': () => [
        {
          name: 'SI-1042',
          customer_name: 'Lina Haddad',
          docstatus: 1,
          status: 'Partly Paid',
          is_return: 0,
          update_stock: 1,
          base_grand_total: 320,
          base_rounded_total: 320,
          outstanding_amount: 50,
          conversion_rate: 4,
          party_account_currency: 'USD',
          posting_date: '2026-10-11',
        },
      ],
    });
    expect(
      await api().invoices(
        {
          company: 'Rehan Nursery',
          currency: 'ILS',
          term: 'lina',
          owner: null,
        },
        0,
        50,
      ),
    ).toMatchObject({
      more: false,
      items: [
        {
          name: 'SI-1042',
          customer: 'Lina Haddad',
          docstatus: 1,
          status: 'Partly Paid',
          isReturn: false,
          delivered: true,
          total: 320,
          outstanding: 200,
          date: '2026-10-11',
        },
      ],
    });
    const query = listCalls[0].query;
    expect(query.limit).toBe(51);
    expect(query.limitStart).toBe(0);
    expect(query.orderBy).toBe('posting_date desc, creation desc, name desc');
    expect(query.filters).toEqual([
      ['company', '=', 'Rehan Nursery'],
      ['docstatus', '<', 2],
    ]);
    expect(query.orFilters).toEqual([
      ['name', 'like', '%lina%'],
      ['customer_name', 'like', '%lina%'],
    ]);
  });

  it('lists orders with how far they are delivered and invoiced, and quotations with their validity', async () => {
    const { listCalls } = fakeErpnext({
      'Sales Order': () => [
        {
          name: 'SO-0187',
          customer_name: 'Samir Nasser',
          docstatus: 1,
          status: 'To Deliver and Bill',
          total_qty: 2,
          delivery_status: 'Not Delivered',
          billing_status: 'Not Billed',
          base_grand_total: 170,
          transaction_date: '2026-10-10',
        },
      ],
      Quotation: () => [
        {
          name: 'QT-0084',
          customer_name: 'Lina Haddad',
          docstatus: 0,
          status: 'Draft',
          base_grand_total: 320,
          valid_till: '2026-10-25',
          transaction_date: '2026-10-11',
        },
      ],
    });
    const all = { company: 'Rehan Nursery', currency: 'ILS', term: '', owner: null };
    expect((await api().orders(all, 0, 50)).items[0]).toMatchObject({
      name: 'SO-0187',
      qty: 2,
      deliveryStatus: 'Not Delivered',
    });
    expect((await api().quotes(all, 0, 50)).items[0]).toMatchObject({
      name: 'QT-0084',
      validTill: '2026-10-25',
      docstatus: 0,
    });
    const quotes = listCalls.find((c) => c.doctype === 'Quotation')!;
    expect(quotes.query.filters).toContainEqual(['quotation_to', '=', 'Customer']);
  });

  it('keeps a sales role to its own documents, reads outstanding in the company currency, and drafts as not yet owed', async () => {
    const { listCalls } = fakeErpnext({
      'Sales Invoice': () => [
        {
          name: 'SI-USD',
          customer_name: 'A',
          docstatus: 1,
          is_return: 0,
          update_stock: 1,
          base_grand_total: 370,
          base_rounded_total: 370,
          outstanding_amount: 100,
          conversion_rate: 3.7,
          party_account_currency: 'ILS',
          posting_date: '2026-10-11',
        },
        {
          name: 'SI-DRAFT',
          customer_name: 'B',
          docstatus: 0,
          is_return: 0,
          update_stock: 1,
          base_grand_total: 45,
          base_rounded_total: 45,
          outstanding_amount: 45,
          conversion_rate: 1,
          party_account_currency: 'ILS',
          posting_date: '2026-10-11',
        },
      ],
    });
    const { items: rows } = await api().invoices(
      { company: 'Rehan Nursery', currency: 'ILS', term: '', owner: 'lina@rehan.example' },
      0,
      50,
    );
    expect(rows.map((r) => [r.name, r.outstanding, r.delivered])).toEqual([
      ['SI-USD', 100, true],
      ['SI-DRAFT', 0, false],
    ]);
    expect(listCalls[0].query.filters).toContainEqual(['owner', '=', 'lina@rehan.example']);
  });

  it('counts an order’s invoice as delivered when the order’s goods left on its delivery note', async () => {
    fakeErpnext({
      'Sales Invoice': (query) => {
        const filters = JSON.stringify(query.filters);
        if (filters.includes('so_detail')) {
          return [{ name: 'SI-ORD', so_detail: 'row-1' }];
        }
        if (filters.includes('delivery_note') || filters.includes('delivered_qty')) {
          return [];
        }
        return [
          {
            name: 'SI-ORD',
            customer_name: 'Lina Haddad',
            docstatus: 1,
            is_return: 0,
            update_stock: 0,
            base_grand_total: 320,
            base_rounded_total: 320,
            outstanding_amount: 320,
            conversion_rate: 1,
            party_account_currency: 'ILS',
            posting_date: '2026-10-16',
          },
        ];
      },
      'Sales Order Item': () => [{ name: 'row-1' }],
    });
    const {
      items: [row],
    } = await api().invoices(
      { company: 'Rehan Nursery', currency: 'ILS', term: '', owner: null },
      0,
      50,
    );
    expect(row.delivered).toBe(true);
  });

  it('pages each tab from the offset, one row past the page, with a stable order', async () => {
    const order = (i: number) => ({ name: `SO-${i}`, customer_name: 'A', transaction_date: 'd' });
    const { listCalls } = fakeErpnext({
      'Sales Order': () => Array.from({ length: 51 }, (_, i) => order(i)),
      Quotation: () => [order(1)],
    });
    const all = { company: 'Rehan Nursery', currency: 'ILS', term: '', owner: null };
    const orders = await api().orders(all, 50, 50);
    const quotes = await api().quotes(all, 50, 50);

    expect(listCalls[0].query).toMatchObject({
      limit: 51,
      limitStart: 50,
      orderBy: 'transaction_date desc, creation desc, name desc',
    });
    expect(orders.items).toHaveLength(50);
    expect(orders.more).toBe(true);
    expect(listCalls[1].query).toMatchObject({ limit: 51, limitStart: 50 });
    expect(quotes.more).toBe(false);
  });
});
