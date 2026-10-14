import { realTranslator } from '../../../../testing/real-translator';
import {
  Movement,
  StockItem,
  TransferResult,
  WarehouseInfo,
} from '../data-access/inventory.models';
import * as view from './inventory-view';
import * as transfer from './transfer-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const MAIN: WarehouseInfo = { id: 'Main - RN', name: 'Main warehouse' };
const SHOP: WarehouseInfo = { id: 'Shop - RN', name: 'Garden shop' };
const STORES: WarehouseInfo = { id: 'Stores - RN', name: 'Stores' };
const WAREHOUSES = [MAIN, SHOP, STORES];
const OLIVE: StockItem = {
  code: 'OLV-20',
  name: 'Olive tree',
  uom: 'Unit',
  stock: { [MAIN.id]: 24, [SHOP.id]: 6 },
  low: false,
};
const TODAY = new Date(2026, 9, 14);

const movement = (
  voucherType: string,
  lines: { warehouse: string; qty: number; after?: number }[],
  postingDate = '2026-10-14',
): Movement => ({
  voucherType,
  voucher: 'V-1',
  postingDate,
  postingTime: '09:41:00',
  lines: lines.map((line) => ({ after: 0, ...line })),
});

const entry = (m: Movement, tr = en) =>
  visible(view.movementEntry(m, OLIVE, WAREHOUSES, TODAY, tr === en ? 'en' : 'ar', tr));

describe('inventory view', () => {
  it('shows quantities with the unit', () => {
    expect(visible(view.qtyText(24, 'Unit', en))).toBe('24 Unit');
    expect(visible(view.qtyText(1.25, 'Kg', en))).toBe('1.25 Kg');
  });

  it('tells available, low and out-of-stock items apart', () => {
    expect(view.stockStatus(OLIVE)).toBe('available');
    expect(view.stockStatus({ ...OLIVE, low: true })).toBe('low');
    expect(view.stockStatus({ ...OLIVE, stock: { [MAIN.id]: 0 } })).toBe('out');
  });

  it('describes a warehouse balance card', () => {
    expect(visible(view.warehouseCard(OLIVE, MAIN, en))).toEqual({
      title: 'Main warehouse',
      meta: 'OLV-20',
      detail: '24 Unit available · current stock',
      kind: 'product',
    });
    expect(visible(view.warehouseCard(OLIVE, STORES, ar)).detail).toBe(
      'المتاح 0 Unit · الرصيد الحالي',
    );
  });

  it('builds a desktop row with a quantity per warehouse column and a status', () => {
    expect(visible(view.itemRow({ ...OLIVE, low: true }, [MAIN, SHOP], en))).toEqual({
      id: 'OLV-20',
      cells: ['Olive tree · OLV-20', '24 Unit', '6 Unit', 'Low stock'],
    });
    expect(visible(view.itemRow(OLIVE, [MAIN], ar)).cells[2]).toBe('متاح');
  });

  it('shows columns only for warehouses holding stock, and at least one', () => {
    expect(view.stockedWarehouses([OLIVE], WAREHOUSES)).toEqual([MAIN, SHOP]);
    expect(view.stockedWarehouses([], WAREHOUSES)).toEqual([MAIN]);
  });

  describe('movement history', () => {
    it('reads a transfer as a move between two locations', () => {
      const moved = movement('Stock Entry', [
        { warehouse: MAIN.id, qty: -2 },
        { warehouse: SHOP.id, qty: 2 },
      ]);
      expect(entry(moved)).toEqual({
        title: 'Moved 2 Unit Olive tree',
        meta: 'Today · Main warehouse to Garden shop',
      });
      expect(entry(moved, ar)).toEqual({
        title: 'نقل 2 Unit Olive tree',
        meta: 'اليوم · من Main warehouse إلى Garden shop',
      });
      expect(visible(view.movementRow(moved, OLIVE, WAREHOUSES, en))).toEqual({
        id: 'V-1',
        cells: ['Moved', '2 Unit Main warehouse → Garden shop', 'Garden shop'],
      });
    });

    it('names receipts, sales, returns and stock entries in and out', () => {
      const title = (type: string, qty: number) =>
        entry(movement(type, [{ warehouse: MAIN.id, qty }])).title;
      expect(title('Purchase Receipt', 4)).toBe('Received 4 Unit Olive tree');
      expect(title('Purchase Receipt', -1)).toBe('Returned 1 Unit Olive tree');
      expect(title('Sales Invoice', -2)).toBe('Sold 2 Unit Olive tree');
      expect(title('Delivery Note', 1)).toBe('Returned 1 Unit Olive tree');
      expect(title('Stock Entry', 30)).toBe('Added 30 Unit Olive tree');
      expect(title('Stock Entry', -3)).toBe('Issued 3 Unit Olive tree');
    });

    it('shows a stock count as the counted balance, since ERPNext records its change as 0', () => {
      const count = movement('Stock Reconciliation', [{ warehouse: MAIN.id, qty: 0, after: 20 }]);
      expect(entry(count).title).toBe('Stock count: 20 Unit');
      expect(visible(view.movementRow(count, OLIVE, WAREHOUSES, en)).cells[1]).toBe(
        '20 Unit counted',
      );

      // A batch item's count: lines newest first, each with the warehouse's running balance.
      const batches = movement('Stock Reconciliation', [
        { warehouse: MAIN.id, qty: 7, after: 12 },
        { warehouse: MAIN.id, qty: -6, after: 5 },
        { warehouse: MAIN.id, qty: 5, after: 11 },
        { warehouse: MAIN.id, qty: -4, after: 6 },
      ]);
      expect(entry(batches).title).toBe('Stock count: 12 Unit');
    });

    it('shows unknown vouchers with a signed quantity', () => {
      expect(entry(movement('Asset Capitalization', [{ warehouse: MAIN.id, qty: -1 }])).title).toBe(
        'Asset Capitalization -1',
      );
    });

    it('says today, yesterday, or the date, and lists every location touched', () => {
      const meta = (date: string) =>
        entry(
          movement(
            'Stock Entry',
            [
              { warehouse: MAIN.id, qty: 24 },
              { warehouse: SHOP.id, qty: 6 },
            ],
            date,
          ),
        ).meta;
      expect(meta('2026-10-14')).toBe('Today · Main warehouse, Garden shop · V-1');
      expect(meta('2026-10-13')).toBe('Yesterday · Main warehouse, Garden shop · V-1');
      expect(meta('2026-10-09')).toBe('9 Oct 2026 · Main warehouse, Garden shop · V-1');
      expect(
        entry(movement('Sales Invoice', [{ warehouse: MAIN.id, qty: -1 }], '2026-10-13'), ar).meta,
      ).toBe('أمس · Main warehouse · V-1');
    });

    it('builds desktop rows with direction for single-location movements', () => {
      const sold = movement('Sales Invoice', [{ warehouse: MAIN.id, qty: -2 }]);
      expect(visible(view.movementRow(sold, OLIVE, WAREHOUSES, en)).cells).toEqual([
        'Sold',
        '2 Unit out',
        'Main warehouse',
      ]);
      expect(visible(view.movementRow(sold, OLIVE, WAREHOUSES, ar)).cells).toEqual([
        'بيع',
        'صادر 2 Unit',
        'Main warehouse',
      ]);
      const other = movement('Asset Capitalization', [{ warehouse: STORES.id, qty: 1 }]);
      expect(visible(view.movementRow(other, OLIVE, WAREHOUSES, en)).cells).toEqual([
        'Asset Capitalization',
        '1 Unit in',
        'Stores',
      ]);
    });
  });
});

describe('transfer view', () => {
  it('labels source and destination options with their balances', () => {
    expect(visible(transfer.locationOptions(OLIVE, [MAIN, SHOP], 'from', en))).toEqual([
      { value: MAIN.id, label: 'Main warehouse · 24 available' },
      { value: SHOP.id, label: 'Garden shop · 6 available' },
    ]);
    expect(visible(transfer.locationOptions(OLIVE, [SHOP], 'to', en))).toEqual([
      { value: SHOP.id, label: 'Garden shop · 6 on hand' },
    ]);
    expect(visible(transfer.locationOptions(OLIVE, [SHOP], 'to', ar))[0].label).toBe(
      'Garden shop · المتوفر 6',
    );
    expect(transfer.locationOptions(null, [MAIN], 'from', en)).toEqual([
      { value: MAIN.id, label: 'Main warehouse' },
    ]);
  });

  it('shows both balances before and after, with the company total unchanged', () => {
    expect(visible(transfer.reviewCard(OLIVE, MAIN, SHOP, 2, en))).toEqual({
      heading: '2 Unit · Main warehouse to Garden shop',
      rows: [
        { label: 'Main warehouse', value: '24 → 22' },
        { label: 'Garden shop', value: '6 → 8' },
        { label: 'Company total', value: '30 → 30', accent: true },
      ],
    });
    expect(visible(transfer.reviewCard(OLIVE, MAIN, STORES, 1, ar))).toEqual({
      heading: '1 Unit · من Main warehouse إلى Stores',
      rows: [
        { label: 'Main warehouse', value: '24 → 23' },
        { label: 'Stores', value: '0 → 1' },
        { label: 'إجمالي الشركة', value: '30 → 30', accent: true },
      ],
    });
  });

  it('reports the balances ERPNext returned after the move', () => {
    const result: TransferResult = {
      entry: 'MAT-STE-1',
      postingDate: '2026-10-11',
      postingTime: '09:41:07.123',
      fromQty: 22,
      toQty: 8,
      totalQty: 30,
    };
    expect(
      visible(transfer.doneRows(result, OLIVE, 'Main warehouse', 'Garden shop', 'en', en)),
    ).toEqual([
      { label: 'From · Main warehouse', value: '22 Unit' },
      { label: 'To · Garden shop', value: '8 Unit' },
      { label: 'Company total', value: '30 Unit', accent: true },
      { label: 'Posted', value: '11 Oct 2026 · 09:41' },
    ]);
    expect(
      visible(transfer.doneRows(result, OLIVE, 'Main warehouse', 'Garden shop', 'ar', ar))[3],
    ).toEqual({ label: 'مرحّل', value: '11 أكتوبر 2026 · 09:41' });
  });

  it("shows a dash for balances that couldn't be read, and pads unpadded times", () => {
    const result: TransferResult = {
      entry: 'MAT-STE-1',
      postingDate: '2026-10-11',
      postingTime: '3:7:2.52915',
      fromQty: null,
      toQty: null,
      totalQty: null,
    };
    const rows = visible(transfer.doneRows(result, OLIVE, 'Main', 'Shop', 'en', en));
    expect(rows.slice(0, 3).map((r) => r.value)).toEqual(['—', '—', '—']);
    expect(rows[3].value).toBe('11 Oct 2026 · 03:07');
    expect(transfer.clockTime('14:05:59')).toBe('14:05');
  });
});
