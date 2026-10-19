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
    expect(await api().catalog('olive', 'all', 'Rehan Nursery')).toEqual([
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
    expect(await api().catalog('', 'product', 'Rehan Nursery')).toEqual([
      expect.objectContaining({ code: 'OLV-20', price: null, onHand: null }),
    ]);
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
      { Item: () => [{ item_name: 'Ceramic planter' }] },
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
    );
    await expect(api().create(value())).rejects.toBeInstanceOf(UnresolvedError);
    expect(await api().exists('POT-30')).toBe('Ceramic planter');
  });

  it('saves edits over the loaded item and updates the existing selling price', async () => {
    const { postCalls } = fakeErpnext(
      { 'Item Price': () => [{ name: 'PRICE-1' }] },
      { ...SELLING, 'frappe.client.save': () => ({}), 'frappe.client.set_value': () => ({}) },
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
    await api().update('POT-30', value({ price: 49 }), true);
    expect(postCalls[0].body['doc']).toMatchObject({
      name: 'POT-30',
      modified: '2026-10-19 08:00:00',
      item_name: 'Ceramic planter',
      valuation_rate: 22.5,
      barcodes: [{ name: 'BC-1', barcode: '7290000654321' }],
    });
    expect(postCalls[1]).toEqual({
      method: 'frappe.client.set_value',
      body: { doctype: 'Item Price', name: 'PRICE-1', fieldname: 'price_list_rate', value: 49 },
    });
  });

  it('adds a selling price when the item has none yet', async () => {
    const { postCalls } = fakeErpnext(
      { 'Item Price': () => [] },
      { ...SELLING, 'frappe.client.save': () => ({}), 'frappe.client.insert': () => ({}) },
      { 'Item/POT-30': { doctype: 'Item', name: 'POT-30', stock_uom: 'Unit', is_stock_item: 1 } },
    );
    await api().update('POT-30', value({ price: 49, cost: null }), true);
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
    expect(await api().detail('OLV-20', 'Rehan Nursery')).toMatchObject({
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
