import { formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { ApprovalDetail, ApprovalItem } from '../data-access/approvals.models';

/** The doctype in the user's words where Madar knows it; otherwise as ERPNext names it. */
export function doctypeLabel(doctype: string, tr: Translator): string {
  const key = `approvals.doctypes.${doctype}`;
  const label = tr.t(key);
  return label === key ? doctype : label;
}

/** "Expense claim · Rana Saleh", "HR-EXP-2026-00003 · 17 Oct 2026", "ILS 120.00 · Draft". */
export function approvalCard(
  item: ApprovalItem,
  currency: string,
  language: Language,
  tr: Translator,
) {
  return {
    id: `${item.doctype}/${item.name}`,
    title: `${doctypeLabel(item.doctype, tr)} · ${item.title}`,
    meta: item.date ? `${item.name} · ${formatShortDate(item.date, language)}` : item.name,
    balance: [item.amount === null ? null : formatMoney(item.amount, currency), item.state]
      .filter(Boolean)
      .join(' · '),
  };
}

export function approvalView(
  detail: ApprovalDetail,
  currency: string,
  language: Language,
  tr: Translator,
) {
  return {
    title: detail.title,
    subtitle: `${doctypeLabel(detail.doctype, tr)} · ${detail.name}`,
    lines: [
      ...detail.lines,
      detail.date
        ? tr.t('approvals.dated', { date: formatShortDate(detail.date, language) })
        : null,
      tr.t('approvals.stateLine', { state: detail.state }),
    ]
      .filter(Boolean)
      .join('\n'),
    totals:
      detail.amount === null
        ? []
        : [{ label: tr.t('approvals.amount'), value: formatMoney(detail.amount, currency) }],
  };
}
