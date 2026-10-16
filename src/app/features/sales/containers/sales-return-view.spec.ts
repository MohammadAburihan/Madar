import { realTranslator } from '../../../../testing/real-translator';
import { ReturnSource } from '../data-access/sales-return.models';
import { returnDone, returnHeading, returnLineCard, returnSummary } from './sales-return-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const TREE = {
  row: 'tree',
  code: 'OLV-20',
  name: 'Olive tree · 20 L',
  uom: 'Unit',
  sold: 2,
  returnable: 2,
  rate: 85,
  warehouse: 'main',
  isStock: true,
};
const SOURCE: ReturnSource = {
  invoice: 'SI-1042',
  customerName: 'Lina Haddad',
  movesStock: true,
  total: 320,
  outstanding: 200,
  paid: 120,
  lines: [TREE],
};

describe('sales return view', () => {
  it('heads the return and shows each line as on the linked-return mock', () => {
    expect(visible(returnHeading(SOURCE, en))).toEqual({
      title: 'Return from sale',
      subtitle: 'Original invoice SI-1042 · Lina Haddad',
    });
    expect(visible(returnLineCard(TREE, 1, 'ILS', en))).toEqual({
      title: 'Olive tree · 20 L',
      meta: 'Sold 2 · Returned 0',
      detail: 'Return 1 × ILS 85.00',
    });
    expect(visible(returnLineCard(TREE, 1, 'ILS', ar).meta)).toBe('تم بيع 2 · تم إرجاع 0');
  });

  it('sums the return up: the credit, the payment that stays, and the new balance', () => {
    expect(visible(returnSummary(SOURCE, [TREE], { tree: 1 }, 'ILS', en))).toBe(
      'Credit ILS 85.00 and return 1 × Olive tree · 20 L to stock. Original payment stays ILS 120.00. ' +
        'New outstanding balance: ILS 115.00.',
    );
    expect(
      visible(returnSummary({ ...SOURCE, outstanding: 0 }, [TREE], { tree: 1 }, 'ILS', en)),
    ).toContain("stays on the customer's account");
  });

  it('reports the posted credit and how much less is due', () => {
    const sent = {
      reference: 'RET-1',
      invoice: 'SI-1042',
      currency: 'ILS',
      warehouse: 'main',
      reason: '',
      lines: [{ row: 'tree', qty: 1 }],
    };
    expect(
      visible(
        returnDone(
          SOURCE,
          sent,
          { name: 'SI-1050', credit: 85, dueAfter: 115 },
          'Main warehouse',
          'ILS',
          en,
        ),
      ),
    ).toEqual({
      title: 'Sales return posted',
      subtitle: 'SI-1042 · Lina Haddad',
      cardTitle: 'Credit posted · ILS 85.00',
      cardMessage:
        '1 × Olive tree · 20 L returned to Main warehouse. Original paid 120.00. Due reduced 200.00 → 115.00. ' +
        'No cash refund.',
    });
  });
});
