import { realTranslator } from '../../../../testing/real-translator';
import { ProjectDetail, ProjectSales } from '../data-access/project.models';
import { billedText, saleLinks, sellSection } from './project-sell-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');

const PROJECT: ProjectDetail = {
  name: 'PRJ-018',
  title: 'Garden installation',
  kind: 'customer',
  customer: 'CUST-LINA',
  customerName: 'Lina Haddad',
  status: 'open',
  budget: 5000,
  actual: null,
  plannedDate: null,
  tasks: null,
  siteItems: [],
  requirements: [],
  attachments: [],
  linked: [],
  customerActive: true,
  sales: null,
};
const ALL = { sell: true, supplyProjects: true, manageProjects: true };

describe('project sell view', () => {
  it('offers a quick sale to the project’s customer', () => {
    expect(visible(sellSection(PROJECT, ALL, en))).toMatchObject({
      state: 'sell',
      heading: 'Sell to this project',
      note: 'Customer: Lina Haddad · billed to this project',
      quick: 'Quick sale',
      notice: null,
    });
    expect(visible(sellSection(PROJECT, ALL, ar))).toMatchObject({
      heading: 'البيع لهذا المشروع',
      note: 'العميل: Lina Haddad · تُسجَّل على هذا المشروع',
      quick: 'بيع سريع',
    });
  });

  it('shows nothing to a user who can’t sell, or for a cancelled project', () => {
    expect(sellSection(PROJECT, { ...ALL, sell: false }, en)).toBeNull();
    expect(sellSection({ ...PROJECT, status: 'cancelled' }, ALL, en)).toBeNull();
  });

  it('warns instead of offering buttons when the customer is disabled', () => {
    expect(sellSection({ ...PROJECT, customerActive: false }, ALL, en)).toMatchObject({
      state: 'disabled',
      quick: null,
      notice: { title: 'This customer is inactive' },
    });
  });

  it('says an internal project has no customer, with supply and add-customer only where allowed', () => {
    const internal: ProjectDetail = {
      ...PROJECT,
      kind: 'internal',
      customer: null,
      customerName: null,
    };
    expect(visible(sellSection(internal, ALL, en))).toMatchObject({
      state: 'internal',
      quick: null,
      notice: {
        message:
          "This project has no customer, so there's nothing to sell to. Supply it from stock, or add a customer to sell to it.",
      },
      supply: 'Supply this project',
      addCustomer: 'Add customer',
    });
    expect(
      sellSection(internal, { sell: true, supplyProjects: false, manageProjects: false }, en),
    ).toMatchObject({ supply: null, addCustomer: null });
    expect(visible(sellSection(internal, ALL, ar))).toMatchObject({
      notice: {
        message:
          'هذا المشروع بلا عميل، لذا لا يمكن البيع له. زوّده من المخزون، أو أضف عميلاً للبيع له.',
      },
    });
  });

  const SALES: ProjectSales = {
    rows: [
      {
        kind: 'invoice',
        name: 'SI-1043',
        status: 'Credit Note Issued',
        isReturn: true,
        amount: -40,
      },
      { kind: 'order', name: 'SO-7', status: 'To Deliver and Bill', isReturn: false, amount: 500 },
      { kind: 'invoice', name: 'SI-1042', status: 'Paid', isReturn: false, amount: 320 },
      { kind: 'invoice', name: 'SI-1041', status: 'Partly Paid', isReturn: false, amount: 100 },
      { kind: 'invoice', name: 'SI-1040', status: 'Overdue', isReturn: false, amount: 90 },
    ],
    billed: 480,
  };

  it('lists each sale with its amount and status, opening its record', () => {
    expect(visible(saleLinks(SALES, 'ILS', en))).toEqual([
      { id: 'invoice:SI-1043', label: 'SI-1043 · ILS -40.00 · Return', openable: true },
      { id: 'order:SO-7', label: 'SO-7 · ILS 500.00 · To deliver and bill', openable: true },
      { id: 'invoice:SI-1042', label: 'SI-1042 · ILS 320.00 · Paid', openable: true },
      { id: 'invoice:SI-1041', label: 'SI-1041 · ILS 100.00 · Partly paid', openable: true },
      { id: 'invoice:SI-1040', label: 'SI-1040 · ILS 90.00 · Unpaid', openable: true },
    ]);
    expect(visible(saleLinks(SALES, 'ILS', ar))[2].label).toContain('مدفوعة');
  });

  it('shows the billed total, or none when only the user’s own sales are listed', () => {
    expect(visible(billedText(SALES, 'ILS', en))).toBe('Billed ILS 480.00');
    expect(visible(billedText(SALES, 'ILS', ar))).toContain('المفوتر');
    expect(billedText({ ...SALES, billed: null }, 'ILS', en)).toBeNull();
  });
});
