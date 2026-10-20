import { realTranslator } from '../../../../testing/real-translator';
import { DraftEntry } from '../data-access/drafts.models';
import { buildDraftsView, draftTarget } from './drafts-view';

const visible = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value).replace(/[\u2066-\u2069]/g, '')) as T;

const NOW = new Date(2026, 9, 11, 9, 0);
const entry = (overrides: Partial<DraftEntry>): DraftEntry => ({
  kind: 'sale',
  name: 'SI-1',
  party: 'Lina Haddad',
  modified: '2026-10-11 08:50:00.000000',
  total: 320,
  currency: 'ILS',
  units: 3,
  continuable: true,
  invoice: null,
  ...overrides,
});
const ENTRIES = [
  entry({}),
  entry({
    kind: 'purchase',
    name: 'PO-1',
    party: 'Green Clay',
    modified: '2026-10-10 09:00:00.000000',
    total: 450,
    units: 10,
  }),
];
const input = (overrides: Partial<Parameters<typeof buildDraftsView>[0]> = {}) => ({
  entries: ENTRIES,
  term: '',
  business: 'Rehan Nursery',
  currency: 'ILS',
  seeCosts: true,
  now: NOW,
  ...overrides,
});

describe('buildDraftsView', () => {
  it('words the page like the mock', () => {
    const view = visible(buildDraftsView(input(), realTranslator('en')));
    expect(view.subtitle).toBe('2 drafts · Rehan Nursery');
    expect(view.cards).toEqual([
      {
        id: 'sale:SI-1',
        title: 'Sale for Lina Haddad',
        meta: 'ILS 320.00 · 3 units · Updated 10 min ago',
        action: 'Continue sale',
        primary: true,
      },
      {
        id: 'purchase:PO-1',
        title: 'Purchase from Green Clay',
        meta: 'ILS 450.00 · 10 units · Updated 1 day ago',
        action: 'Continue purchase',
        primary: false,
      },
    ]);
    expect(view.note).toBe('Drafts have no confirmed invoice, payment or stock effect.');
  });

  it('words the page in Arabic with the dual form for two drafts', () => {
    const view = visible(buildDraftsView(input(), realTranslator('ar')));
    expect(view.subtitle).toBe('مسودتان · Rehan Nursery');
    expect(view.cards.map((c) => c.action)).toEqual(['متابعة البيع', 'متابعة الشراء']);
    expect(view.note).toBe('لا تنشئ المسودات فاتورة أو دفعة مؤكدة ولا تؤثر في المخزون.');
  });

  it('counts the drafts shown, and filters by party or document name', () => {
    const tr = realTranslator('en');
    const lina = visible(buildDraftsView(input({ term: ' lina ' }), tr));
    expect(lina.cards.map((c) => c.id)).toEqual(['sale:SI-1']);
    expect(lina.subtitle).toBe('1 draft · Rehan Nursery');
    expect(visible(buildDraftsView(input({ term: 'po-1' }), tr)).cards.map((c) => c.id)).toEqual([
      'purchase:PO-1',
    ]);
    const none = visible(buildDraftsView(input({ term: 'zzz' }), tr));
    expect(none.cards).toEqual([]);
    expect(none.empty.title).toBe('No matching drafts');
  });

  it('says there is nothing unfinished when there are no drafts', () => {
    const view = visible(buildDraftsView(input({ entries: [] }), realTranslator('en')));
    expect(view.subtitle).toBe('0 drafts · Rehan Nursery');
    expect(view.empty.title).toBe('Nothing unfinished');
  });

  it('titles every kind and labels the ones Madar cannot finish as Open', () => {
    const view = visible(
      buildDraftsView(
        input({
          entries: [
            entry({ kind: 'quotation', name: 'QT-1', party: 'Samir' }),
            entry({ kind: 'order', name: 'SO-1', party: 'Samir', continuable: false }),
            entry({
              kind: 'payment',
              name: 'PAY-1',
              party: 'Green Clay',
              units: null,
              invoice: 'PINV-1',
            }),
            entry({ kind: 'sale', name: 'SI-9', continuable: false }),
          ],
        }),
        realTranslator('en'),
      ),
    );
    expect(view.cards.map((c) => [c.title, c.action, c.primary])).toEqual([
      ['Quotation for Samir', 'Continue quotation', false],
      ['Order for Samir', 'Open order', false],
      ['Payment to Green Clay', 'Continue payment', false],
      ['Sale for Lina Haddad', 'Open invoice', false],
    ]);
    expect(view.cards[2].meta).toBe('ILS 320.00 · Updated 10 min ago');
  });

  it('leaves buying amounts out for roles that do not see costs', () => {
    const view = visible(buildDraftsView(input({ seeCosts: false }), realTranslator('en')));
    expect(view.cards[0].meta).toContain('ILS 320.00');
    expect(view.cards[1].meta).toBe('10 units · Updated 1 day ago');
  });
});

describe('draftTarget', () => {
  it('continues a draft in its task with ?draft=, and otherwise opens its page', () => {
    expect(draftTarget(entry({}))).toEqual({ commands: ['/sales/new/basket'], draft: 'SI-1' });
    expect(draftTarget(entry({ continuable: false }))).toEqual({
      commands: ['/sales/invoices', 'SI-1'],
      draft: null,
    });
    expect(draftTarget(entry({ kind: 'quotation', name: 'QT-1' }))).toEqual({
      commands: ['/sales/quote/new'],
      draft: 'QT-1',
    });
    expect(draftTarget(entry({ kind: 'order', name: 'SO-1' }))).toEqual({
      commands: ['/sales/orders', 'SO-1'],
      draft: null,
    });
    expect(draftTarget(entry({ kind: 'purchase', name: 'PO-1' }))).toEqual({
      commands: ['/purchases/new'],
      draft: 'PO-1',
    });
    expect(draftTarget(entry({ kind: 'payment', name: 'PAY-1', invoice: 'PINV-1' }))).toEqual({
      commands: ['/purchases/invoice', 'PINV-1', 'pay'],
      draft: 'PAY-1',
    });
    expect(draftTarget(entry({ kind: 'payment', name: 'PAY-1', continuable: false }))).toEqual({
      commands: ['/purchases/payment', 'PAY-1'],
      draft: null,
    });
  });
});
