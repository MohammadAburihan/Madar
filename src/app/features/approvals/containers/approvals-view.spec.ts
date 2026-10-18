import { realTranslator } from '../../../../testing/real-translator';
import { approvalCard, approvalView, doctypeLabel } from './approvals-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');
const ITEM = {
  doctype: 'Expense Claim',
  name: 'HR-EXP-2026-00003',
  title: 'Rana Saleh',
  amount: 120,
  state: 'Draft',
  date: '2026-10-17',
};

describe('approvals view', () => {
  it('shows the inbox card like the mock', () => {
    expect(visible(approvalCard(ITEM, 'ILS', 'en', en))).toEqual({
      id: 'Expense Claim/HR-EXP-2026-00003',
      title: 'Expense claim · Rana Saleh',
      meta: 'HR-EXP-2026-00003 · 17 Oct 2026',
      balance: 'ILS 120.00 · Draft',
    });
    expect(visible(approvalCard({ ...ITEM, amount: null }, 'ILS', 'en', en)).balance).toBe('Draft');
  });

  it('names known doctypes in the user’s words and others as ERPNext does', () => {
    expect(doctypeLabel('Purchase Order', en)).toBe('Purchase order');
    expect(doctypeLabel('Expense Claim', ar)).toBe('مطالبة مصروفات');
    expect(doctypeLabel('Asset Movement', en)).toBe('Asset Movement');
  });

  it('shows the item page like the mock', () => {
    expect(
      visible(
        approvalView(
          { ...ITEM, actions: ['Approve'], lines: ['Fuel for the delivery van'] },
          'ILS',
          'en',
          en,
        ),
      ),
    ).toEqual({
      title: 'Rana Saleh',
      subtitle: 'Expense claim · HR-EXP-2026-00003',
      lines: 'Fuel for the delivery van\nDated 17 Oct 2026\nState: Draft',
      totals: [{ label: 'Amount', value: 'ILS 120.00' }],
    });
  });
});
