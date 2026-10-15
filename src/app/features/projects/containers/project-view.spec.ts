import { realTranslator } from '../../../../testing/real-translator';
import { ProjectDetail } from '../data-access/project.models';
import * as view from './project-view';

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
  actual: 1320,
  plannedDate: '2026-10-11',
  tasks: [
    { subject: 'Prepare planting beds', due: '2026-10-12', owners: ['Salim'], status: 'Open' },
  ],
  requirements: [
    { item: 'POT-30', itemName: 'Ceramic planters', uom: 'Unit', required: 12, available: 8 },
  ],
  attachments: [{ name: 'Site plan PDF · v3', size: 1_800_000, date: '2026-10-09' }],
  linked: [{ kind: 'expense', name: 'EX-019', detail: '', amount: 1320 }],
};

describe('project view', () => {
  it('lists customer and internal projects like the projects mock', () => {
    expect(visible(view.projectCard(PROJECT, en))).toEqual({
      title: 'Garden installation · PRJ-018',
      message: 'Customer project · Lina Haddad',
    });
    expect(
      visible(view.projectCard({ ...PROJECT, kind: 'internal', customerName: null }, en)).message,
    ).toBe('Internal project · No customer required');
    expect(visible(view.projectCard(PROJECT, ar)).message).toBe('مشروع عميل · Lina Haddad');
  });

  it('describes the overview like the garden-installation mock', () => {
    expect(visible(view.overviewHeading(PROJECT, en))).toEqual({
      title: 'Garden installation',
      subtitle: 'Lina Haddad · Site project',
      chip: { label: 'In progress', tone: 'tint' },
    });
    expect(visible(view.budgetStats(PROJECT, 'ILS', en))).toEqual([
      { label: 'Budget', value: 'ILS 5,000' },
      { label: 'Actual', value: 'ILS 1,320' },
      { label: 'Remaining', value: 'ILS 3,680' },
    ]);
    expect(visible(view.taskCard(PROJECT.tasks[0], 'en', en))).toEqual({
      title: 'Prepare planting beds',
      message: '12 Oct · Salim',
    });
    expect(visible(view.requirementRow(PROJECT.requirements[0], en))).toEqual({
      label: 'Ceramic planters · POT-30',
      status: '12 needed · 8 available',
      short: true,
    });
    expect(visible(view.requirementRow(PROJECT.requirements[0], ar)).status).toBe(
      'المطلوب 12 · المتاح 8',
    );
    expect(view.attachmentCard(PROJECT.attachments[0], 'en')).toEqual({
      title: 'Site plan PDF · v3',
      message: '1.8 MB',
    });
    expect(visible(view.linkedRows(PROJECT.linked, 'ILS', en))).toEqual([
      { label: 'Expense', value: 'EX-019 · ILS 1,320.00' },
    ]);
  });

  it("shows only the budget when the role can't read the ledger, and an internal subtitle", () => {
    expect(view.budgetStats({ ...PROJECT, actual: null }, 'ILS', en)).toHaveLength(1);
    expect(
      visible(view.overviewHeading({ ...PROJECT, kind: 'internal', customerName: null }, en))
        .subtitle,
    ).toBe('Internal project · PRJ-018');
  });

  it('says no customer is set on a customer project without one', () => {
    const none = { ...PROJECT, customer: null, customerName: null };
    expect(visible(view.projectCard(none, en)).message).toBe('Customer project · No customer set');
    expect(visible(view.overviewHeading(none, en)).subtitle).toBe('No customer set · Site project');
  });
});
