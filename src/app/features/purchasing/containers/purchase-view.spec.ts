import { realTranslator } from '../../../../testing/real-translator';
import { OrderDetail, OrderLine, OrderSummary } from '../data-access/purchase.models';
import * as view from './purchase-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const ORDER: OrderSummary = {
  name: 'PO-2048',
  supplier: 'Green Clay',
  supplierName: 'Green Clay',
  date: '2026-10-11',
  total: 450,
  progress: 'partlyReceived',
  orderedQty: 10,
  receivedQty: 6,
};

const PLANTER = {
  code: 'POT-30',
  name: 'Ceramic planter · 30 cm',
  uom: 'each',
  kind: 'product' as const,
  rate: 45,
};
const LINE: OrderLine = { item: PLANTER, qty: 10, rate: 45 };

describe('purchase view', () => {
  it('forgets what was typed for a price once its line is off the order', () => {
    expect(view.keptRateInputs({ 'POT-30': '50', SOIL: '12.' }, [LINE])).toEqual({
      'POT-30': '50',
    });
  });

  it('describes where an order stands, as in the workspace mock', () => {
    expect(visible(view.progressText(ORDER, en))).toBe('6 received · 4 open');
    expect(visible(view.progressText({ ...ORDER, progress: 'awaitingReceipt' }, en))).toBe(
      'Awaiting receipt',
    );
    expect(visible(view.progressText({ ...ORDER, progress: 'complete' }, en))).toBe(
      'Fully received',
    );
    expect(visible(view.progressText(ORDER, ar))).toBe('تم استلام 6 · متبقٍّ 4');
    expect(view.progressChip('partlyReceived', en)).toEqual({
      label: 'Partially received',
      tone: 'warning',
    });
    expect(view.progressChip('awaitingReceipt', ar).label).toBe('مؤكد');
  });

  it('builds a workspace row and its key figures', () => {
    expect(visible(view.orderRow(ORDER, 'ILS', 'en', en))).toEqual({
      id: 'PO-2048',
      cells: ['PO-2048 · Green Clay', '11 Oct 2026', '6 received · 4 open', 'ILS 450.00'],
    });
    const orders = [
      ORDER,
      { ...ORDER, name: 'PO-1', progress: 'awaitingReceipt' as const },
      { ...ORDER, name: 'PO-2', progress: 'awaitingInvoice' as const },
      { ...ORDER, name: 'PO-3', progress: 'complete' as const },
      { ...ORDER, name: 'PO-4', progress: 'draft' as const },
    ];
    expect(
      visible(
        view.workspaceStats(
          { orders, openOrders: 3, awaitingReceipt: 2, supplierBalance: 170 },
          'ILS',
          en,
        ),
      ),
    ).toEqual([
      { label: 'Open orders', value: '3' },
      { label: 'Awaiting receipt', value: '2' },
      { label: 'Supplier balance', value: 'ILS 170.00' },
    ]);
    expect(
      view.workspaceStats(
        { orders, openOrders: 3, awaitingReceipt: 2, supplierBalance: null },
        'ILS',
        en,
      ),
    ).toHaveLength(2);
  });

  it('summarises the selected order in the side panel', () => {
    expect(visible(view.orderPanel(ORDER, 'ILS', en))).toEqual([
      { label: 'Purchase order total', value: 'ILS 450.00' },
      { label: 'Received', value: '6 of 10 units · 4 open' },
    ]);
  });

  it('shows an item result and the order lines like the create-order mock', () => {
    expect(visible(view.itemResult(PLANTER, 'ILS', en))).toEqual({
      title: 'Ceramic planter · 30 cm',
      meta: 'POT-30 · Product · each',
      detail: 'ILS 45.00 each',
      kind: 'product',
    });
    expect(view.lineRows([LINE], 'ILS')).toEqual([
      { label: '10 × ILS 45.00', value: 'ILS 450.00', accent: true },
    ]);
  });

  it('says what confirming creates, and what it does not', () => {
    expect(visible(view.reviewCard(LINE, 'ILS', en))).toMatchObject({
      meta: 'POT-30 · 10 × ILS 45.00',
      detail: 'Order value ILS 450.00',
    });
    expect(visible(view.beforeMessage([LINE], 'ILS', en))).toBe(
      'Creates a purchase order for 10 × Ceramic planter · 30 cm, worth ILS 450.00. No stock receipt, supplier invoice or payment is recorded.',
    );
    expect(visible(view.beforeMessage([LINE, LINE], 'ILS', ar))).toContain('صنفين');
  });

  it('shows ordered, received and remaining on the order page', () => {
    const detail: OrderDetail = {
      ...ORDER,
      progress: 'awaitingReceipt',
      receivedQty: 0,
      lines: [
        {
          code: 'POT-30',
          name: 'Ceramic planter',
          uom: 'Unit',
          qty: 10,
          receivedQty: 0,
          rate: 45,
          amount: 450,
        },
      ],
    };
    expect(visible(view.detailStats(detail, en))).toEqual([
      { label: 'Ordered', value: '10' },
      { label: 'Received', value: '0' },
      { label: 'Remaining', value: '10' },
    ]);
    expect(visible(view.detailLineCard(detail.lines[0], 'ILS', en)).detail).toBe(
      'Ordered 10 · ILS 45.00 each',
    );
  });
});
