import { realTranslator } from '../../../../testing/real-translator';
import { Statement, StatementEntry } from '../data-access/report.models';
import * as view from './statement-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const entry = (overrides: Partial<StatementEntry>): StatementEntry => ({
  date: '2026-09-02',
  voucherType: 'Sales Invoice',
  voucher: 'SI-1038',
  kind: 'invoice',
  firstItem: { name: 'olive trees', qty: 3, more: 0 },
  account: null,
  against: [],
  invoiced: 150,
  paid: 0,
  balance: 150,
  ...overrides,
});
const STATEMENT: Statement = {
  kind: 'customer',
  party: 'Lina Haddad',
  range: { from: '2026-09-01', to: '2026-10-14' },
  opening: 0,
  invoiced: 470,
  paid: 270,
  outstanding: 200,
  invoices: 2,
  payments: 2,
  entries: [
    entry({}),
    entry({
      date: '2026-09-09',
      voucherType: 'Payment Entry',
      voucher: 'PAY-0149',
      kind: 'payment',
      firstItem: null,
      account: 'Main cash',
      against: ['SI-1038'],
      invoiced: 0,
      paid: 150,
      balance: 0,
    }),
  ],
};

describe('statement view', () => {
  it('describes each document like the statement mocks', () => {
    expect(visible(view.entryDetail('customer', STATEMENT.entries[0], en))).toBe(
      'Sales invoice · 3 olive trees',
    );
    expect(visible(view.entryDetail('customer', STATEMENT.entries[1], en))).toBe(
      'Payment · Main cash · for SI-1038',
    );
    expect(visible(view.entryDetail('customer', STATEMENT.entries[1], ar))).toBe(
      'دفعة · Main cash · عن SI-1038',
    );
    expect(
      visible(
        view.entryDetail('supplier', entry({ firstItem: { name: 'Pot', qty: 4, more: 1 } }), en),
      ),
    ).toBe('Supplier invoice · 4 Pot and 1 more');
  });

  it('opens only the documents Madar has a page for', () => {
    expect(view.entryRoute('customer', STATEMENT.entries[0])).toEqual([
      '/sales/invoices',
      'SI-1038',
    ]);
    expect(view.entryRoute('customer', STATEMENT.entries[1])).toBeNull();
    expect(
      view.entryRoute('supplier', entry({ voucherType: 'Payment Entry', voucher: 'PAY-1' })),
    ).toEqual(['/purchases/payment', 'PAY-1']);
  });

  it('sums up the phone statement and lists its entries', () => {
    expect(visible(view.summaryRows(STATEMENT, 'ILS', en))).toEqual([
      { label: 'Opening balance · 01/09', value: 'ILS 0.00' },
      { label: 'Invoiced', value: 'ILS 470.00' },
      { label: 'Paid', value: '− ILS 270.00' },
      { label: 'Outstanding · 14/10', value: 'ILS 200.00', accent: true },
    ]);
    expect(visible(view.entryCards(STATEMENT, 'ILS', en))[1]).toEqual({
      id: 'PAY-0149',
      title: 'Payment PAY-0149',
      date: '09/09/2026',
      amount: '− ILS 150.00',
      balance: 'Balance 0.00',
      openable: false,
    });
  });

  it('builds the desktop figures and table, between opening and outstanding', () => {
    const metrics = visible(view.statementMetrics(STATEMENT, 'ILS', en));
    expect(metrics.map((m) => m.hint)).toEqual([
      'On 01/09/2026',
      '2 sales invoices',
      '2 payments',
      'On 14/10/2026',
    ]);
    expect(visible(view.statementMetrics(STATEMENT, 'ILS', ar))[1].hint).toBe('فاتورتا بيع');
    const rows = visible(view.entryRows(STATEMENT, en));
    expect(rows[0].cells).toEqual(['01/09/2026', 'Opening balance', '', '', '', '0.00']);
    expect(rows[3].cells).toEqual(['14/10/2026', 'Outstanding', '', '470.00', '270.00', '200.00']);
  });

  it('writes a self-contained, escaped PDF page in the reader’s direction', () => {
    const html = view.statementHtml(
      { ...STATEMENT, entries: [entry({ firstItem: { name: '<b>trees</b>', qty: 1, more: 0 } })] },
      'كشف حساب العميل',
      'Rehan Nursery',
      'ILS',
      'ar',
      ar,
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('&lt;b&gt;trees&lt;/b&gt;');
    expect(html).not.toMatch(/[⁦-⁩]/);
  });
});
