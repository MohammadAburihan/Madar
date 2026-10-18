import { realTranslator } from '../../../../testing/real-translator';
import { AdjustResult, StockItem } from '../data-access/inventory.models';
import { doneMessage, effectCard, reviewCard, writeOffRows } from './adjust-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');
const MAIN = { id: 'Main - RN', name: 'Main warehouse' };
const SHOP = { id: 'Shop - RN', name: 'Garden shop' };
const OLIVE: StockItem = {
  code: 'OLV-20',
  name: 'Olive tree',
  uom: 'trees',
  stock: { [MAIN.id]: 22, [SHOP.id]: 8 },
  low: false,
};

describe('adjust view', () => {
  it('says what a count changes, as on the stock count mock', () => {
    expect(visible(effectCard('count', OLIVE, MAIN, -2, en))).toEqual({
      tone: 'warning',
      title: 'Company stock will fall by 2',
      message: 'Main warehouse changes from 22 to 20. Company total changes from 30 to 28.',
    });
    expect(visible(effectCard('count', OLIVE, MAIN, 0, en)).title).toBe('Matches the system');
    expect(visible(effectCard('count', OLIVE, MAIN, 3, ar)).title).toBe(
      'سيرتفع مخزون الشركة بمقدار 3',
    );
  });

  it('reviews a count and a write-off like the mocks', () => {
    expect(
      visible(reviewCard('count', OLIVE, MAIN, 20, -2, 'damaged', 'physical count', en)),
    ).toEqual({
      title: 'Count variance −2',
      message:
        'System 22, counted 20. Main warehouse 22 → 20. Company total 30 → 28. Reason: physical count.',
    });
    expect(visible(reviewCard('damage', OLIVE, SHOP, 1, -1, 'damaged', 'Broken stem', en))).toEqual(
      {
        title: 'Write off 1 trees · Damaged',
        message: 'Broken stem. Garden shop 8 → 7. Company total 30 → 29.',
      },
    );
  });

  it('shows the write-off before and after', () => {
    expect(visible(writeOffRows(OLIVE, SHOP, -1, en))).toEqual([
      { label: 'Garden shop', value: '8 → 7 trees' },
      { label: 'Company total', value: '30 → 29 trees', accent: true },
    ]);
  });

  it('reports the balances after posting, or that they could not be read', () => {
    const result: AdjustResult = {
      entry: 'MAT-STE-9',
      postingDate: '2026-10-18',
      postingTime: '10:00:00',
      warehouseQty: 20,
      totalQty: 28,
    };
    expect(visible(doneMessage('count', result, 'Main warehouse', OLIVE, en))).toBe(
      'Main warehouse now holds 20 trees of Olive tree. Company total 28. This adjustment is separate from damage.',
    );
    expect(doneMessage('damage', { ...result, warehouseQty: null }, 'Garden shop', OLIVE, en)).toBe(
      "Posted. The new balances couldn't be read; open the stock to see them.",
    );
  });
});
