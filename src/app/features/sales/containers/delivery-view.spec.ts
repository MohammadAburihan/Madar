import { realTranslator } from '../../../../testing/real-translator';
import { SalesOrderDetail } from '../data-access/sales-order.models';
import {
  deliveryDone,
  deliveryLineCard,
  deliveryQtyError,
  deliveryQtyLabel,
  deliveryReview,
} from './delivery-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const TREE = {
  row: 'tree',
  code: 'OLV-20',
  name: 'Olive tree · 20 L',
  uom: 'Unit',
  qty: 2,
  deliveredQty: 0,
  conversionFactor: 1,
  bySupplier: false,
  rate: 85,
  amount: 170,
  isStock: true,
};
const VISIT = {
  ...TREE,
  row: 'visit',
  code: 'SRV-GARDEN',
  name: 'Garden consultation',
  qty: 1,
  isStock: false,
};
const ORDER: SalesOrderDetail = {
  name: 'SO-0187',
  customer: 'Lina Haddad',
  customerName: 'Lina Haddad',
  docstatus: 1,
  status: 'To Deliver and Bill',
  deliveryStatus: 'Not Delivered',
  billingStatus: 'Not Billed',
  date: '2026-10-11',
  deliveryDate: '2026-10-13',
  quotation: null,
  total: 320,
  lines: [TREE, VISIT],
};

describe('delivery view', () => {
  it('shows each goods line as on the delivery mock', () => {
    expect(visible(deliveryLineCard(TREE, 24, 2, en))).toEqual({
      title: 'Olive tree · 20 L',
      meta: 'Ordered 2 · Previously delivered 0',
      detail: 'Available 24 · Deliver now 2',
    });
    expect(visible(deliveryLineCard(TREE, 24, 2, ar).meta)).toBe('المطلوب 2 · سبق تسليم 0');
    expect(visible(deliveryLineCard(VISIT, null, 0, en).detail)).toBe('Done now 0');
  });

  it('labels the quantity fields and explains what is wrong with one', () => {
    expect(deliveryQtyLabel(TREE, 1, en)).toBe('Quantity to deliver');
    expect(visible(deliveryQtyLabel(TREE, 2, en))).toBe('Quantity to deliver · OLV-20');
    expect(visible(deliveryQtyLabel(VISIT, 1, en))).toBe('Work done now · SRV-GARDEN');
    expect(visible(deliveryQtyError('noStock', TREE, 1, 'Garden shop', en))).toBe(
      'Only 1 in Garden shop.',
    );
    expect(visible(deliveryQtyError('tooMany', TREE, 24, 'Main', en))).toBe(
      'Enter a quantity from 0 to 2.',
    );
    expect(deliveryQtyError(null, TREE, 24, 'Main', en)).toBeNull();
  });

  it('says what the delivery does before it is confirmed', () => {
    expect(
      visible(deliveryReview([TREE, VISIT], { tree: 2, visit: 1 }, 'Main warehouse', en)),
    ).toBe(
      'Deliver 2 × Olive tree · 20 L from Main warehouse. Mark 1 × Garden consultation as done. ' +
        'This creates a delivery record; it does not record payment.',
    );
  });

  it('counts the whole order after the delivery', () => {
    const sent = {
      reference: 'DEL-1',
      order: 'SO-0187',
      warehouse: 'main',
      lines: [{ row: 'tree', qty: 2 }],
    };
    expect(visible(deliveryDone(ORDER, sent, 'Main warehouse', en))).toMatchObject({
      title: 'Delivery confirmed',
      subtitle: 'SO-0187 · Lina Haddad',
      cardTitle: 'Partly delivered · 2 of 3',
      cardMessage: 'Main warehouse delivery posted. Invoicing and payment remain separate.',
    });
    const all = { ...sent, lines: [...sent.lines, { row: 'visit', qty: 1 }] };
    expect(visible(deliveryDone(ORDER, all, 'Main', ar).cardTitle)).toBe('تم التسليم · 3 من 3');
  });
});
