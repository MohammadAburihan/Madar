import { formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import { OpeningBlock } from '../data-access/opening-balance-api.service';
import { ContactKind } from '../data-access/contacts.models';

export interface OpeningSummary {
  kind: ContactKind;
  name: string;
  amount: number;
  /** `YYYY-MM-DD`. */
  date: string;
  note: string;
}

const t = (tr: Translator, key: string, params?: Record<string, unknown>) =>
  tr.t(`contacts.opening.${key}`, params);

export function openingSubtitle(kind: ContactKind, name: string, tr: Translator): string {
  return t(tr, `subtitle.${kind === 'customers' ? 'customers' : 'suppliers'}`, { name });
}

/** The review card's sentence and the detail rows. */
export function openingReview(
  opening: OpeningSummary,
  currency: string,
  language: Language,
  tr: Translator,
): { title: string; message: string; rows: TotalRow[] } {
  const amount = formatMoney(opening.amount, currency);
  const date = formatShortDate(opening.date, language);
  return {
    title: t(tr, `card.${opening.kind}`, { name: opening.name, amount }),
    message: t(tr, `cardMessage.${opening.kind}`, { name: opening.name, amount, date }),
    rows: [
      { label: t(tr, 'rows.direction'), value: t(tr, `direction.${opening.kind}`) },
      { label: t(tr, 'rows.amount'), value: amount },
      { label: t(tr, 'rows.date'), value: date },
      { label: t(tr, 'rows.note'), value: opening.note.trim() || t(tr, 'none') },
    ],
  };
}

/** The recorded step: what was posted, in the company currency as ERPNext holds it. */
export function openingRecorded(
  invoice: string,
  total: number,
  opening: OpeningSummary,
  currency: string,
  language: Language,
  tr: Translator,
): { subtitle: string; title: string; message: string } {
  return {
    subtitle: `${invoice} · ${opening.name}`,
    title: t(tr, 'recordedCard', { amount: formatMoney(total, currency) }),
    message: t(tr, `recordedMessage.${opening.kind}`, {
      name: opening.name,
      invoice,
      date: formatShortDate(opening.date, language),
    }),
  };
}

export function openingBlockNotice(block: OpeningBlock, tr: Translator) {
  return { title: t(tr, `blocked.${block}.title`), message: t(tr, `blocked.${block}.message`) };
}
