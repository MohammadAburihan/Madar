import { realTranslator } from '../../../../testing/real-translator';
import { InvoiceRecord, OrderRecord } from '../data-access/sales-records.models';
import * as view from './sales-records-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const INVOICE: InvoiceRecord = {
  name: 'SI-1042',
  customer: 'Lina Haddad',
  docstatus: 1,
  isReturn: false,
  delivered: true,
  total: 320,
  outstanding: 200,
  date: '2026-10-11',
};
const ORDER: OrderRecord = {
  name: 'SO-0187',
  customer: 'Samir Nasser',
  docstatus: 1,
  status: 'To Deliver and Bill',
  qty: 2,
  delivered: 0,
  billed: 0,
  total: 170,
  date: '2026-10-10',
};

describe('sales records view', () => {
  it('describes an invoice like the sales records mock', () => {
    expect(visible(view.invoiceCard(INVOICE, 'ILS', en))).toEqual({
      id: 'SI-1042',
      title: 'SI-1042 · Lina Haddad',
      message: 'Confirmed · Partially paid\nGoods delivered · ILS 200.00 due',
      openable: true,
      cells: [
        'SI-1042',
        'Lina Haddad',
        'Confirmed · Partially paid · Goods delivered',
        'ILS 200.00 due',
      ],
    });
    expect(visible(view.invoiceCard({ ...INVOICE, outstanding: 0 }, 'ILS', en)).message).toBe(
      'Confirmed · Paid\nGoods delivered · ILS 320.00',
    );
    expect(
      visible(view.invoiceCard({ ...INVOICE, outstanding: 320, delivered: false }, 'ILS', en))
        .message,
    ).toBe('Confirmed · Unpaid\nInvoice only · ILS 320.00 due');
    expect(visible(view.invoiceCard(INVOICE, 'ILS', ar)).message).toBe(
      'مؤكدة · مدفوع جزئياً\nتم تسليم البضائع · المتبقي ILS 200.00',
    );
  });

  it('describes an order by what is delivered and invoiced', () => {
    expect(visible(view.orderCard(ORDER, 'ILS', en)).message).toBe(
      'Confirmed order · 2 items\nDelivery pending · Not invoiced',
    );
    expect(
      visible(view.orderCard({ ...ORDER, delivered: 100, billed: 50 }, 'ILS', en)).message,
    ).toBe('Confirmed order · 2 items\nDelivered · Partly invoiced');
    expect(visible(view.orderCard(ORDER, 'ILS', ar)).message).toBe(
      'الطلب مؤكد · صنفان\nالتسليم قيد الانتظار · لم تصدر الفاتورة',
    );
  });

  it('describes a quotation with its validity', () => {
    const quote = {
      name: 'QT-0084',
      customer: 'Lina Haddad',
      docstatus: 0,
      status: 'Draft',
      total: 320,
      validTill: '2026-10-25',
      date: '2026-10-11',
    };
    expect(visible(view.quoteCard(quote, 'ILS', 'en', en)).message).toBe(
      'Draft · ILS 320.00\nValid until 25 Oct 2026',
    );
    expect(
      visible(view.quoteCard({ ...quote, docstatus: 1, status: 'Ordered' }, 'ILS', 'en', en))
        .message,
    ).toContain('Ordered');
  });
});
