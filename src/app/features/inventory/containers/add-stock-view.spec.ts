import { realTranslator } from '../../../../testing/real-translator';
import { addStockSummary } from './add-stock-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');
const lines = [
  { item: 'OLV-20', name: 'Olive tree', uom: 'Unit', qty: 10, rate: 40 },
  { item: 'POT-30', name: 'Ceramic planter', uom: 'Unit', qty: 5, rate: 22.5 },
];

describe('add stock view', () => {
  it('sums up what comes in like the review mock, with costs for cost roles', () => {
    expect(visible(addStockSummary({ lines }, 'ILS', true, en))).toEqual({
      title: 'Add 2 items · 15 units',
      message:
        'Olive tree: 10 Unit × ILS 40.00\nCeramic planter: 5 Unit × ILS 22.50\nValue ILS 512.50.',
    });
    expect(visible(addStockSummary({ lines }, 'ILS', false, en)).message).toBe(
      'Olive tree: 10 Unit\nCeramic planter: 5 Unit',
    );
    expect(visible(addStockSummary({ lines: [lines[0]] }, 'ILS', true, ar)).title).toBe(
      'إضافة صنف واحد · 10 وحدة',
    );
    expect(
      visible(addStockSummary({ lines: [lines[0], { ...lines[1], rate: null }] }, 'ILS', true, en))
        .message,
    ).toContain('Value of the costed lines ILS 400.00');
  });
});
