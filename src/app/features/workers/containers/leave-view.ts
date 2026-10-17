import { formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { LeaveBalance, LeaveRequest } from '../data-access/workers.models';

const num = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);

const days = (count: number, tr: Translator) =>
  tr.plural('workers.days', count, { count: num(count) });

/** "26 Oct 2026 – 28 Oct 2026", or one date for a single day. */
export function leaveRange(request: Pick<LeaveRequest, 'from' | 'to'>, language: Language) {
  const from = formatShortDate(request.from, language);
  return request.from === request.to ? from : `${from} – ${formatShortDate(request.to, language)}`;
}

/** Waiting for approval, Approved or Rejected, in the user's words. */
export function leaveStatus(request: LeaveRequest, tr: Translator): string {
  return tr.t(
    `workers.leave.status.${request.decided ? request.status : request.status === 'Open' ? 'waiting' : request.status}`,
  );
}

/** The list card: worker, leave type and dates, and how many days and where it stands. */
export function leaveCard(request: LeaveRequest, language: Language, tr: Translator) {
  return {
    id: request.id,
    title: request.workerName,
    meta: `${request.leaveType} · ${leaveRange(request, language)}`,
    balance: `${days(request.days, tr)} · ${leaveStatus(request, tr)}`,
  };
}

/** The request's page: its details, what it does to the balance, and where it stands. */
export function leaveRequestView(
  request: LeaveRequest,
  left: number | null,
  language: Language,
  tr: Translator,
) {
  const open = !request.decided && request.status === 'Open';
  return {
    title: request.workerName,
    subtitle: `${request.leaveType} · ${request.id}`,
    lines: [
      `${leaveRange(request, language)} · ${days(request.days, tr)}`,
      request.reason ? tr.t('workers.leave.reasonLine', { reason: request.reason }) : null,
      tr.t('workers.leave.requestedOn', { date: formatShortDate(request.requested, language) }),
    ]
      .filter(Boolean)
      .join('\n'),
    totals: [
      { label: tr.t('workers.leave.daysRequested'), value: days(request.days, tr) },
      ...(open && left !== null
        ? [
            { label: tr.t('workers.leave.leftAfter'), value: days(left - request.days, tr) },
            { label: tr.t('workers.leave.leftNow'), value: days(left, tr) },
          ]
        : []),
    ],
    card: {
      title: leaveStatus(request, tr),
      message: open
        ? tr.t('workers.leave.approveNote')
        : request.status === 'Approved'
          ? tr.t('workers.leave.approvedNote')
          : '',
    },
    open,
  };
}

/** "Privilege Leave · 14 days left", or "Leave Without Pay · unpaid". */
export function balanceLabel(balance: LeaveBalance, tr: Translator): string {
  return balance.left === null
    ? tr.t('workers.leave.unpaid', { type: balance.type })
    : tr.t('workers.leave.typeLeft', { type: balance.type, days: days(balance.left, tr) });
}

/** "3 days · 11 left after", under the dates once Frappe HR has counted them. */
export function daysSummary(count: number, left: number | null, tr: Translator): string {
  return left === null
    ? days(count, tr)
    : tr.t('workers.leave.daysLeftAfter', { days: days(count, tr), left: num(left - count) });
}
