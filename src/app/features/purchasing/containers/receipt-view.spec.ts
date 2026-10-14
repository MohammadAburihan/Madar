import { realTranslator } from '../../../../testing/real-translator';
import { OrderDetail, OrderLineDetail } from '../data-access/purchase.models';
import * as view from './receipt-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const LINE: OrderLineDetail = {
  row: 'row-1',
  code: 'POT-30',
  name: 'Ceramic planter · 30 cm',
  uom: 'each',
  qty: 10,
  receivedQty: 0,
  rate: 45,
  amount: 450,
  warehouse: 'Main warehouse - RN',
};

const ORDER: OrderDetail = {
  name: 'PO-2048',
  supplier: 'Green Clay',
  supplierName: 'Green Clay',
  date: '2026-10-11',
  total: 450,
  progress: 'awaitingReceipt',
  orderedQty: 10,
  receivedQty: 0,
  lines: [LINE],
};

const RECEIVED_6: OrderDetail = {
  ...ORDER,
  progress: 'partlyReceived',
  receivedQty: 6,
  lines: [{ ...LINE, receivedQty: 6 }],
};

describe('receipt view', () => {
  it('describes a first, partial receipt like the receive-items mock', () => {
    const qty = { 'row-1': 6 };
    expect(visible(view.receiveHeading(ORDER, en))).toEqual({
      title: 'Receive items',
      subtitle: 'PO-2048 · Green Clay',
    });
    expect(visible(view.receiveLineCard(LINE, 'ILS', en))).toMatchObject({
      title: 'Ceramic planter · 30 cm',
      meta: 'POT-30 · each',
      detail: 'Ordered 10 · ILS 45.00 each',
    });
    expect(view.qtyLabel(LINE, false, 1, en)).toBe('Received now *');
    expect(visible(view.receiveStats([LINE], qty, en))).toEqual([
      { label: 'Received now', value: '6' },
      { label: 'Still remaining', value: '4' },
    ]);
    expect(visible(view.receiveRows([LINE], qty, 'ILS'))).toEqual([
      { label: '6 × ILS 45.00', value: 'ILS 270.00', accent: true },
    ]);
    expect(view.partialDelivery([LINE], qty)).toBe(true);
    expect(visible(view.stockNote([LINE], qty, en))).toBe(
      'Only 6 units enter stock. 4 units stay open on the order.',
    );
    expect(visible(view.recordLabel([LINE], qty, en))).toBe('Record 6 units received');
  });

  it('uses the Arabic wording and plurals of the mock', () => {
    const qty = { 'row-1': 6 };
    expect(visible(view.receiveHeading(ORDER, ar).title)).toBe('استلام الأصناف');
    expect(visible(view.recordLabel([LINE], qty, ar))).toBe('تسجيل استلام 6 وحدات');
    expect(visible(view.recordLabel([LINE], { 'row-1': 1 }, ar))).toBe('تسجيل استلام وحدة واحدة');
    expect(visible(view.receiveStats([LINE], qty, ar)).map((s) => s.label)).toEqual([
      'المستلم الآن',
      'ما زال متبقياً',
    ]);
  });

  it('names each quantity field by its item code when the order has several lines', () => {
    expect(visible(view.qtyLabel(LINE, false, 2, en))).toBe('POT-30 · received now *');
    expect(visible(view.qtyLabel(LINE, true, 1, en))).toBe('POT-30 · remaining quantity *');
  });

  it('describes receiving the remainder like the remaining-items mock', () => {
    const line = RECEIVED_6.lines[0];
    const qty = { 'row-1': 4 };
    expect(visible(view.receiveHeading(RECEIVED_6, en))).toEqual({
      title: 'Receive remaining items',
      subtitle: 'PO-2048 · Green Clay',
    });
    expect(visible(view.reviewMessage(RECEIVED_6, [line], qty, en))).toBe(
      'Previously received 6. Receiving 4 completes 10 of 10. Invoice and payment remain unchanged.',
    );
    expect(visible(view.reviewMessage(RECEIVED_6, [line], { 'row-1': 2 }, en))).toBe(
      'Previously received 6. Receiving 2 brings it to 8 of 10. Invoice and payment remain unchanged.',
    );
    expect(visible(view.confirmLabel([line], qty, en))).toBe('Confirm receipt of 4');
    expect(visible(view.confirmLabel([line], qty, ar))).toBe('تأكيد استلام 4');
    expect(view.partialDelivery([line], qty)).toBe(false);
    expect(visible(view.stockNote([line], qty, en))).toBe(
      '4 units enter stock. Nothing stays open on the order.',
    );
  });

  it('reports a partial receipt like the receipt-recorded mock', () => {
    const sent = {
      reference: 'REC-1',
      order: 'PO-2048',
      warehouse: 'x',
      lines: [{ row: 'row-1', qty: 6 }],
    };
    expect(visible(view.receiptDone(ORDER, sent, 'Main warehouse', en))).toEqual({
      full: false,
      title: 'Receipt recorded',
      subtitle: 'PO-2048 · Main warehouse',
      cardTitle: 'Partially received · 6 of 10',
      cardMessage: '6 units received. 4 remain. No invoice or payment created.',
    });
    expect(visible(view.receiptDone(ORDER, sent, 'المستودع الرئيسي', ar).cardTitle)).toBe(
      'مستلم جزئياً · 6 من 10',
    );
  });

  it('reports the receipt that completes the order like the fully-received mock', () => {
    const sent = {
      reference: 'REC-1',
      order: 'PO-2048',
      warehouse: 'x',
      lines: [{ row: 'row-1', qty: 4 }],
    };
    expect(visible(view.receiptDone(RECEIVED_6, sent, 'Main warehouse', en))).toEqual({
      full: true,
      title: 'Fully received',
      subtitle: 'PO-2048 · Receipt posted',
      cardTitle: '10 of 10 received',
      cardMessage: '4 units received into Main warehouse. No invoice or payment created.',
    });
  });

  it('offers receiving on the order page only while goods are still due', () => {
    expect(view.receiveAction(ORDER, en)).toBe('Receive items');
    expect(visible(view.receiveAction(RECEIVED_6, en))).toBe('Receive remaining 4');
    expect(visible(view.receiveAction(RECEIVED_6, ar))).toBe('استلام 4 المتبقية');
    expect(view.receiveAction({ ...ORDER, progress: 'awaitingInvoice' }, en)).toBeNull();
    expect(view.receiveAction({ ...ORDER, progress: 'draft' }, en)).toBeNull();
    expect(view.receiveAction({ ...ORDER, progress: 'closed' }, en)).toBeNull();
    expect(view.receiveAction({ ...ORDER, progress: 'onHold' }, en)).toBeNull();
    expect(view.receiveAction({ ...ORDER, progress: 'cancelled' }, en)).toBeNull();
  });

  it('shows an order line after receipt like the received-order mock', () => {
    expect(visible(view.receivedLineCard(RECEIVED_6.lines[0], en))).toMatchObject({
      meta: 'POT-30 · 10 ordered · 6 received',
      detail: '4 remain to receive',
    });
    expect(visible(view.receivedLineCard({ ...LINE, receivedQty: 10 }, en)).detail).toBe(
      'All received',
    );
  });
});
