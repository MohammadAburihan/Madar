import { realTranslator } from '../../../../testing/real-translator';
import { QuotationDetail } from '../data-access/quotation.models';
import { quotationHtml, quotationSummary } from './quotation-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const QUOTE: QuotationDetail = {
  name: 'QT-0084',
  customer: 'Lina Haddad',
  customerName: 'Lina Haddad',
  docstatus: 1,
  status: 'Open',
  date: '2026-10-11',
  validTill: '2026-10-25',
  total: 320,
  lines: [
    {
      code: 'OLV-20',
      name: 'Olive tree',
      qty: 2,
      uom: 'Unit',
      rate: 85,
      amount: 170,
      isStock: true,
    },
    {
      code: 'SRV-GARDEN',
      name: 'Garden consultation',
      qty: 1,
      uom: 'Visit',
      rate: 150,
      amount: 150,
      isStock: false,
    },
  ],
};

describe('quotation view', () => {
  it('sums the quotation up like the quotation-confirmed mock', () => {
    expect(visible(quotationSummary(QUOTE, 'ILS', en))).toEqual({
      title: 'Open · ILS 320.00',
      message: '2 × Olive tree + 1 × Garden consultation. No stock movement, invoice or payment.',
    });
    expect(visible(quotationSummary({ ...QUOTE, docstatus: 0 }, 'ILS', ar)).title).toBe(
      'مسودة · ILS 320.00',
    );
  });

  it('writes the customer PDF in the reader’s language, escaped and without isolates', () => {
    const html = quotationHtml(
      { ...QUOTE, lines: [{ ...QUOTE.lines[0], name: '<b>tree</b>' }] },
      'Rehan Nursery',
      'ILS',
      'ar',
      ar,
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('عرض السعر QT-0084');
    expect(html).toContain('&lt;b&gt;tree&lt;/b&gt;');
    expect(html).not.toMatch(/[⁦-⁩]/);
  });
});
