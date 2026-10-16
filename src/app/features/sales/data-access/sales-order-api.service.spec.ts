import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { SalesOrderApiService } from './sales-order-api.service';

const MAKE = 'erpnext.selling.doctype.quotation.quotation.make_sales_order';
const request = { reference: 'ORD-ABC1234', quotation: 'QT-0084', deliveryDate: '2026-10-16' };
const template = () => ({
  doctype: 'Sales Order',
  customer: 'Lina Haddad',
  utm_content: 'QUO-QUOTE01',
  ignore_pricing_rule: 0,
  items: [{ item_code: 'OLV-20', qty: 2, rate: 85, prevdoc_docname: 'QT-0084' }],
});
const api = () => TestBed.inject(SalesOrderApiService);

describe('SalesOrderApiService', () => {
  it('makes the order from the quotation with its own reference, the quoted rates and the expected delivery', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        [MAKE]: template,
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'SO-1' }),
        'frappe.client.submit': () => ({ name: 'SO-1' }),
      },
    );
    const inserted: string[] = [];
    expect(await api().fromQuotation(request, null, (n) => inserted.push(n))).toBe('SO-1');
    expect(inserted).toEqual(['SO-1']);
    expect(postCalls[0].body).toEqual({ source_name: 'QT-0084' });
    expect(postCalls[1].body['doc']).toMatchObject({
      utm_content: 'ORD-ABC1234',
      ignore_pricing_rule: 1,
      delivery_date: '2026-10-16',
      items: [{ item_code: 'OLV-20', delivery_date: '2026-10-16' }],
    });
  });

  it('takes a remembered submitted order as the result only when it matches, and rebuilds a draft', async () => {
    const posted = {
      name: 'SO-1',
      docstatus: 1,
      delivery_date: '2026-10-16',
      items: [{ prevdoc_docname: 'QT-0084' }],
    };
    fakeErpnext({}, {}, { 'Sales Order/SO-1': posted });
    expect(await api().fromQuotation(request, 'SO-1')).toBe('SO-1');
    await expect(
      api().fromQuotation({ ...request, deliveryDate: '2026-10-17' }, 'SO-1'),
    ).rejects.toBeInstanceOf(PostedEarlierError);
  });

  it('deletes a leftover draft before making the order again', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        [MAKE]: template,
        'frappe.client.insert': () => ({ name: 'SO-2' }),
        'frappe.client.submit': () => ({ name: 'SO-2' }),
      },
      { 'Sales Order/SO-1': { name: 'SO-1', docstatus: 0, items: [] } },
    );
    expect(await api().fromQuotation(request, 'SO-1')).toBe('SO-2');
    expect(postCalls[0]).toEqual({
      method: 'frappe.client.delete',
      body: { doctype: 'Sales Order', name: 'SO-1' },
    });
  });

  it('turns a lost answer after the insert into an unresolved confirmation', async () => {
    fakeErpnext(
      {},
      {
        [MAKE]: template,
        'frappe.client.insert': () => ({ name: 'SO-1' }),
        'frappe.client.submit': () => throwError(() => new HttpErrorResponse({ status: 504 })),
      },
    );
    await expect(api().fromQuotation(request, null)).rejects.toBeInstanceOf(UnresolvedError);
  });

  it('finds an order by its reference, telling a draft from a submitted one', async () => {
    const { listCalls } = fakeErpnext({ 'Sales Order': () => [{ name: 'SO-1', docstatus: 0 }] });
    expect(await api().find('ORD-ABC1234')).toEqual({ draft: 'SO-1' });
    expect(listCalls[0].query.filters).toContainEqual(['utm_content', '=', 'ORD-ABC1234']);
  });

  it('reads an order in the company currency with its quotation and which lines are goods', async () => {
    fakeErpnext(
      { Item: () => [{ name: 'OLV-20' }] },
      {},
      {
        'Sales Order/SO-0187': {
          name: 'SO-0187',
          docstatus: 1,
          status: 'To Deliver and Bill',
          customer: 'Lina Haddad',
          customer_name: 'Lina Haddad',
          delivery_status: 'Not Delivered',
          billing_status: 'Not Billed',
          transaction_date: '2026-10-11',
          delivery_date: '2026-10-13',
          base_grand_total: 319.99,
          base_rounded_total: 320,
          items: [
            {
              name: 'row-1',
              item_code: 'OLV-20',
              item_name: 'Olive tree',
              qty: 2,
              delivered_qty: 0,
              uom: 'Unit',
              rate: 23.6,
              base_rate: 85,
              base_amount: 170,
              prevdoc_docname: 'QT-0084',
            },
            {
              name: 'row-2',
              item_code: 'SRV-GARDEN',
              item_name: 'Garden consultation',
              qty: 1,
              delivered_qty: 0,
              uom: 'Visit',
              base_rate: 150,
              base_amount: 150,
              prevdoc_docname: 'QT-0084',
            },
          ],
        },
      },
    );
    const order = await api().order('SO-0187');
    expect(order).toMatchObject({ quotation: 'QT-0084', total: 320, deliveryDate: '2026-10-13' });
    expect(order.lines.map((l) => [l.rate, l.isStock])).toEqual([
      [85, true],
      [150, false],
    ]);
  });

  it('moves every row’s expected delivery, since ERPNext takes the order’s date from them', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.save': () => ({}) },
      {
        'Sales Order/SO-1': {
          name: 'SO-1',
          delivery_date: '2026-10-13',
          items: [
            { name: 'a', delivery_date: '2026-10-13' },
            { name: 'b', delivery_date: '2026-10-14' },
          ],
        },
      },
    );
    await api().setDeliveryDate('SO-1', '2026-10-20');
    expect(postCalls[0].body['doc']).toMatchObject({
      delivery_date: '2026-10-20',
      items: [{ delivery_date: '2026-10-20' }, { delivery_date: '2026-10-20' }],
    });
  });
});
