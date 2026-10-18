import { formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { ApprovalDetail, ApprovalItem } from '../data-access/approvals.models';

/** Buying documents whose amounts are costs: shown only to roles that see costs. */
const BUYING = new Set([
  'Purchase Order',
  'Purchase Invoice',
  'Purchase Receipt',
  'Material Request',
  'Supplier Quotation',
  'Request for Quotation',
]);

function amountShown(item: ApprovalItem, seeCosts: boolean): number | null {
  return !seeCosts && BUYING.has(item.doctype) ? null : item.amount;
}

/** The doctype in the user's words where Madar knows it; otherwise as ERPNext names it. */
export function doctypeLabel(doctype: string, tr: Translator): string {
  const key = `approvals.doctypes.${doctype}`;
  const label = tr.t(key);
  return label === key ? doctype : label;
}

/** Leave requests carry Frappe HR's status, worded as on the Workers pages; workflow states as ERPNext names them. */
function stateLabel(item: ApprovalItem, tr: Translator): string {
  if (item.doctype !== 'Leave Application') {
    return item.state;
  }
  const key = `workers.leave.status.${item.state}`;
  const label = tr.t(key);
  return label === key ? item.state : label;
}

/** "Expense claim · Rana Saleh", "HR-EXP-2026-00003 · 17 Oct 2026", "ILS 120.00 · Draft". */
export function approvalCard(
  item: ApprovalItem,
  currency: string,
  language: Language,
  tr: Translator,
  seeCosts: boolean,
) {
  const amount = amountShown(item, seeCosts);
  return {
    id: `${item.doctype}/${item.name}`,
    title: `${doctypeLabel(item.doctype, tr)} · ${item.title}`,
    meta: item.date ? `${item.name} · ${formatShortDate(item.date, language)}` : item.name,
    balance: [amount === null ? null : formatMoney(amount, currency), stateLabel(item, tr)]
      .filter(Boolean)
      .join(' · '),
  };
}

export function approvalView(
  detail: ApprovalDetail,
  currency: string,
  language: Language,
  tr: Translator,
  seeCosts: boolean,
) {
  const amount = amountShown(detail, seeCosts);
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
      amount === null
        ? []
        : [{ label: tr.t('approvals.amount'), value: formatMoney(amount, currency) }],
  };
}
