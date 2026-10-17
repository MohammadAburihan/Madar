import { formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { ShiftType } from '../data-access/workers.models';

/** "Morning · 07:00–15:00"; times stay a left-to-right run in Arabic too. */
export function shiftLabel(shift: ShiftType): string {
  return shift.start ? `${shift.name} · ⁦${shift.start}–${shift.end}⁩` : shift.name;
}

/** The worker page's line: "Shift: Morning · 07:00–15:00", or that none is assigned. */
export function shiftLine(shift: ShiftType | null, tr: Translator): string {
  return shift
    ? tr.t('workers.shift.current', { shift: shiftLabel(shift) })
    : tr.t('workers.shift.none');
}

/** "From 26 Oct 2026: Evening · 13:00–21:00", for a change already saved. */
export function nextShiftLine(
  next: { shift: ShiftType; from: string },
  language: Language,
  tr: Translator,
): string {
  return tr.t('workers.shift.next', {
    date: formatShortDate(next.from, language),
    shift: shiftLabel(next.shift),
  });
}
