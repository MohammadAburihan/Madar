import { formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { AttendanceStatus, SheetRow } from '../data-access/workers.models';

export const STATUSES: AttendanceStatus[] = ['Present', 'Absent', 'Half Day', 'Work From Home'];

/** The sheet's row: "Khaled Omar · Gardener", and for a row that can't be marked, why. */
export function sheetRowView(row: SheetRow, language: Language, tr: Translator) {
  return {
    id: row.id,
    label: [row.name, row.designation].filter(Boolean).join(' · '),
    note:
      row.state.kind === 'leave'
        ? tr.t('workers.today.onLeaveUntil', { date: formatShortDate(row.state.until, language) })
        : row.state.kind === 'marked'
          ? tr.t('workers.attendance.marked', {
              status: tr.t(`workers.attendance.statuses.${row.state.status}`),
            })
          : row.state.kind === 'draft'
            ? tr.t('workers.attendance.draft', {
                status: tr.t(`workers.attendance.statuses.${row.state.status}`),
              })
            : null,
  };
}

export function statusOptions(tr: Translator) {
  return STATUSES.map((s) => ({ value: s, label: tr.t(`workers.attendance.statuses.${s}`) }));
}

/** "Save attendance · 2 workers". */
export function saveLabel(count: number, tr: Translator): string {
  return tr.t('workers.attendance.save', {
    workers: tr.plural('workers.attendance.workers', count),
  });
}
