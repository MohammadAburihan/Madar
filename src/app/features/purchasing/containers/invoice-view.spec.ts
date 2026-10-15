import { realTranslator } from '../../../../testing/real-translator';
import {
  InvoicePreview,
  OrderDetail,
  OrderLineDetail,
  SupplierInvoice,
} from '../data-access/purchase.models';
import * as view from './invoice-view';
import { receivedLineCard } from './receipt-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const LINE: OrderLineDetail = {
  row: 'row-1',
  code: 'POT-30',
  name: 'Ceramic planter · 30 cm',
  uom: 'each',
  qty: 10,
  receivedQty: 6,
  rate: 45,
  amount: 450,
  billedAmount: 0,
  warehouse: 'Main warehouse - RN',
};

const ORDER: OrderDetail = {
  name: 'PO-2048',
  supplier: 'Green Clay',
  supplierName: 'Green Clay',
  date: '2026-10-11',
  currency: 'ILS',
  total: 450,
  progress: 'partlyReceived',
  orderedQty: 10,
  receivedQty: 6,
  lines: [LINE],
};

const PREVIEW: InvoicePreview = {
  receipts: ['MAT-PRE-1', 'MAT-PRE-2'],
  lines: [
    { code: 'POT-30', name: 'Ceramic planter · 30 cm', uom: 'each', qty: 4, rate: 45 },
    { code: 'POT-30', name: 'Ceramic planter · 30 cm', uom: 'each', qty: 2, rate: 45 },
  ],
  currency: 'ILS',
  total: 270,
  blocked: null,
};

const INVOICE: SupplierInvoice = {
  name: 'PINV-0068',
  billNo: 'GC-8831',
  supplier: 'Green Clay',
  supplierName: 'Green Clay',
  order: 'PO-2048',
  currency: 'ILS',
  total: 270,
  outstanding: 270,
  submitted: true,
  cancelled: false,
  payments: [],
};

describe('invoice view', () => {
  it('describes the supplier invoice form like its mock', () => {
    expect(visible(view.invoiceFormHeading(ORDER, en))).toEqual({
      title: 'Supplier invoice',
      subtitle: 'PO-2048 · Green Clay · Record invoice',
    });
    expect(visible(view.billingChip(PREVIEW, en))).toBe('6 units received');
    expect(visible(view.billingChip(PREVIEW, ar))).toBe('مستلم 6 وحدات');
    expect(visible(view.billingCards(PREVIEW, en))).toEqual([
      {
        title: 'Ceramic planter · 30 cm',
        meta: 'POT-30 · each',
        detail: 'Received 6 × ILS 45.00 each',
        kind: 'product',
      },
    ]);
    expect(visible(view.invoiceTotals(270, 270, 'ILS', en))).toEqual([
      { label: 'Invoice total', value: 'ILS 270.00' },
      { label: 'Amount paid', value: 'ILS 0.00' },
      { label: 'Outstanding', value: 'ILS 270.00', accent: true },
    ]);
  });

  it('describes a just-recorded invoice like the invoice-recorded mock', () => {
    expect(visible(view.invoiceView(INVOICE, ORDER, true, en))).toEqual({
      title: 'Supplier invoice recorded',
      subtitle: 'PINV-0068 · Supplier ref GC-8831',
      chips: [
        { label: 'Invoice: Confirmed', tone: 'tint' },
        { label: 'Payment: Unpaid', tone: 'warning' },
        { label: 'Order: 6 of 10 received', tone: 'warning' },
      ],
      totals: view.invoiceTotals(270, 270, 'ILS', en).map(visible),
      payments: [],
    });
  });

  it('describes a partly paid invoice with its payment like the confirmed-invoice mock', () => {
    const paid = {
      ...INVOICE,
      outstanding: 170,
      payments: [{ name: 'PAY-0155', amount: 100, account: 'Main bank' }],
    };
    const v = visible(view.invoiceView(paid, ORDER, false, en));
    expect([v.title, v.subtitle]).toEqual([
      'Supplier invoice PINV-0068',
      'Green Clay · Supplier ref GC-8831',
    ]);
    expect(v.chips[1]).toEqual({ label: 'Payment: Partially paid', tone: 'warning' });
    expect(v.payments).toEqual([
      {
        title: 'Linked payment PAY-0155',
        message: 'ILS 100.00 paid from Main bank. This invoice is already recorded.',
      },
    ]);
    const arabic = visible(view.invoiceView(paid, ORDER, false, ar));
    expect(arabic.chips.map((c) => c.label)).toEqual([
      'الفاتورة: مؤكدة',
      'الدفعة: مدفوعة جزئياً',
      'الطلب: استُلم 6 من 10',
    ]);
  });

  it('leaves the order chip out when the order could not be read', () => {
    expect(view.invoiceView(INVOICE, null, false, en).chips).toHaveLength(2);
  });

  it('offers recording an invoice only while received goods are unbilled', () => {
    expect(view.hasUnbilled(ORDER)).toBe(true);
    expect(view.hasUnbilled({ ...ORDER, lines: [{ ...LINE, billedAmount: 270 }] })).toBe(false);
    expect(view.hasUnbilled({ ...ORDER, lines: [{ ...LINE, receivedQty: 0 }] })).toBe(false);
    // A line billed above its value doesn't hide another line's unbilled goods.
    const overBilled = { ...LINE, row: 'row-2', billedAmount: 400 };
    expect(view.hasUnbilled({ ...ORDER, lines: [LINE, overBilled] })).toBe(true);
  });

  it("shows the order's billing like the received-order mock", () => {
    const invoices = [
      { name: 'PINV-0068', billNo: 'GC-8831', currency: 'ILS', total: 270, outstanding: 170 },
    ];
    const billedOrder = { ...ORDER, lines: [{ ...LINE, billedAmount: 270 }] };
    expect(visible(view.orderBillingRows(billedOrder, invoices, en))).toEqual([
      { label: 'Order value', value: 'ILS 450.00' },
      { label: 'Billed', value: 'ILS 270.00' },
      { label: 'Invoice paid', value: 'ILS 100.00' },
      { label: 'Invoice outstanding', value: 'ILS 170.00' },
    ]);
    // An invoice made in Desk for two orders: "Billed" stays this order's share.
    const shared = [{ ...invoices[0], total: 900, outstanding: 900 }];
    expect(visible(view.orderBillingRows(billedOrder, shared, en))[1].value).toBe('ILS 270.00');
    expect(visible(receivedLineCard({ ...LINE, billedAmount: 270 }, en).detail)).toBe(
      '6 billed · 4 remain to receive',
    );
    expect(visible(view.orderInvoiceCard(invoices[0], en))).toMatchObject({
      title: 'PINV-0068 · GC-8831',
      meta: 'Payment: Partially paid',
      detail: 'ILS 270.00 · ILS 170.00 outstanding',
    });
  });

  it('sums the selected order’s invoices for the workspace panel', () => {
    expect(view.panelInvoiceRows([], en)).toEqual([]);
    const rows = visible(
      view.panelInvoiceRows(
        [
          { name: 'A', billNo: null, currency: 'ILS', total: 270, outstanding: 170 },
          { name: 'B', billNo: null, currency: 'ILS', total: 180, outstanding: 180 },
        ],
        en,
      ),
    );
    expect(rows.map((r) => r.value)).toEqual(['ILS 450.00', 'ILS 100.00', 'ILS 350.00']);
  });
});
