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
          is_return: 0,
          update_stock: 1,
          base_grand_total: 320,
          base_rounded_total: 320,
          outstanding_amount: 50,
          conversion_rate: 4,
          posting_date: '2026-10-11',
        },
      ],
    });
    expect(await api().invoices('Rehan Nursery', 'lina')).toEqual([
      {
        name: 'SI-1042',
        customer: 'Lina Haddad',
        docstatus: 1,
        isReturn: false,
        delivered: true,
        total: 320,
        outstanding: 200,
        date: '2026-10-11',
      },
    ]);
    const query = listCalls[0].query;
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
    fakeErpnext({
      'Sales Order': () => [
        {
          name: 'SO-0187',
          customer_name: 'Samir Nasser',
          docstatus: 1,
          status: 'To Deliver and Bill',
          total_qty: 2,
          per_delivered: 0,
          per_billed: 0,
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
    expect((await api().orders('Rehan Nursery', ''))[0]).toMatchObject({
      name: 'SO-0187',
      qty: 2,
      delivered: 0,
      billed: 0,
    });
    expect((await api().quotes('Rehan Nursery', ''))[0]).toMatchObject({
      name: 'QT-0084',
      validTill: '2026-10-25',
      docstatus: 0,
    });
  });
});
