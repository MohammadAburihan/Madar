import { Signal, computed, signal } from '@angular/core';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { DateRange } from '../data-access/report.models';
import { PERIOD_KINDS, PeriodKind, periodOptions, periodRange, validRange } from './reports-view';

/** A report period: one of the presets or custom dates, following the site's today. */
export function createPeriod(
  today: Signal<Date | null>,
  tr: Signal<Translator>,
  language: Signal<Language>,
) {
  const kind = signal<PeriodKind>('thisMonth');
  const custom = signal<DateRange | null>(null);
  const range = computed(() => periodRange(kind(), today() ?? new Date(), custom()));
  return {
    kind: kind.asReadonly(),
    range,
    /** A preset, or custom dates in order. */
    usable: computed(() => kind() !== 'custom' || validRange(custom())),
    error: computed(() =>
      kind() === 'custom' && !validRange(custom()) ? tr().t('reports.period.invalid') : null,
    ),
    options: computed(() => periodOptions(today() ?? new Date(), custom(), language(), tr())),
    kinds: computed(() =>
      PERIOD_KINDS.map((k) => ({ value: k, label: tr().t(`reports.period.${k}`) })),
    ),
    setKind(value: string | null): void {
      if (!value || !PERIOD_KINDS.includes(value as PeriodKind)) {
        return;
      }
      if (value === 'custom' && !custom()) {
        // Start from the period shown, so switching to Custom changes nothing until a date does.
        custom.set(range());
      }
      kind.set(value as PeriodKind);
    },
    setCustom(end: 'from' | 'to', value: string): void {
      custom.set({ ...range(), [end]: value });
      kind.set('custom');
    },
  };
}
