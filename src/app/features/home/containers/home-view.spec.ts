import { realTranslator } from '../../../../testing/real-translator';
import { HomeData } from '../data-access/home.models';
import { isolate } from '../../../core/i18n/translator';
import { buildHomeView as build, HomeViewInput } from './home-view';

// Mirrors the data in the design mocks (Sunday 11 October, 09:00).
const NOW = new Date(2026, 9, 11, 9, 0);
const DATA: HomeData = {
  todaySales: 1280,
  receivables: 460,
  drafts: {
    count: 2,
    recent: [
      {
        doctype: 'Sales Invoice',
        name: 'SI-1042',
        party: 'Lina Haddad',
        modified: '2026-10-11 08:50:00.000000',
        total: 320,
        currency: 'ILS',
        continuable: true,
      },
      {
        doctype: 'Sales Order',
        name: 'SO-0187',
        party: 'Samir Nasser',
        modified: '2026-10-11 07:00:00.000000',
        total: 110,
        currency: 'ILS',
        continuable: false,
      },
    ],
  },
  deliveries: [
    {
      name: 'PO-2048',
      supplier: 'Green Clay',
      scheduleDate: '2026-10-11',
      itemName: 'Ceramic planter',
      qty: 10,
    },
  ],
  supply: [
    {
      name: 'MR-1',
      projectName: 'Garden installation',
      scheduleDate: '2026-10-11',
      itemName: 'Planter',
      qty: 12,
      available: 8,
    },
  ],
  invoicesDue: [
    { name: 'SI-1039', customer: 'Samir Nasser', dueDate: '2026-10-12', outstanding: 460 },
  ],
  lowStock: { count: 3, warehouse: 'Main warehouse' },
};

const input = (overrides: Partial<HomeViewInput> = {}): HomeViewInput => ({
  data: DATA,
  persona: 'owner',
  firstName: 'Rehan',
  business: { name: 'Rehan Nursery', currency: 'ILS' },
  language: 'en',
  now: NOW,
  ...overrides,
});

// Values are wrapped in bidi isolates; compare the visible text.
const buildHomeView = (...args: Parameters<typeof build>) =>
  JSON.parse(JSON.stringify(build(...args)).replace(/[\u2068\u2069]/g, '')) as ReturnType<
    typeof build
  >;

describe('buildHomeView', () => {
  it("hides Transfer stock from an owner whose roles can't move stock", () => {
    const view = buildHomeView(
      { ...input(), capabilities: { transferStock: false } },
      realTranslator('en'),
    );
    expect(view.actions.map((a) => a.id)).not.toContain('transferStock');
    const warehouse = buildHomeView(
      { ...input(), persona: 'warehouse', capabilities: { transferStock: false } },
      realTranslator('en'),
    );
    expect(warehouse.actions.map((a) => a.id)).not.toContain('countStock');
  });

  it('builds the owner home like the mobile and desktop mocks', () => {
    const view = buildHomeView(input(), realTranslator('en'));

    expect(view.title).toBe('Good morning, Rehan');
    expect(view.subtitle).toBe('Owner · Sunday, 11 October');
    expect(view.desktopSubtitle).toBe('Rehan Nursery · Owner · Sunday, 11 October');
    expect(view.actions.map((a) => a.label)).toEqual([
      'Sell',
      'Buy',
      'Receive payment',
      'Pay supplier',
      'Record expense',
      'Transfer stock',
      'Supply a project',
    ]);
    expect(view.actionColumns).toBe(3);
    expect(view.cards).toEqual([
      {
        title: '2 unfinished drafts',
        message: 'Sale for Lina Haddad · Updated 10 min ago',
        target: { commands: ['/drafts'], draft: null },
        action: 'View drafts',
      },
      { title: 'Delivery arriving today', message: 'PO-2048 · 10 × Ceramic planter' },
    ]);
    expect(view.summary).toBe('Today: ILS 1,280 sales · ILS 460 to collect');
    expect(view.rows).toEqual([
      { work: 'PO-2048 · Green Clay', due: 'Today', next: 'Receive delivery' },
      {
        work: 'Lina Haddad · Draft',
        due: '10 min ago',
        next: 'Continue sale',
        target: { commands: ['/sales/new/basket'], draft: 'SI-1042' },
      },
      { work: 'Garden installation', due: 'Today', next: 'Supply 12 × Planter' },
      { work: 'Samir Nasser · SI-1039', due: 'Tomorrow', next: 'Receive payment' },
    ]);
    expect(view.glance.map(({ title, message }) => [title, message])).toEqual([
      ['ILS 1,280.00', 'Confirmed sales today'],
      ['ILS 460.00', 'Customer invoices due'],
      ['3 low-stock items', 'Main warehouse'],
    ]);
    expect(view.glanceNote).toBe(
      'All summaries belong to Rehan Nursery. Choose another business from the sidebar.',
    );
    expect(view.draftsLink).toBe('Unfinished work · 2 drafts · View all drafts');
  });

  it('uses Arabic wording and plural forms from the Arabic mocks', () => {
    const view = buildHomeView(input({ language: 'ar', firstName: 'ريحان' }), realTranslator('ar'));

    expect(view.title).toBe('صباح الخير، ريحان');
    expect(view.subtitle).toBe('المالك · الأحد، 11 أكتوبر');
    expect(view.cards[0]).toEqual({
      title: 'مسودتان غير مكتملتين',
      message: 'بيع إلى Lina Haddad · حُدّث قبل 10 دقائق',
      target: { commands: ['/drafts'], draft: null },
      action: 'عرض المسودات',
    });
    expect(view.cards[1].title).toBe('توريد يصل اليوم');
    expect(view.summary).toBe('اليوم: مبيعات ILS 1,280 · مستحق التحصيل ILS 460');
    expect(view.draftsLink).toBe('أعمال غير مكتملة · مسودتان · عرض كل المسودات');
    expect(view.glance[2].title).toBe('3 أصناف منخفضة المخزون');
  });

  it('builds the salesperson home from their own work', () => {
    const view = buildHomeView(
      input({
        persona: 'salesperson',
        data: { todaySales: 640, drafts: DATA.drafts, invoicesDue: DATA.invoicesDue },
      }),
      realTranslator('en'),
    );

    expect(view.title).toBe('Ready for your next sale?');
    expect(view.subtitle).toBe('Salesperson · Sunday, 11 October');
    expect(view.actions.map((a) => a.label)).toEqual([
      'Sell',
      'Receive payment',
      'Customers',
      'Catalog',
    ]);
    expect(view.cards).toEqual([
      {
        title: 'Continue your sale',
        message: 'Lina Haddad · ILS 320.00 · Draft',
        action: 'Continue sale',
        target: { commands: ['/sales/new/basket'], draft: 'SI-1042' },
      },
      { title: 'Customer to follow up', message: 'Samir Nasser · Invoice due tomorrow' },
    ]);
    expect(view.summary).toBe('Your sales today: ILS 640');
  });

  it('continues the newest sale draft, not a newer order or quotation draft', () => {
    const [sale, order] = DATA.drafts!.recent;
    const salesperson = (recent: NonNullable<HomeData['drafts']>['recent']) =>
      buildHomeView(
        input({ persona: 'salesperson', data: { drafts: { count: recent.length, recent } } }),
        realTranslator('en'),
      );

    const newerOrder = salesperson([{ ...order, modified: '2026-10-11 08:55:00.000000' }, sale]);
    expect(newerOrder.cards[0].target).toEqual({
      commands: ['/sales/new/basket'],
      draft: 'SI-1042',
    });
    expect(newerOrder.rows.map((r) => r.next)).toEqual(['Continue sale']);

    const onlyOrder = salesperson([order]);
    expect(onlyOrder.cards).toEqual([]);
    expect(onlyOrder.rows).toEqual([]);
  });

  it('builds the store associate home from sales and stock work', () => {
    const view = buildHomeView(
      input({
        persona: 'storeAssociate',
        data: {
          todaySales: 640,
          drafts: DATA.drafts,
          invoicesDue: DATA.invoicesDue,
          lowStock: DATA.lowStock,
        },
      }),
      realTranslator('en'),
    );

    expect(view.title).toBe('Today at the store');
    expect(view.subtitle).toBe('Store associate · Sunday, 11 October');
    expect(view.actions.map((a) => a.id)).toEqual([
      'sell',
      'receivePayment',
      'receiveGoods',
      'transferStock',
    ]);
    expect(view.cards[0]).toEqual({
      title: 'Continue your sale',
      message: 'Lina Haddad · ILS 320.00 · Draft',
      action: 'Continue sale',
      target: { commands: ['/sales/new/basket'], draft: 'SI-1042' },
    });
    expect(view.cards[1].title).toBe('3 items running low');
    expect(view.summary).toBe('Your sales today: ILS 640');
  });

  it('uses the Arabic store associate title and role', () => {
    const view = buildHomeView(
      input({ persona: 'storeAssociate', language: 'ar', data: {} }),
      realTranslator('ar'),
    );
    expect(view.title).toBe('اليوم في المتجر');
    expect(view.subtitle.startsWith('موظف المتجر')).toBe(true);
  });

  it('builds the warehouse home without money', () => {
    const view = buildHomeView(
      input({
        persona: 'warehouse',
        data: { lowStock: DATA.lowStock, supply: DATA.supply, deliveries: DATA.deliveries },
      }),
      realTranslator('en'),
    );

    expect(view.title).toBe('Today in the warehouse');
    expect(view.actions.map((a) => a.label)).toEqual([
      'Receive goods',
      'Transfer stock',
      'Count stock',
      'Supply project',
    ]);
    expect(view.cards).toEqual([
      { title: '3 items running low', message: 'Main warehouse · View stock' },
      {
        title: 'Garden installation needs materials',
        message: '12 × Planter needed · 8 available',
      },
    ]);
    expect(view.summary).toBe('Main warehouse · 3 low-stock items');
    expect(view.note).toBe(
      'Only permitted stock actions are shown. Money and sales amounts stay hidden.',
    );
    expect(view.glance.some((card) => card.title.includes('ILS'))).toBe(false);
    expect(view.draftsLink).toBeNull();
  });

  it('links a purchasing officer to the drafts page when they have unfinished purchases', () => {
    const view = buildHomeView(
      input({ persona: 'purchasing', data: { drafts: { count: 1, recent: [] } } }),
      realTranslator('en'),
    );
    expect(view.draftsLink).toBe('Unfinished work · 1 draft · View all drafts');
    expect(view.cards).toEqual([]);
  });

  it('builds the purchasing officer home from deliveries and stock, without sales', () => {
    const view = buildHomeView(
      input({
        persona: 'purchasing',
        data: { lowStock: DATA.lowStock, supply: DATA.supply, deliveries: DATA.deliveries },
      }),
      realTranslator('en'),
    );
    expect(view.title).toBe('Today in purchasing');
    expect(view.roleLabel).toBe('Purchasing officer');
    expect(view.actions.map((a) => a.id)).toEqual(['buy', 'receiveGoods']);
    expect(view.cards[0].title).toBe('Delivery arriving today');
    expect(view.draftsLink).toBeNull();
    expect(view.note).toBeNull();
    const ar = buildHomeView(input({ persona: 'purchasing', data: {} }), realTranslator('ar'));
    expect([ar.title, ar.roleLabel]).toEqual(['اليوم في المشتريات', 'مسؤول المشتريات']);
  });

  it("hides Buy from a user whose roles can't create purchase orders", () => {
    const view = buildHomeView(
      { ...input(), capabilities: { transferStock: true, orderPurchases: false } },
      realTranslator('en'),
    );
    expect(view.actions.map((a) => a.id)).not.toContain('buy');
  });

  it("hides Pay supplier from an owner whose roles can't record payments", () => {
    const view = buildHomeView(
      { ...input(), capabilities: { paySuppliers: false } },
      realTranslator('en'),
    );
    expect(view.actions.map((a) => a.id)).not.toContain('paySupplier');
  });

  it("hides Receive goods from a user whose roles can't post receipts", () => {
    const view = buildHomeView(
      { ...input({ persona: 'warehouse' }), capabilities: { receiveGoods: false } },
      realTranslator('en'),
    );
    expect(view.actions.map((a) => a.id)).not.toContain('receiveGoods');
  });

  it("hides Supply project from a user whose roles can't supply projects", () => {
    for (const persona of ['owner', 'warehouse'] as const) {
      const view = buildHomeView(
        { ...input({ persona }), capabilities: { supplyProjects: false } },
        realTranslator('en'),
      );
      expect(view.actions.map((a) => a.id).filter((id) => id.startsWith('supplyProject'))).toEqual(
        [],
      );
    }
  });

  it('marks overdue work and says when nothing needs attention', () => {
    const overdue = buildHomeView(
      input({ data: { invoicesDue: [{ ...DATA.invoicesDue![0], dueDate: '2026-10-01' }] } }),
      realTranslator('en'),
    );
    expect(overdue.rows[0].due).toBe('Overdue');
    expect(overdue.cards[0].title).toBe('Payment overdue');

    const empty = buildHomeView(input({ data: {} }), realTranslator('en'));
    expect(empty.cards).toEqual([]);
    expect(empty.rows).toEqual([]);
    expect(empty.emptyAttention.title).toBe('Nothing needs your attention');
    expect(empty.summary).toBeNull();
  });

  it('greets by time of day at the site', () => {
    const at = (hour: number) =>
      buildHomeView(input({ now: new Date(2026, 9, 11, hour) }), realTranslator('en')).title;
    expect([at(9), at(13), at(19)]).toEqual([
      'Good morning, Rehan',
      'Good afternoon, Rehan',
      'Good evening, Rehan',
    ]);
  });

  it('says everything is stocked instead of "0 low-stock items"', () => {
    const view = buildHomeView(
      input({ persona: 'warehouse', data: { lowStock: { count: 0, warehouse: null } } }),
      realTranslator('en'),
    );
    expect(view.summary).toBe('All items above reorder level');
  });

  it('isolates interpolated names and amounts so they keep their direction in Arabic', () => {
    const view = build(
      input({ persona: 'warehouse', language: 'ar', data: { lowStock: DATA.lowStock } }),
      realTranslator('ar'),
    );
    expect(view.summary).toContain(isolate('Main warehouse'));
    expect(view.summary).toContain(isolate(3));
  });

  it('shows a zero-state glance card instead of "0 low-stock items"', () => {
    const view = buildHomeView(
      input({ persona: 'warehouse', data: { lowStock: { count: 0, warehouse: null } } }),
      realTranslator('en'),
    );
    expect(view.glance).toEqual([
      { title: 'No low-stock items', message: 'All items above reorder level' },
    ]);
  });

  it('uses the Arabic forms for 11–99 and for 100+', () => {
    const at = (count: number) =>
      buildHomeView(
        input({
          persona: 'warehouse',
          language: 'ar',
          data: { lowStock: { count, warehouse: 'Main warehouse' } },
        }),
        realTranslator('ar'),
      ).cards[0].title;
    expect(at(11)).toBe('11 صنفاً قارب على النفاد');
    expect(at(100)).toBe('100 صنف قارب على النفاد');
  });
});
