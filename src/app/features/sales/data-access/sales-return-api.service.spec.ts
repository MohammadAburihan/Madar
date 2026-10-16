import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError } from '../../../core/erpnext/confirmation';
import { ReturnChangedError, SalesReturnApiService } from './sales-return-api.service';

const MAKE = 'erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return';
const ORIGINAL = {
  name: 'SI-1042',
  docstatus: 1,
  customer_name: 'Lina Haddad',
  update_stock: 1,
  base_grand_total: 320,
  base_rounded_total: 320,
  base_net_total: 320,
  outstanding_amount: 200,
  conversion_rate: 1,
  party_account_currency: 'ILS',
  items: [
    {
      name: 'row-1',
      item_code: 'OLV-20',
      item_name: 'Olive tree',
      qty: 2,
      uom: 'Unit',
      base_net_rate: 85,
      warehouse: 'Main',
    },
  ],
};
const template = () => ({
  doctype: 'Sales Invoice',
  __islocal: 1,
  is_return: 1,
  update_stock: 1,
  items: [{ item_code: 'OLV-20', qty: -2, sales_invoice_item: 'row-1', warehouse: 'Main' }],
});
const request = {
  reference: 'RET-ABC1234',
  invoice: 'SI-1042',
  currency: 'ILS',
  warehouse: 'Main',
  reason: 'Customer changed order',
  lines: [{ row: 'row-1', qty: 1 }],
};
const api = () => TestBed.inject(SalesReturnApiService);

describe('SalesReturnApiService', () => {
  it('reads what each row still has to return from ERPNext’s return mapper', async () => {
    fakeErpnext(
      {
        Item: () => [{ name: 'OLV-20' }],
        // An earlier return of 1 credited the invoice; a credit kept on its own note didn't.
        'Sales Invoice': () => [
          { base_grand_total: -85, update_outstanding_for_self: 0 },
          { base_grand_total: -20, update_outstanding_for_self: 1 },
        ],
      },
      { [MAKE]: () => ({ ...template(), items: [{ ...template().items[0], qty: -1 }] }) },
      { 'Sales Invoice/SI-1042': ORIGINAL },
    );
    expect(await api().source('SI-1042', 'ILS')).toMatchObject({
      movesStock: true,
      returnable: true,
      total: 320,
      outstanding: 200,
      paid: 35,
      lines: [{ row: 'row-1', sold: 2, returnable: 1, rate: 85, warehouse: 'Main', isStock: true }],
    });
  });

  it('has nothing to return when ERPNext answers that everything came back', async () => {
    fakeErpnext(
      {},
      { [MAKE]: () => throwError(() => new HttpErrorResponse({ status: 417 })) },
      { 'Sales Invoice/SI-1042': ORIGINAL },
    );
    expect((await api().source('SI-1042', 'ILS')).lines[0].returnable).toBe(0);
  });

  it('posts a credit note against the invoice for the chosen rows, with the reference and reason', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        [MAKE]: template,
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'SI-1050' }),
        'frappe.client.submit': () => ({
          name: 'SI-1050',
          base_grand_total: -85,
          base_rounded_total: 0,
        }),
      },
      { 'Sales Invoice/SI-1042': { ...ORIGINAL, outstanding_amount: 115 } },
    );
    expect(await api().confirm(request, null)).toEqual({
      name: 'SI-1050',
      credit: 85,
      dueAfter: 115,
    });
    const doc = postCalls[1].body['doc'] as Record<string, unknown>;
    expect(doc).toMatchObject({
      update_outstanding_for_self: 0,
      remarks: 'Madar return RET-ABC1234 · Customer changed order',
      set_warehouse: 'Main',
      items: [{ qty: -1, sales_invoice_item: 'row-1', warehouse: 'Main' }],
    });
    expect(doc).not.toHaveProperty('__islocal');
  });

  it('refuses a return the invoice no longer has, posting nothing', async () => {
    const { postCalls } = fakeErpnext({}, { [MAKE]: () => ({ ...template(), items: [] }) });
    await expect(api().confirm(request, null)).rejects.toBeInstanceOf(ReturnChangedError);
    expect(postCalls.map((c) => c.method)).toEqual([MAKE]);
  });

  it('rebuilds a left-behind draft in place, and takes a posted one only with this reference', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        [MAKE]: template,
        'frappe.client.save': (body) => body['doc'],
        'frappe.client.submit': () => ({
          name: 'SI-1050',
          base_grand_total: -85,
          base_rounded_total: 0,
        }),
      },
      {
        'Sales Invoice/SI-1050': { name: 'SI-1050', docstatus: 0, modified: 'm', creation: 'c' },
        'Sales Invoice/SI-1042': ORIGINAL,
      },
    );
    await api().confirm(request, 'SI-1050');
    expect(postCalls.map((c) => c.method)).toEqual([
      MAKE,
      'frappe.client.save',
      'frappe.client.submit',
    ]);
    expect(postCalls[1].body['doc']).toMatchObject({ name: 'SI-1050', modified: 'm' });
  });

  it('credits each row with its share of the invoice’s taxes', async () => {
    fakeErpnext(
      { Item: () => [{ name: 'OLV-20' }] },
      { [MAKE]: template },
      {
        'Sales Invoice/SI-1042': {
          ...ORIGINAL,
          base_net_total: 170,
          base_grand_total: 195.5,
          base_rounded_total: 196,
          items: [{ ...ORIGINAL.items[0], base_net_rate: 85 }],
        },
      },
    );
    expect((await api().source('SI-1042', 'ILS')).lines[0].rate).toBeCloseTo(98, 6);
  });

  it('takes a posted note with this reference as the result only when it returned what is asked', async () => {
    const posted = {
      name: 'SI-1050',
      docstatus: 1,
      remarks: 'Madar return RET-ABC1234',
      base_grand_total: -170,
      base_rounded_total: 0,
      items: [{ sales_invoice_item: 'row-1', qty: -2 }],
    };
    const { postCalls } = fakeErpnext(
      {},
      {},
      { 'Sales Invoice/SI-1050': posted, 'Sales Invoice/SI-1042': ORIGINAL },
    );
    await expect(api().confirm(request, 'SI-1050')).rejects.toBeInstanceOf(PostedEarlierError);
    expect(
      (await api().confirm({ ...request, lines: [{ row: 'row-1', qty: 2 }] }, 'SI-1050')).credit,
    ).toBe(170);
    // Posted by an earlier task's slow submit: reload first, never a second note.
    await expect(
      api().confirm(
        { ...request, reference: 'RET-NEXT', lines: [{ row: 'row-1', qty: 2 }] },
        'SI-1050',
      ),
    ).rejects.toBeInstanceOf(PostedEarlierError);
    expect(postCalls).toEqual([]);
  });

  it('sends each row back to its own warehouse unless one is chosen', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        [MAKE]: () => ({
          ...template(),
          items: [
            { item_code: 'OLV-20', qty: -1, sales_invoice_item: 'a', warehouse: 'Main' },
            { item_code: 'POT-30', qty: -1, sales_invoice_item: 'b', warehouse: 'Shop' },
          ],
        }),
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'SI-1050' }),
        'frappe.client.submit': () => ({
          name: 'SI-1050',
          base_grand_total: -1,
          base_rounded_total: 0,
        }),
      },
      { 'Sales Invoice/SI-1042': ORIGINAL },
    );
    await api().confirm(
      {
        ...request,
        warehouse: null,
        lines: [
          { row: 'a', qty: 1 },
          { row: 'b', qty: 1 },
        ],
      },
      null,
    );
    const doc = postCalls[1].body['doc'] as { items: { warehouse: string }[] };
    expect(doc).not.toHaveProperty('set_warehouse');
    expect(doc.items.map((i) => i.warehouse)).toEqual(['Main', 'Shop']);
  });

  it('takes the returned share of a fixed discount and "Actual" charges, which the mapper copies whole', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        [MAKE]: () => ({
          ...template(),
          discount_amount: -20,
          additional_discount_percentage: 0,
          taxes: [
            { charge_type: 'Actual', tax_amount: -10 },
            { charge_type: 'On Net Total', rate: 16 },
          ],
        }),
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'SI-1050' }),
        'frappe.client.submit': () => ({
          name: 'SI-1050',
          base_grand_total: -40,
          base_rounded_total: 0,
        }),
      },
      {
        'Sales Invoice/SI-1042': {
          ...ORIGINAL,
          items: [{ ...ORIGINAL.items[0], qty: 2, rate: 45 }],
        },
      },
    );
    await api().confirm(request, null);
    expect(postCalls[1].body['doc']).toMatchObject({
      discount_amount: -10,
      taxes: [
        { charge_type: 'Actual', tax_amount: -5 },
        { charge_type: 'On Net Total', rate: 16 },
      ],
    });
  });
});
