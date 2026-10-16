import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import {
  DeliveryChangedError,
  InvoiceChangedError,
  SalesOrderApiService,
} from './sales-order-api.service';

const MAKE = 'erpnext.selling.doctype.quotation.quotation.make_sales_order';
const MAKE_INVOICE = 'erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice';
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
    // Retried after the site's midnight: still this order.
    expect(await api().fromQuotation({ ...request, deliveryDate: '2026-10-17' }, 'SO-1')).toBe(
      'SO-1',
    );
    await expect(
      api().fromQuotation({ ...request, quotation: 'QT-0090' }, 'SO-1'),
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

  it('still shows the order when the item list can’t be read, every line counted as goods', async () => {
    fakeErpnext(
      { Item: () => throwError(() => new HttpErrorResponse({ status: 403 })) },
      {},
      {
        'Sales Order/SO-1': {
          name: 'SO-1',
          items: [{ name: 'a', item_code: 'SRV-GARDEN', qty: 1, delivered_qty: 0 }],
        },
      },
    );
    expect((await api().order('SO-1')).lines[0].isStock).toBe(true);
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

  it('delivers only the chosen rows from the chosen warehouse, with its own reference', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'erpnext.selling.doctype.sales_order.sales_order.make_delivery_note': () => ({
          doctype: 'Delivery Note',
          utm_content: 'ORD-ABC1234',
          items: [
            { item_code: 'OLV-20', qty: 2, so_detail: 'tree', warehouse: 'Stores' },
            { item_code: 'SRV-GARDEN', qty: 1, so_detail: 'visit' },
          ],
        }),
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'DN-1' }),
        'frappe.client.submit': () => ({ name: 'DN-1' }),
      },
    );
    const delivery = {
      reference: 'DEL-ABC1234',
      order: 'SO-1',
      warehouse: 'Main',
      lines: [{ row: 'tree', qty: 1 }],
    };
    expect(await api().deliver(delivery, null)).toBe('DN-1');
    expect(postCalls[1].body['doc']).toMatchObject({
      utm_content: 'DEL-ABC1234',
      set_warehouse: 'Main',
      items: [{ item_code: 'OLV-20', qty: 1, warehouse: 'Main' }],
    });
    expect((postCalls[1].body['doc'] as { items: unknown[] }).items).toHaveLength(1);
  });

  it('takes a posted delivery as the result only when its rows match', async () => {
    fakeErpnext(
      {},
      {},
      {
        'Delivery Note/DN-1': {
          name: 'DN-1',
          docstatus: 1,
          set_warehouse: 'Main',
          items: [{ so_detail: 'tree', qty: 1, warehouse: 'Main' }],
        },
      },
    );
    const delivery = {
      reference: 'DEL-1',
      order: 'SO-1',
      warehouse: 'Main',
      lines: [{ row: 'tree', qty: 1 }],
    };
    expect(await api().deliver(delivery, 'DN-1')).toBe('DN-1');
    await expect(
      api().deliver({ ...delivery, lines: [{ row: 'tree', qty: 2 }] }, 'DN-1'),
    ).rejects.toBeInstanceOf(PostedEarlierError);
  });

  it('invoices the order without moving stock, refusing an amount other than the one reviewed', async () => {
    const template = () => ({
      doctype: 'Sales Invoice',
      update_stock: 1,
      base_grand_total: 319.99,
      base_rounded_total: 320,
      items: [{ item_code: 'OLV-20', item_name: 'Olive tree', qty: 2, base_amount: 170 }],
    });
    const { postCalls } = fakeErpnext(
      { Item: () => [{ name: 'OLV-20' }] },
      {
        [MAKE_INVOICE]: template,
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'SI-1' }),
        'frappe.client.submit': () => ({
          name: 'SI-1',
          base_grand_total: 319.99,
          base_rounded_total: 320,
          outstanding_amount: 320,
        }),
      },
    );
    expect(await api().invoicePreview('SO-1')).toMatchObject({
      total: 320,
      lines: [{ name: 'Olive tree', amount: 170, isStock: true }],
    });
    expect(
      await api().invoice({ reference: 'INV-1', order: 'SO-1', currency: 'ILS', total: 320 }, null),
    ).toEqual({
      name: 'SI-1',
      total: 320,
      outstanding: 320,
    });
    expect(postCalls[2].body['doc']).toMatchObject({
      update_stock: 0,
      remarks: 'Madar order invoice INV-1',
    });
    await expect(
      api().invoice({ reference: 'INV-2', order: 'SO-1', currency: 'ILS', total: 170 }, null),
    ).rejects.toBeInstanceOf(InvoiceChangedError);
  });

  it('rebuilds a remembered invoice draft in place instead of deleting it, and converts the outstanding', async () => {
    const draft = {
      name: 'SI-1',
      docstatus: 0,
      modified: 'm',
      creation: 'c',
      owner: 'lina',
      items: [],
    };
    const { postCalls } = fakeErpnext(
      {},
      {
        [MAKE_INVOICE]: () => ({
          __islocal: 1,
          base_grand_total: 370,
          base_rounded_total: 370,
          items: [],
        }),
        'frappe.client.save': (body) => body['doc'],
        'frappe.client.submit': () => ({
          name: 'SI-1',
          base_grand_total: 370,
          base_rounded_total: 370,
          outstanding_amount: 100,
          conversion_rate: 3.7,
          party_account_currency: 'USD',
        }),
      },
      { 'Sales Invoice/SI-1': draft },
    );
    expect(
      await api().invoice(
        { reference: 'INV-1', order: 'SO-1', currency: 'ILS', total: 370 },
        'SI-1',
      ),
    ).toEqual({ name: 'SI-1', total: 370, outstanding: 370 });
    expect(postCalls.map((c) => c.method)).toEqual([
      MAKE_INVOICE,
      'frappe.client.save',
      'frappe.client.submit',
    ]);
    expect(postCalls[1].body['doc']).toMatchObject({ name: 'SI-1', modified: 'm', creation: 'c' });
    expect(postCalls[1].body['doc']).not.toHaveProperty('__islocal');
  });

  it('refuses a delivery when the order has less left than confirmed, posting nothing', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'erpnext.selling.doctype.sales_order.sales_order.make_delivery_note': () => ({
          items: [{ item_code: 'OLV-20', qty: 1, so_detail: 'tree' }],
        }),
      },
    );
    const delivery = {
      reference: 'DEL-1',
      order: 'SO-1',
      warehouse: 'Main',
      lines: [{ row: 'tree', qty: 2 }],
    };
    await expect(api().deliver(delivery, null)).rejects.toBeInstanceOf(DeliveryChangedError);
    await expect(
      api().deliver({ ...delivery, lines: [{ row: 'visit', qty: 1 }] }, null),
    ).rejects.toBeInstanceOf(DeliveryChangedError);
    expect(postCalls.map((c) => c.method)).not.toContain('frappe.client.insert');
  });

  it('bills anew when the remembered draft was posted by someone else', async () => {
    const posted = {
      name: 'SI-OLD',
      docstatus: 1,
      remarks: 'Madar order invoice INV-OLD',
      items: [],
    };
    const { postCalls } = fakeErpnext(
      {},
      {
        [MAKE_INVOICE]: () => ({ base_grand_total: 150, base_rounded_total: 150, items: [] }),
        'frappe.client.insert': () => ({ name: 'SI-2' }),
        'frappe.client.submit': () => ({
          name: 'SI-2',
          base_grand_total: 150,
          base_rounded_total: 150,
        }),
      },
      { 'Sales Invoice/SI-OLD': posted },
    );
    const request = { reference: 'INV-NEW', order: 'SO-1', currency: 'ILS', total: 150 };
    expect((await api().invoice(request, 'SI-OLD')).name).toBe('SI-2');
    expect(postCalls.map((c) => c.method)).toContain('frappe.client.insert');
  });

  it('asks for a new review when everything was billed since', async () => {
    const request = { reference: 'INV-NEW', order: 'SO-1', currency: 'ILS', total: 150 };
    fakeErpnext(
      {},
      { [MAKE_INVOICE]: () => throwError(() => new HttpErrorResponse({ status: 417 })) },
    );
    await expect(api().invoice(request, null)).rejects.toBeInstanceOf(InvoiceChangedError);
  });
});
