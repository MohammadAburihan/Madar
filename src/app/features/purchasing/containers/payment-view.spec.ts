import { realTranslator } from '../../../../testing/real-translator';
import { SupplierInvoice, SupplierPayment } from '../data-access/purchase.models';
import * as view from './payment-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const INVOICE: SupplierInvoice = {
  name: 'PINV-0068',
  billNo: 'GC-8831',
  supplier: 'Green Clay',
  supplierName: 'Green Clay',
  order: 'PO-2048',
  currency: 'ILS',
  total: 270,
  outstanding: 170,
  cancelled: false,
  payments: [],
};

const PAYMENT: SupplierPayment = {
  name: 'PAY-0155',
  docstatus: 1,
  supplierName: 'Green Clay',
  amount: 100,
  paidFrom: 'Main bank',
  invoices: [{ invoice: 'PINV-0068', allocated: 100 }],
};

describe('payment view', () => {
  it('describes the pay form like the pay-supplier mock', () => {
    expect(visible(view.payHeading(INVOICE, en))).toEqual({
      title: 'Pay supplier',
      subtitle: 'Green Clay · PINV-0068',
    });
    const unpaid = [{ name: 'PINV-0068', billNo: 'GC-8831', total: 270, outstanding: 270 }];
    expect(visible(view.invoiceOptions(unpaid, 'ILS', en))).toEqual([
      { value: 'PINV-0068', label: 'PINV-0068 · Outstanding ILS 270.00' },
    ]);
    expect(visible(view.allocationText(100, 'PINV-0068', 'ILS', en))).toBe(
      'ILS 100.00 to PINV-0068',
    );
    expect(visible(view.payReview(100, 270, 'Main bank', 'ILS', en))).toBe(
      'Pay ILS 100.00 from Main bank. The supplier invoice will have ILS 170.00 outstanding. This does not receive goods.',
    );
    expect(visible(view.payReview(270, 270, 'Main bank', 'ILS', en))).toBe(
      'Pay ILS 270.00 from Main bank. The supplier invoice will be paid in full. This does not receive goods.',
    );
    expect(visible(view.payConfirmLabel(100, 'ILS', en))).toBe('Confirm payment · ILS 100.00');
    expect(visible(view.payConfirmLabel(100, 'ILS', ar))).toBe('تأكيد دفع ILS 100.00');
  });

  it('describes a just-recorded partial payment like the payment-recorded mock', () => {
    expect(visible(view.paymentResult(PAYMENT, INVOICE, true, en))).toEqual({
      title: 'Payment recorded',
      subtitle: 'GC-8831 · Green Clay',
      chip: { label: 'Partial payment', tone: 'warning' },
      cardTitle: 'ILS 100.00 recorded',
      cardMessage: 'Supplier invoice total ILS 270.00. ILS 170.00 remains outstanding.',
      totals: [
        { label: 'Invoice total', value: 'ILS 270.00' },
        { label: 'Amount paid', value: 'ILS 100.00' },
        { label: 'Outstanding', value: 'ILS 170.00', accent: true },
      ],
      paidFrom: 'Main bank',
    });
    expect(visible(view.paymentResult(PAYMENT, INVOICE, true, ar).chip.label)).toBe('دفعة جزئية');
  });

  it('describes a payment opened later like the supplier-payment mock', () => {
    const v = visible(view.paymentResult(PAYMENT, INVOICE, false, en));
    expect([v.title, v.subtitle, v.cardMessage]).toEqual([
      'Supplier payment',
      'PO-2048 · GC-8831 · Green Clay',
      'This payment belongs to PO-2048. ILS 170.00 remains due on the supplier invoice.',
    ]);
    const paid = visible(view.paymentResult(PAYMENT, { ...INVOICE, outstanding: 0 }, false, en));
    expect([paid.chip, paid.cardMessage]).toEqual([
      { label: 'Paid in full', tone: 'tint' },
      'This payment belongs to PO-2048. The supplier invoice is paid in full.',
    ]);
  });
});
