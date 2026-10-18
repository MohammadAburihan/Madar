import { formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { WorkerDetail, WorkerRow, WorkerToday } from '../data-access/workers.models';

const num = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);

/** "Present today" / "On leave until 20 Oct 2026"; a worker who isn't active says so instead. */
export function todayLabel(
  row: Pick<WorkerRow, 'status' | 'today'>,
  language: Language,
  tr: Translator,
): string | null {
  if (row.status !== 'Active') {
    return tr.t(`workers.status.${row.status}`);
  }
  return todayText(row.today, language, tr, 'today');
}

function todayText(
  today: WorkerToday | null,
  language: Language,
  tr: Translator,
  form: 'today' | 'cell',
): string | null {
  if (!today) {
    return null;
  }
  if (!today.marked) {
    return tr.t(`workers.${form}.notMarked`);
  }
  if ('until' in today) {
    return tr.t('workers.today.onLeaveUntil', { date: formatShortDate(today.until, language) });
  }
  return tr.t(`workers.${form}.${today.status}`);
}

/** The phone card: name, job and department, and how they are today. */
export function workerCard(row: WorkerRow, language: Language, tr: Translator) {
  return {
    id: row.id,
    title: row.name,
    meta: [row.designation, row.department].filter(Boolean).join(' · ') || null,
    balance: todayLabel(row, language, tr),
  };
}

/** The desktop table: worker · job title · today (the last only where attendance can be read). */
export function workerRow(row: WorkerRow, language: Language, tr: Translator): string[] {
  const today =
    row.status !== 'Active'
      ? tr.t(`workers.status.${row.status}`)
      : todayText(row.today, language, tr, 'cell');
  return [row.name, row.designation ?? '', ...(today === null ? [] : [today])];
}

export function workerSubtitle(worker: WorkerDetail, tr: Translator): string {
  return worker.designation
    ? tr.t('workers.subtitleDetail', { designation: worker.designation, id: worker.id })
    : worker.id;
}

/** Phone, then department and joining date (and leaving date), one per line. */
export function workerLines(worker: WorkerDetail, language: Language, tr: Translator): string {
  const joined = tr.t('workers.joined', { date: formatShortDate(worker.joined, language) });
  const left =
    worker.status === 'Left' && worker.relieved
      ? tr.t('workers.leftOn', { date: formatShortDate(worker.relieved, language) })
      : null;
  return [worker.phone, [worker.department, joined].filter(Boolean).join(' · '), left]
    .filter(Boolean)
    .join('\n');
}

/** The worker's month at a glance, latest pay and recent attendance; each part only where it's readable. */
export function workerView(
  worker: WorkerDetail,
  currency: string,
  language: Language,
  tr: Translator,
) {
  const days = (count: number) => tr.plural('workers.days', count, { count: num(count) });
  const money = (amount: number) => formatMoney(amount, currency);
  const totals = [
    worker.presentThisMonth === null
      ? null
      : { label: tr.t('workers.presentThisMonth'), value: days(worker.presentThisMonth) },
    worker.leaveLeft === null
      ? null
      : { label: tr.t('workers.leaveLeft'), value: days(worker.leaveLeft) },
    worker.advanceToRepay
      ? { label: tr.t('workers.advanceToRepay'), value: money(worker.advanceToRepay) }
      : null,
    worker.hoursLastWeek
      ? { label: tr.t('workers.hours.lastWeek'), value: num(worker.hoursLastWeek) }
      : null,
  ].filter((r) => !!r);
  const pay = worker.pay
    ? {
        title: tr.t('workers.pay.title', {
          month: new Intl.DateTimeFormat(language === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
            month: 'long',
          }).format(new Date(`${worker.pay.start.slice(0, 10)}T00:00:00`)),
          state: tr.t(`workers.pay.${worker.pay.draft ? 'draft' : 'confirmed'}`),
        }),
        message: tr.t('workers.pay.message', {
          gross: formatMoney(worker.pay.gross, worker.pay.currency || currency),
          net: formatMoney(worker.pay.net, worker.pay.currency || currency),
        }),
      }
    : null;
  // The desktop panel sums the month up in one card: leave left as its title, the rest below.
  const summary = [
    worker.presentThisMonth === null
      ? null
      : tr.t('workers.presentSummary', { days: days(worker.presentThisMonth) }),
    worker.advanceToRepay
      ? tr.t('workers.advanceSummary', { amount: money(worker.advanceToRepay) })
      : null,
  ].filter((s): s is string => !!s);
  return {
    totals,
    pay,
    card:
      worker.leaveLeft !== null
        ? {
            title: tr.t('workers.leaveLeftTitle', { days: days(worker.leaveLeft) }),
            message: summary.join(' · '),
          }
        : summary.length
          ? { title: summary[0], message: summary.slice(1).join(' · ') }
          : null,
    recent: worker.recent.map((r) =>
      tr.t('workers.recent', {
        date: formatShortDate(r.date, language),
        status: tr.t(`workers.cell.${r.status}`),
      }),
    ),
  };
}
