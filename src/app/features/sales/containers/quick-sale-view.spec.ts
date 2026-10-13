import { realTranslator } from '../../../../testing/real-translator';
import { CatalogItem, SaleLine } from '../data-access/sale.models';
import * as view from './quick-sale-view';

// Values are wrapped in bidi isolates; compare the visible text.
const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;

const en = realTranslator('en');
const ar = realTranslator('ar');

const OLIVE: CatalogItem = {
  code: 'OLV-20',
  name: 'Olive tree · 20 L',
  uom: 'Unit',
  isStock: true,
  price: 85,
  stock: { 'Main warehouse - RN': 24 },
};
const CONSULTATION: CatalogItem = {
  code: 'SRV-GARDEN',
  name: 'Garden consultation',
  uom: 'Visit',
  isStock: false,
  price: 150,
  stock: {},
};
const LINES: SaleLine[] = [
  { item: OLIVE, qty: 2, rate: 85, discount: 0 },
  { item: CONSULTATION, qty: 1, rate: 150, discount: 0 },
];

describe('quick sale view', () => {
  it('builds the step subtitle', () => {
    expect(visible(view.stepSubtitle(2, 'Lina Haddad', en))).toBe('2 of 4 · Lina Haddad');
    expect(visible(view.stepSubtitle(1, 'العميل', ar))).toBe('1 من 4 · العميل');
  });

  it('shows a customer with contact details and their balance', () => {
    const lina = {
      id: 'Lina Haddad',
      name: 'Lina Haddad',
      phone: '059-000-0142',
      city: 'Ramallah',
      outstanding: 0,
      unpaidInvoices: 0,
    };
    expect(visible(view.customerView(lina, 'ILS', en))).toEqual({
      title: 'Lina Haddad',
      meta: '059-000-0142 · Ramallah',
      balance: 'No previous unpaid invoices',
    });
    expect(
      visible(view.customerView({ ...lina, phone: null, city: null, outstanding: 460 }, 'ILS', en)),
    ).toEqual({
      title: 'Lina Haddad',
      meta: null,
      balance: 'Outstanding ILS 460.00',
    });
  });

  it('describes catalog products with availability and services as services', () => {
    expect(visible(view.catalogItemView(OLIVE, 24, 'ILS', en))).toEqual({
      title: 'Olive tree · 20 L',
      meta: 'OLV-20 · Unit',
      detail: 'ILS 85.00 · 24 available',
      kind: 'product',
    });
    expect(visible(view.catalogItemView(CONSULTATION, Infinity, 'ILS', en))).toEqual({
      title: 'Garden consultation',
      meta: 'SRV-GARDEN · Visit',
      detail: 'ILS 150.00 · Service',
      kind: 'service',
    });
    expect(visible(view.catalogItemView(OLIVE, 24, 'ILS', ar)).detail).toBe(
      'ILS 85.00 · المتاح 24',
    );
  });

  it('summarises the basket with plural units', () => {
    expect(visible(view.basketSummary(LINES, 320, 'ILS', en))).toEqual({
      title: 'Basket · 3 units',
      message: '2 × Olive tree · 20 L + 1 × Garden consultation\nTotal ILS 320.00',
    });
    expect(visible(view.basketSummary(LINES.slice(1), 150, 'ILS', en)).title).toBe(
      'Basket · 1 unit',
    );
    expect(visible(view.basketSummary(LINES, 320, 'ILS', ar)).title).toBe('السلة · 3 وحدات');
  });

  it('builds basket lines like the "Your sale" mock', () => {
    expect(visible(view.basketLineView(LINES[0], 24, 'ILS', en))).toEqual({
      title: 'Olive tree · 20 L',
      meta: 'OLV-20 · ILS 85.00 each',
      detail: '2 × 85.00 = ILS 170.00 · 24 available',
      kind: 'product',
    });
    expect(visible(view.basketLineView(LINES[1], Infinity, 'ILS', en))).toEqual({
      title: 'Garden consultation',
      meta: 'SRV-GARDEN · ILS 150.00 / Visit',
      detail: '1 × 150.00 = ILS 150.00',
      kind: 'service',
    });
  });

  it('adds the discount to a basket line', () => {
    const line = { ...LINES[0], discount: 10 };
    expect(visible(view.basketLineView(line, 24, 'ILS', en)).detail).toBe(
      '2 × 85.00 = ILS 153.00 · 24 available · 10% off',
    );
  });

  it('builds compact panel lines with or without the currency', () => {
    expect(visible(view.panelLineView(LINES[0], 'ILS', en))).toEqual({
      title: 'Olive tree · 20 L',
      meta: '2 × ILS 85.00',
      detail: 'ILS 170.00',
      kind: 'product',
    });
    expect(visible(view.panelLineView(LINES[0], 'ILS', en, false)).meta).toBe('2 × 85.00');
  });

  it('builds the totals rows', () => {
    expect(
      visible(view.totalsRows({ total: 320, paid: 120, outstanding: 200 }, 'ILS', en)),
    ).toEqual([
      { label: 'Invoice total', value: 'ILS 320.00' },
      { label: 'Amount paid', value: 'ILS 120.00' },
      { label: 'Outstanding', value: 'ILS 200.00' },
    ]);
    expect(
      visible(view.totalsRows({ total: 320, paid: 0, outstanding: 320 }, 'ILS', ar))[0].label,
    ).toBe('إجمالي الفاتورة');
  });

  describe('createsMessage', () => {
    const base: view.CreatesInput = {
      lines: LINES,
      status: 'partial',
      total: 320,
      paid: 120,
      outstanding: 200,
      accountLabel: 'Main cash',
      warehouseName: 'Main warehouse',
    };

    it('lists the invoice, receipt and delivery', () => {
      expect(visible(view.createsMessage(base, 'ILS', en))).toBe(
        'A confirmed invoice for ILS 320.00, a receipt into Main cash for ILS 120.00, and a delivery of 2 × Olive tree · 20 L from Main warehouse.',
      );
    });

    it('leaves out the delivery when only services are sold', () => {
      expect(visible(view.createsMessage({ ...base, lines: LINES.slice(1) }, 'ILS', en))).toBe(
        'A confirmed invoice for ILS 320.00 and a receipt into Main cash for ILS 120.00.',
      );
    });

    it('says there is no payment record when unpaid', () => {
      expect(visible(view.createsMessage({ ...base, status: 'unpaid', paid: 0 }, 'ILS', en))).toBe(
        'A confirmed invoice for ILS 320.00 and a delivery of 2 × Olive tree · 20 L from Main warehouse. No payment record.',
      );
    });

    it('treats a missing account as no payment', () => {
      expect(
        visible(
          view.createsMessage({ ...base, lines: LINES.slice(1), accountLabel: null }, 'ILS', en),
        ),
      ).toBe('A confirmed invoice for ILS 320.00. No payment record.');
    });

    it('uses Arabic wording', () => {
      expect(
        visible(
          view.createsMessage({ ...base, lines: LINES.slice(1), status: 'unpaid' }, 'ILS', ar),
        ),
      ).toBe('فاتورة مؤكدة بقيمة ILS 320.00. دون تسجيل دفعة.');
    });
  });

  it('notes uncompleted services and what the customer owes', () => {
    expect(visible(view.servicesNote(LINES, 200, 'ILS', en))).toBe(
      'Garden consultation: invoiced, not marked completed. Customer owes ILS 200.00.',
    );
    expect(visible(view.servicesNote(LINES.slice(0, 1), 0, 'ILS', en))).toBeNull();
    expect(visible(view.servicesNote(LINES.slice(0, 1), 50, 'ILS', en))).toBe(
      'Customer owes ILS 50.00.',
    );
  });

  it('derives the payment status from the amounts', () => {
    expect(view.paymentStatusOf(0, 320)).toBe('unpaid');
    expect(view.paymentStatusOf(120, 320)).toBe('partial');
    expect(view.paymentStatusOf(320, 320)).toBe('paid');
  });
});
