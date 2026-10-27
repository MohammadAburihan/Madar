import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { ItemsApiService } from './items-api.service';
import { ItemFormValue } from './items.models';

const api = () => TestBed.inject(ItemsApiService);
const forbidden = () => throwError(() => new HttpErrorResponse({ status: 403 }));
const WAREHOUSES = () => [
  { name: 'Main - RN', warehouse_name: 'Main warehouse' },
  { name: 'Shop - RN', warehouse_name: 'Garden shop' },
];
const ROWS = [
  {
    name: 'OLV-20',
    item_name: 'Olive tree',
    item_group: 'Plants',
    stock_uom: 'Unit',
    is_stock_item: 1,
  },
  {
    name: 'SRV-GARDEN',
    item_name: 'Garden consultation',
    item_group: 'Services',
    stock_uom: 'Visit',
    is_stock_item: 0,
  },
];
const SELLING = { 'frappe.client.get_value': () => ({ selling_price_list: 'Standard Selling' }) };
const value = (overrides: Partial<ItemFormValue> = {}): ItemFormValue => ({
  kind: 'product',
  name: ' Ceramic planter ',
  code: ' POT-30 ',
  barcode: '7290000654321',
  group: 'Pots',
  uom: 'Unit',
  price: 45,
  cost: 22.5,
  ...overrides,
});

describe('ItemsApiService', () => {
  it('lists products and services with their selling price and stock across the business', async () => {
    const { listCalls } = fakeErpnext(
      {
        Item: () => ROWS,
        'Item Price': () => [
          { item_code: 'OLV-20', price_list_rate: 85 },
          { item_code: 'SRV-GARDEN', price_list_rate: 150 },
        ],
        Warehouse: WAREHOUSES,
        Bin: () => [
          { item_code: 'OLV-20', warehouse: 'Main - RN', actual_qty: 24 },
          { item_code: 'OLV-20', warehouse: 'Other - OC', actual_qty: 99 },
          { item_code: 'OLV-20', warehouse: 'Shop - RN', actual_qty: 6 },
        ],
      },
      SELLING,
    );
    expect(
      (await api().catalog('olive', 'all', 'Rehan Nursery', '2026-10-19', 0, 50)).items,
    ).toEqual([
      {
        code: 'OLV-20',
        name: 'Olive tree',
        group: 'Plants',
        uom: 'Unit',
        kind: 'product',
        price: 85,
        onHand: 30,
      },
      {
        code: 'SRV-GARDEN',
        name: 'Garden consultation',
        group: 'Services',
        uom: 'Visit',
        kind: 'service',
        price: 150,
        onHand: null,
      },
    ]);
    expect(listCalls[0].query.orFilters).toContainEqual([
      'Item Barcode',
      'barcode',
      'like',
      '%olive%',
    ]);
    expect(listCalls.find((c) => c.doctype === 'Item Price')?.query.filters).toContainEqual([
      'price_list',
      '=',
      'Standard Selling',
    ]);
  });

  it('filters by kind, and leaves prices and stock out where the role may not read them', async () => {
    const { listCalls } = fakeErpnext(
      { Item: () => [ROWS[0]], Warehouse: WAREHOUSES, Bin: forbidden },
      { 'frappe.client.get_value': forbidden },
    );
    expect(
      (await api().catalog('', 'product', 'Rehan Nursery', '2026-10-19', 0, 50)).items,
    ).toEqual([expect.objectContaining({ code: 'OLV-20', price: null, onHand: null })]);
    expect(listCalls[0].query.filters).toContainEqual(['is_stock_item', '=', 1]);
  });

  it('adds a product with its price, cost and barcode in one insert', async () => {
    const { postCalls } = fakeErpnext({}, { 'frappe.client.insert': () => ({ name: 'POT-30' }) });
    expect(await api().create(value())).toBe('POT-30');
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Item',
      item_code: 'POT-30',
      item_name: 'Ceramic planter',
      description: 'Ceramic planter',
      item_group: 'Pots',
      stock_uom: 'Unit',
      is_stock_item: 1,
      include_item_in_manufacturing: 0,
      valuation_rate: 22.5,
      standard_rate: 45,
      barcodes: [{ barcode: '7290000654321' }],
    });
  });

  it('adds a service without stock or cost, and without a price for roles that may not set one', async () => {
    const { postCalls } = fakeErpnext({}, { 'frappe.client.insert': () => ({ name: 'SRV-X' }) });
    await api().create(
      value({ kind: 'service', code: 'SRV-X', price: null, cost: null, barcode: '' }),
    );
    const doc = postCalls[0].body['doc'] as Record<string, unknown>;
    expect(doc).toMatchObject({ is_stock_item: 0, barcodes: [] });
    expect(doc).not.toHaveProperty('standard_rate');
    expect(doc).not.toHaveProperty('valuation_rate');
  });

  it('reports a lost answer as unresolved, and finds the item by its code', async () => {
    fakeErpnext(
      { Item: () => [{ name: 'POT-30', item_name: 'Ceramic planter' }] },
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
    );
    await expect(api().create(value())).rejects.toBeInstanceOf(UnresolvedError);
    expect(await api().exists('POT-30')).toEqual({ name: 'POT-30', itemName: 'Ceramic planter' });
  });

  it('saves edits over the loaded item and updates the existing selling price', async () => {
    const { postCalls } = fakeErpnext(
      {
        'Item Price': () => [
          {
            name: 'OLD',
            item_code: 'POT-30',
            price_list_rate: 40,
            uom: null,
            valid_from: '2025-01-01',
            valid_upto: '2025-12-31',
          },
          {
            name: 'PRICE-1',
            item_code: 'POT-30',
            price_list_rate: 45,
            uom: 'Unit',
            valid_from: '2026-01-01',
            valid_upto: null,
          },
          {
            name: 'BOX',
            item_code: 'POT-30',
            price_list_rate: 400,
            uom: 'Box',
            valid_from: null,
            valid_upto: null,
          },
        ],
      },
      {
        ...SELLING,
        'frappe.client.save': () => ({ modified: '2026-10-19 09:00:00' }),
        'frappe.client.set_value': () => ({}),
      },
      {
        'Item/POT-30': {
          doctype: 'Item',
          name: 'POT-30',
          item_name: 'Planter',
          item_group: 'Pots',
          stock_uom: 'Unit',
          is_stock_item: 1,
          valuation_rate: 20,
          modified: '2026-10-19 08:00:00',
          barcodes: [{ name: 'BC-1', barcode: 'OLD' }],
        },
      },
    );
    const saved: string[] = [];
    await api().update(
      'POT-30',
      value({ price: 49 }),
      true,
      '2026-10-19 07:00:00',
      '2026-10-19',
      (m) => saved.push(m),
    );
    // A price that then fails is saved again on this version, not refused as changed by someone else.
    expect(saved).toEqual(['2026-10-19 09:00:00']);
    expect(postCalls[0].body['doc']).toMatchObject({
      name: 'POT-30',
      // The form's version: ERPNext refuses the save if the item changed since it was opened.
      modified: '2026-10-19 07:00:00',
      item_name: 'Ceramic planter',
      valuation_rate: 22.5,
      barcodes: [{ name: 'BC-1', barcode: '7290000654321', idx: 1 }],
    });
    expect(postCalls[1]).toEqual({
      method: 'frappe.client.set_value',
      body: { doctype: 'Item Price', name: 'PRICE-1', fieldname: 'price_list_rate', value: 49 },
    });
  });

  it("shows the standard price in the item's unit and valid today, never a customer's own", async () => {
    const { listCalls } = fakeErpnext(
      {
        Item: () => [ROWS[0]],
        'Item Price': () => [
          {
            name: 'P1',
            item_code: 'OLV-20',
            price_list_rate: 70,
            uom: 'Unit',
            valid_from: '2025-01-01',
            valid_upto: '2025-12-31',
          },
          {
            name: 'P2',
            item_code: 'OLV-20',
            price_list_rate: 85,
            uom: 'Unit',
            valid_from: '2026-01-01',
            valid_upto: null,
          },
          {
            name: 'P3',
            item_code: 'OLV-20',
            price_list_rate: 900,
            uom: 'Box',
            valid_from: null,
            valid_upto: null,
          },
        ],
        Warehouse: WAREHOUSES,
        Bin: () => [],
      },
      SELLING,
    );
    const {
      items: [olive],
    } = await api().catalog('', 'all', 'Rehan Nursery', '2026-10-19', 0, 50);
    expect(olive.price).toBe(85);
    expect(listCalls.find((c) => c.doctype === 'Item Price')?.query.filters).toEqual(
      expect.arrayContaining([
        ['customer', 'is', 'not set'],
        ['batch_no', 'is', 'not set'],
      ]),
    );
  });

  it('saves Arabic-keyboard barcodes in Western digits, and renames the description that was the name', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.insert': () => ({ name: 'POT-31' }), 'frappe.client.save': () => ({}) },
      {
        'Item/POT-30': {
          doctype: 'Item',
          name: 'POT-30',
          item_name: 'Planter',
          description: 'Planter',
          stock_uom: 'Unit',
          is_stock_item: 1,
          barcodes: [],
        },
      },
    );
    await api().create(value({ code: 'زيت-١٢', barcode: '٧٢٩٠٠' }));
    expect(postCalls[0].body['doc']).toMatchObject({
      item_code: 'زيت-12',
      barcodes: [{ barcode: '72900' }],
    });
    await api().update('POT-30', value({ price: null }), false, 'M', '2026-10-19');
    expect(postCalls[1].body['doc']).toMatchObject({
      item_name: 'Ceramic planter',
      description: 'Ceramic planter',
    });
  });

  it('clears a barcode once: saving again leaves the next one alone', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.save': () => ({}) },
      {
        'Item/POT-30': {
          doctype: 'Item',
          name: 'POT-30',
          stock_uom: 'Unit',
          is_stock_item: 1,
          barcodes: [{ barcode: 'B' }],
        },
      },
    );
    // The form showed A, already removed by the first save; B stays.
    await api().update(
      'POT-30',
      value({ barcode: '', price: null }),
      false,
      'M',
      'D',
      () => undefined,
      'A',
    );
    expect(postCalls[0].body['doc']).toMatchObject({ barcodes: [{ barcode: 'B', idx: 1 }] });
  });

  it("drops a replaced barcode's type, which may not fit the new code", async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.save': () => ({}) },
      {
        'Item/POT-30': {
          doctype: 'Item',
          name: 'POT-30',
          stock_uom: 'Unit',
          is_stock_item: 1,
          barcodes: [{ name: 'BC-1', barcode: '4006381333931', barcode_type: 'EAN' }],
        },
      },
    );
    await api().update('POT-30', value({ barcode: 'SKU-55', price: null }), false, 'M', 'D');
    expect(postCalls[0].body['doc']).toMatchObject({
      barcodes: [{ name: 'BC-1', barcode: 'SKU-55', barcode_type: '', idx: 1 }],
    });
  });

  it('tells a lost edit that landed from a change someone else made', async () => {
    const doc = {
      doctype: 'Item',
      name: 'POT-30',
      item_name: 'Ceramic planter',
      item_group: 'Pots',
      stock_uom: 'Unit',
      is_stock_item: 1,
      valuation_rate: 22.5,
      barcodes: [{ barcode: '7290000654321' }],
      modified: 'NEW',
    };
    fakeErpnext({}, {}, { 'Item/POT-30': doc });
    expect(await api().savedAs('POT-30', value())).toBe('NEW');
    expect(await api().savedAs('POT-30', value({ group: 'Plants' }))).toBeNull();
    TestBed.resetTestingModule();
    fakeErpnext({}, {}, { 'Item/POT-30': { ...doc, barcodes: [{ barcode: '٧٢٩٠٠٠٠٦٥٤٣٢١' }] } });
    expect(await api().savedAs('POT-30', value())).toBe('NEW');
  });

  it('lists an item once even when two of its barcodes match', async () => {
    fakeErpnext({ Item: () => [ROWS[0], ROWS[0]], Warehouse: WAREHOUSES, Bin: () => [] }, SELLING);
    expect(
      (await api().catalog('729', 'all', 'Rehan Nursery', '2026-10-19', 0, 50)).items,
    ).toHaveLength(1);
    TestBed.resetTestingModule();
    fakeErpnext(
      {
        Item: () => Array.from({ length: 50 }, () => ROWS[0]),
        Warehouse: WAREHOUSES,
        Bin: () => [],
      },
      SELLING,
    );
  });

  it('asks for one row past the page to know there is more, and counts the rows it used', async () => {
    const { listCalls } = fakeErpnext(
      {
        Item: () => Array.from({ length: 51 }, (_, i) => ({ ...ROWS[0], name: `OLV-${i}` })),
        Warehouse: WAREHOUSES,
        Bin: () => [],
      },
      SELLING,
    );
    const page = await api().catalog('', 'all', 'Rehan Nursery', '2026-10-19', 100, 50);

    const query = listCalls.find((c) => c.doctype === 'Item')?.query;
    expect(query).toMatchObject({
      limit: 51,
      limitStart: 100,
      orderBy: 'item_name asc, name asc',
    });
    expect(page.items).toHaveLength(50);
    expect(page.more).toBe(true);
    expect(page.fetched).toBe(50);
  });

  it('has no more on a short last page', async () => {
    fakeErpnext({ Item: () => ROWS, Warehouse: WAREHOUSES, Bin: () => [] }, SELLING);
    expect(await api().catalog('', 'all', 'Rehan Nursery', '2026-10-19', 50, 50)).toMatchObject({
      more: false,
    });
  });

  it("keeps a service's barcodes when it is saved", async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.save': () => ({}) },
      {
        'Item/SRV-1': {
          doctype: 'Item',
          name: 'SRV-1',
          stock_uom: 'Visit',
          is_stock_item: 0,
          barcodes: [{ barcode: 'SRV-BC' }],
        },
      },
    );
    await api().update(
      'SRV-1',
      value({ kind: 'service', barcode: '', price: null }),
      false,
      'M',
      '2026-10-19',
    );
    expect(postCalls[0].body['doc']).toMatchObject({ barcodes: [{ barcode: 'SRV-BC', idx: 1 }] });
  });

  it('adds a selling price when the item has none yet', async () => {
    const { postCalls } = fakeErpnext(
      { 'Item Price': () => [] },
      { ...SELLING, 'frappe.client.save': () => ({}), 'frappe.client.insert': () => ({}) },
      { 'Item/POT-30': { doctype: 'Item', name: 'POT-30', stock_uom: 'Unit', is_stock_item: 1 } },
    );
    await api().update('POT-30', value({ price: 49, cost: null }), true, 'M', '2026-10-19');
    expect(postCalls[1].body['doc']).toEqual({
      doctype: 'Item Price',
      item_code: 'POT-30',
      price_list: 'Standard Selling',
      uom: 'Unit',
      price_list_rate: 49,
    });
  });

  it('reads an item with its stock per location', async () => {
    fakeErpnext(
      {
        'Item Price': () => [],
        Warehouse: WAREHOUSES,
        Bin: () => [{ warehouse: 'Main - RN', actual_qty: 24 }],
      },
      SELLING,
      {
        'Item/OLV-20': {
          ...ROWS[0],
          doctype: 'Item',
          valuation_rate: 42,
          barcodes: [{ barcode: '7290000123456' }],
        },
      },
    );
    expect(await api().detail('OLV-20', 'Rehan Nursery', '2026-10-19')).toMatchObject({
      priceReadable: true,
      price: null,
      cost: 42,
      barcode: '7290000123456',
      onHand: 24,
      stock: [
        { warehouse: 'Main warehouse', qty: 24 },
        { warehouse: 'Garden shop', qty: 0 },
      ],
    });
  });
});
