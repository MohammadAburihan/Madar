import { realTranslator } from '../../../../testing/real-translator';
import { SalesOrderDetail } from '../data-access/sales-order.models';
import { orderChips, orderHeading, orderLineCard } from './sales-order-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

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
  quotation: 'QT-0084',
  total: 320,
  lines: [
    {
      row: 'a',
      code: 'OLV-20',
      name: 'Olive tree · 20 L',
      uom: 'Unit',
      qty: 2,
      deliveredQty: 0,
      conversionFactor: 1,
      rate: 85,
      amount: 170,
      isStock: true,
    },
    {
      row: 'b',
      code: 'SRV-GARDEN',
      name: 'Garden consultation',
      uom: 'Visit',
      qty: 1,
      deliveredQty: 0,
      conversionFactor: 1,
      rate: 150,
      amount: 150,
      isStock: false,
    },
  ],
};

describe('sales order view', () => {
  it('heads the order with its customer and quotation, as on the mock', () => {
    expect(visible(orderHeading(ORDER, en))).toEqual({
      title: 'Sales order SO-0187',
      subtitle: 'Lina Haddad · From QT-0084',
    });
    expect(visible(orderHeading({ ...ORDER, quotation: null }, ar))).toEqual({
      title: 'أمر البيع SO-0187',
      subtitle: 'Lina Haddad',
    });
  });

  it('reads ERPNext’s order, delivery and billing states', () => {
    expect(visible(orderChips(ORDER, en))).toEqual([
      { label: 'Order: Confirmed', tone: 'tint' },
      { label: 'Delivery: Pending', tone: 'warning' },
      { label: 'Invoice: Not issued', tone: 'warning' },
    ]);
    expect(
      visible(
        orderChips(
          { ...ORDER, deliveryStatus: 'Fully Delivered', billingStatus: 'Partly Billed' },
          ar,
        ).map((c) => c.label),
      ),
    ).toEqual(['الطلب: مؤكد', 'التسليم: تم التسليم', 'الفاتورة: صدرت جزئياً']);
    expect(visible(orderChips({ ...ORDER, status: 'On Hold' }, en)[0].label)).toBe(
      'Order: On hold',
    );
    expect(visible(orderChips({ ...ORDER, docstatus: 0 }, en))).toEqual([
      { label: 'Order: Draft', tone: 'warning' },
    ]);
  });

  it('counts goods delivered and says whether service work is done', () => {
    expect(visible(orderLineCard(ORDER.lines[0], 'ILS', en))).toEqual({
      title: 'Olive tree · 20 L',
      meta: '2 ordered · 0 delivered',
      detail: 'ILS 170.00',
    });
    expect(visible(orderLineCard(ORDER.lines[1], 'ILS', en))).toEqual({
      title: 'Garden consultation',
      meta: 'SRV-GARDEN · 1 Visit',
      detail: 'ILS 150.00 · Service work pending',
    });
    expect(visible(orderLineCard({ ...ORDER.lines[1], deliveredQty: 1 }, 'ILS', ar).detail)).toBe(
      'ILS 150.00 · تم إنجاز الخدمة',
    );
  });
});
