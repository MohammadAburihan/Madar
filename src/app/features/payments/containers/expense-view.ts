import { formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import { ReceiptState } from '../data-access/expense.store';

export interface ExpenseSummary {
  category: string;
  amount: number;
  /** `YYYY-MM-DD`. */
  date: string;
  account: string;
  project: string | null;
  hasReceipt: boolean;
}

/** The review card's sentence and the detail rows, as on the review-expense mock. */
export function expenseReview(
  expense: ExpenseSummary,
  currency: string,
  language: Language,
  tr: Translator,
): { message: string; rows: TotalRow[] } {
  const amount = formatMoney(expense.amount, currency);
  return {
    message: tr.t('expense.cardMessage', {
      amount,
      account: expense.account,
      category: expense.category,
      receipt: tr.t(expense.hasReceipt ? 'expense.receiptSentence' : 'expense.noReceiptSentence'),
    }),
    rows: [
      { label: tr.t('expense.rows.category'), value: expense.category },
      { label: tr.t('expense.rows.amount'), value: amount },
      { label: tr.t('expense.rows.date'), value: formatShortDate(expense.date, language) },
      { label: tr.t('expense.rows.account'), value: expense.account },
      { label: tr.t('expense.rows.project'), value: expense.project ?? tr.t('expense.none') },
      {
        label: tr.t('expense.rows.receipt'),
        value: tr.t(expense.hasReceipt ? 'expense.toAttach' : 'expense.notAttached'),
      },
    ],
  };
}

const RECEIPT_SENTENCE: Record<ReceiptState, string> = {
  none: 'expense.receiptNone',
  attaching: 'expense.receiptAttaching',
  attached: 'expense.receiptAttached',
  failed: 'expense.receiptFailed',
};

/** "ILS 36.50 expense recorded" / "Paid from Main cash on 11 Oct 2026. No receipt was attached." */
export function expenseRecorded(
  name: string,
  expense: ExpenseSummary,
  receipt: ReceiptState,
  currency: string,
  language: Language,
  tr: Translator,
) {
  return {
    subtitle: `${name} · ${expense.category}`,
    cardTitle: tr.t('expense.recordedCard', { amount: formatMoney(expense.amount, currency) }),
    cardMessage: tr.t('expense.recordedMessage', {
      account: expense.account,
      date: formatShortDate(expense.date, language),
      receipt: tr.t(RECEIPT_SENTENCE[receipt]),
    }),
    project: expense.project ?? tr.t('expense.none'),
  };
}
