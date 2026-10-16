import { realTranslator } from '../../../../testing/real-translator';
import { SalesOrderDetail } from '../data-access/sales-order.models';
import { invoiceDone, invoiceReview } from './order-invoice-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const line = {
  row: 'tree',
  code: 'OLV-20',
  name: 'Olive tree',
  uom: 'Unit',
  qty: 2,
  deliveredQty: 2,
  conversionFactor: 1,
  bySupplier: false,
  rate: 85,
  amount: 170,
  isStock: true,
};
const ORDER: SalesOrderDetail = {
  name: 'SO-0187',
  customer: 'Lina Haddad',
  customerName: 'Lina Haddad',
  docstatus: 1,
  status: 'To Bill',
  deliveryStatus: 'Fully Delivered',
  billingStatus: 'Not Billed',
  date: '2026-10-11',
  deliveryDate: '2026-10-13',
  quotation: null,
  total: 320,
  lines: [line],
};
const PREVIEW = {
  lines: [
    { code: 'OLV-20', name: 'Olive tree', qty: 2, amount: 170, isStock: true },
    { code: 'SRV-GARDEN', name: 'Garden consultation', qty: 1, amount: 150, isStock: false },
  ],
  total: 320,
};

describe('order invoice view', () => {
  it('reviews what the invoice bills and that delivered goods stay put, as on the mock', () => {
    expect(visible(invoiceReview(ORDER, PREVIEW, 'ILS', en))).toEqual({
      title: 'Review order invoice',
      subtitle: 'SO-0187 · Lina Haddad',
      cardTitle: 'Invoice only · ILS 320.00',
      cardMessage:
        '2 × Olive tree 170.00 + 1 × Garden consultation 150.00. Already delivered goods will not move again. ' +
        'Received 0.00 · Due 320.00.',
    });
    const undelivered = { ...ORDER, lines: [{ ...line, deliveredQty: 0 }] };
    expect(visible(invoiceReview(undelivered, PREVIEW, 'ILS', en).cardMessage)).toContain(
      'It moves no stock: goods leave with their delivery.',
    );
  });

  it('reads the recorded invoice as owed, in both languages', () => {
    const invoice = { name: 'SI-1043', total: 320, outstanding: 320 };
    expect(visible(invoiceDone('SO-0187', invoice, 'ILS', en))).toEqual({
      title: 'Order invoice recorded',
      subtitle: 'SI-1043 · SO-0187',
      cardTitle: 'Unpaid · ILS 320.00',
      cardMessage: 'Invoice linked to SO-0187. Received 0.00. No second stock delivery or payment.',
    });
    expect(
      visible(invoiceDone('SO-0187', { ...invoice, outstanding: 0 }, 'ILS', ar).cardTitle),
    ).toBe('مدفوعة · ILS 320.00');
  });
});
