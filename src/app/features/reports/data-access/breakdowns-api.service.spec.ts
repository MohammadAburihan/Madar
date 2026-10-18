import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { BreakdownsApiService } from './breakdowns-api.service';

const api = () => TestBed.inject(BreakdownsApiService);
const RANGE = { from: '2026-10-01', to: '2026-10-17' };
const forbidden = () => throwError(() => new HttpErrorResponse({ status: 403 }));
const offline = () => throwError(() => new HttpErrorResponse({ status: 0 }));

describe('BreakdownsApiService', () => {
  it('adds up net sales per item, returns taken off, largest first', async () => {
    const { listCalls } = fakeErpnext({
      'Sales Invoice': () => [
        { item: 'POT-30', item_name: 'Ceramic planter', qty: 4, amount: 280 },
        { item: 'OLIVE', item_name: 'Olive tree', qty: 3, amount: 255 },
        { item: 'POT-30', item_name: 'Ceramic planter', qty: 2, amount: 140 },
        { item: 'OLIVE', item_name: 'Olive tree', qty: -3, amount: -255 },
      ],
    });
    const result = await api().salesByItem('Rehan Nursery', RANGE);
    expect(result).toEqual({
      rows: [{ key: 'POT-30', label: 'Ceramic planter', amount: 420, qty: 6 }],
      total: 420,
    });
    expect(listCalls[0].query.orderBy).toBe('name asc, items.idx asc');
    expect(listCalls[0].query.filters).toEqual([
      ['company', '=', 'Rehan Nursery'],
      ['docstatus', '=', 1],
      ['is_opening', '!=', 'Yes'],
      ['posting_date', 'between', ['2026-10-01', '2026-10-17']],
    ]);
  });

  it('groups sales by customer and purchases by supplier in the company currency', async () => {
    const { listCalls } = fakeErpnext({
      'Sales Invoice': () => [
        { customer: 'C1', customer_name: 'Lina Haddad', 'SUM(`base_net_total`)': 300 },
        { customer: 'C2', customer_name: '', 'SUM(`base_net_total`)': 900.005 },
      ],
      'Purchase Invoice': () => [
        { supplier: 'Green Clay', supplier_name: 'Green Clay', 'SUM(`base_net_total`)': 1280 },
      ],
    });
    expect(await api().salesByCustomer('Rehan Nursery', RANGE)).toEqual({
      rows: [
        { key: 'C2', label: 'C2', amount: 900.01, qty: null },
        { key: 'C1', label: 'Lina Haddad', amount: 300, qty: null },
      ],
      total: 1200.01,
    });
    expect((await api().purchasesBySupplier('Rehan Nursery', RANGE)).total).toBe(1280);
    expect(listCalls.map((c) => c.query.groupBy)).toEqual(['customer', 'supplier']);
    expect(listCalls[0].query.fields).toContainEqual({ SUM: 'base_net_total' });
    for (const call of listCalls) {
      expect(call.query.filters).toContainEqual(['is_opening', '!=', 'Yes']);
    }
  });

  it('values stock per warehouse of the company only', async () => {
    fakeErpnext({
      Bin: () => [
        { warehouse: 'Main warehouse - RN', 'SUM(`stock_value`)': 900 },
        { warehouse: 'Other - OC', 'SUM(`stock_value`)': 5000 },
        { warehouse: 'Garden shop - RN', 'SUM(`stock_value`)': 308.5 },
      ],
      Warehouse: () => [
        { name: 'Main warehouse - RN', warehouse_name: 'Main warehouse' },
        { name: 'Garden shop - RN', warehouse_name: 'Garden shop' },
      ],
    });
    expect(await api().stockByWarehouse('Rehan Nursery')).toEqual({
      rows: [
        { key: 'Main warehouse - RN', label: 'Main warehouse', amount: 900, qty: null },
        { key: 'Garden shop - RN', label: 'Garden shop', amount: 308.5, qty: null },
      ],
      total: 1208.5,
    });
  });

  it('counts confirmed pay in the company currency and days present, half days as half', async () => {
    const { listCalls } = fakeErpnext({
      'Salary Slip': () => [{ base_net_pay: 4000 }, { base_net_pay: 3600 }],
      Attendance: () => [
        { status: 'Present' },
        { status: 'Half Day' },
        { status: 'Absent' },
        { status: 'Work From Home' },
        { status: 'On Leave' },
      ],
    });
    expect(await api().people('Rehan Nursery', RANGE)).toEqual({ net: 7600, daysPresent: 2.5 });
    expect(listCalls[0].query.fields).toEqual(['base_net_pay']);
  });

  it('leaves out pay and attendance a role may not read, but keeps other failures', async () => {
    fakeErpnext({ 'Salary Slip': forbidden, Attendance: forbidden });
    expect(await api().people('Rehan Nursery', RANGE)).toBeNull();
    TestBed.resetTestingModule();
    fakeErpnext({ 'Salary Slip': forbidden, Attendance: () => [{ status: 'Present' }] });
    expect(await api().people('Rehan Nursery', RANGE)).toEqual({ net: null, daysPresent: 1 });
    TestBed.resetTestingModule();
    fakeErpnext({ 'Salary Slip': offline, Attendance: () => [] });
    await expect(api().people('Rehan Nursery', RANGE)).rejects.toBeTruthy();
  });
});
