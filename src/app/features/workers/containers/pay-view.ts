import { formatMoney } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { PayRow } from '../data-access/workers.models';

/** "October 2026", the month a `YYYY-MM-01` date starts. */
export function monthLabel(month: string, language: Language): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, 1));
}

/** The month's card for a worker: their slip's pay and state, or that a salary has to be set first. */
export function payCard(row: PayRow, currency: string, tr: Translator) {
  const money = (amount: number) => formatMoney(amount, currency);
  return {
    id: row.id,
    title: row.name,
    meta: row.slip
      ? tr.t('workers.payroll.grossNet', { gross: money(row.slip.gross), net: money(row.slip.net) })
      : row.hasSalary
        ? tr.t('workers.payroll.noSlip')
        : tr.t('workers.payroll.noSalary'),
    balance: row.slip
      ? tr.t(row.slip.confirmed ? 'workers.payroll.confirmed' : 'workers.payroll.draft')
      : row.hasSalary
        ? null
        : tr.t('workers.payroll.setSalary'),
  };
}

/** "Create 2 salary slips", "Confirm 1 draft slip". */
export function payActions(rows: PayRow[], tr: Translator) {
  const toMake = rows.filter((r) => r.hasSalary && !r.slip).length;
  const drafts = rows.filter((r) => r.slip && !r.slip.confirmed).length;
  return {
    toMake,
    drafts,
    make: tr.plural('workers.payroll.make', toMake),
    confirm: tr.plural('workers.payroll.confirm', drafts),
  };
}
