import { realTranslator } from '../../../../testing/real-translator';
import { LeaveRequest } from '../data-access/workers.models';
import { balanceLabel, daysSummary, leaveCard, leaveRequestView } from './leave-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, '')) as T;
const en = realTranslator('en');
const ar = realTranslator('ar');
const REQUEST: LeaveRequest = {
  id: 'HR-LAP-2026-00004',
  worker: 'E1',
  workerName: 'Khaled Omar',
  leaveType: 'Privilege Leave',
  from: '2026-10-26',
  to: '2026-10-28',
  days: 3,
  reason: 'Family visit',
  status: 'Open',
  decided: false,
  requested: '2026-10-17',
};

describe('leave view', () => {
  it('shows the list card like the mock', () => {
    expect(visible(leaveCard(REQUEST, 'en', en))).toEqual({
      id: 'HR-LAP-2026-00004',
      title: 'Khaled Omar',
      meta: 'Privilege Leave · 26 Oct 2026 – 28 Oct 2026',
      balance: '3 days · Waiting for approval',
    });
    expect(
      visible(
        leaveCard(
          { ...REQUEST, to: '2026-10-26', days: 1, status: 'Approved', decided: true },
          'en',
          en,
        ),
      ),
    ).toMatchObject({ meta: 'Privilege Leave · 26 Oct 2026', balance: '1 day · Approved' });
  });

  it('shows the request page with what approval leaves, like the mock', () => {
    expect(visible(leaveRequestView(REQUEST, 14, 'en', en))).toEqual({
      title: 'Khaled Omar',
      subtitle: 'Privilege Leave · HR-LAP-2026-00004',
      lines: '26 Oct 2026 – 28 Oct 2026 · 3 days\nReason: Family visit\nRequested 17 Oct 2026',
      totals: [
        { label: 'Days requested', value: '3 days' },
        { label: 'Left after approval', value: '11 days' },
        { label: 'Leave left now', value: '14 days' },
      ],
      card: {
        title: 'Waiting for approval',
        message: 'Approving submits it in ERPNext and marks those days as leave.',
      },
      open: true,
    });
    const rejected = visible(
      leaveRequestView({ ...REQUEST, status: 'Rejected', decided: true, reason: '' }, 14, 'en', en),
    );
    expect(rejected.totals).toEqual([{ label: 'Days requested', value: '3 days' }]);
    expect(rejected.lines).not.toContain('Reason');
    expect(rejected).toMatchObject({ open: false, card: { title: 'Rejected', message: '' } });
  });

  it('treats a request given a status in Desk but not submitted as still waiting', () => {
    const draft = visible(leaveRequestView({ ...REQUEST, status: 'Approved' }, 14, 'en', en));
    expect(draft).toMatchObject({ open: true, card: { title: 'Waiting for approval' } });
    expect(draft.card.message).toBe(
      'Saved as Approved in ERPNext but not submitted: nothing is decided yet. Approve or reject it here.',
    );
    expect(visible(leaveCard({ ...REQUEST, status: 'Rejected' }, 'en', en)).balance).toBe(
      '3 days · Waiting for approval',
    );
    // Cancelled in Desk: neither waiting nor decided.
    expect(
      visible(leaveRequestView({ ...REQUEST, status: 'Cancelled' }, 14, 'en', en)),
    ).toMatchObject({
      open: false,
      card: { title: 'Cancelled' },
    });
  });

  it('labels leave types and the day count, unpaid ones without a balance', () => {
    expect(visible(balanceLabel({ type: 'Privilege Leave', left: 14 }, en))).toBe(
      'Privilege Leave · 14 days left',
    );
    expect(visible(balanceLabel({ type: 'Leave Without Pay', left: null }, en))).toBe(
      'Leave Without Pay · unpaid',
    );
    expect(visible(daysSummary(3, 14, en))).toBe('3 days · 11 left after');
    expect(visible(daysSummary(0.5, null, en))).toBe('0.5 days');
  });

  it('uses the Arabic wording', () => {
    expect(visible(leaveCard(REQUEST, 'ar', ar)).balance).toBe('3 أيام · بانتظار الاعتماد');
    expect(visible(leaveRequestView(REQUEST, 14, 'ar', ar)).totals[1]).toEqual({
      label: 'المتبقي بعد الاعتماد',
      value: '11 يوماً',
    });
    expect(visible(balanceLabel({ type: 'Privilege Leave', left: 14 }, ar))).toBe(
      'Privilege Leave · متبقٍ 14 يوماً',
    );
  });
});
