import { CustomerOption } from '../../../core/customers/customer-directory.service';
import { daysUntil, formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import { Allocation, CollectionResult, UnpaidInvoice } from '../data-access/collection.models';

export interface CardView {
  title: string;
  message: string;
}

export interface PersonView {
  title: string;
  meta: string | null;
  balance: string;
}

export function customerCard(
  customer: CustomerOption,
  currency: string,
  tr: Translator,
): PersonView {
  const details = [customer.phone, customer.city].filter(Boolean).join(' · ');
  return {
    title: customer.name,
    meta: details ? tr.t('collect.customerMeta', { details }) : tr.t('collect.customerMetaPlain'),
    balance:
      customer.unpaidInvoices > 0
        ? tr.plural('collect.balance', customer.unpaidInvoices, {
            amount: formatMoney(customer.outstanding, currency),
          })
        : tr.t('collect.noBalance'),
  };
}

export function invoiceCard(
  invoice: UnpaidInvoice,
  currency: string,
  today: Date,
  language: Language,
  tr: Translator,
): { title: string; detail: string } {
  const amount = formatMoney(invoice.outstanding, currency);
  const status =
    invoice.dueDate && daysUntil(invoice.dueDate, today) < 0
      ? 'overdue'
      : invoice.outstanding < invoice.total
        ? 'partial'
        : 'unpaid';
  return {
    title: tr.t('collect.invoiceTitle', {
      invoice: invoice.name,
      date: formatShortDate(invoice.postingDate, language),
    }),
    detail: tr.t(`collect.invoiceStatus.${status}`, { amount }),
  };
}

export function dueRows(
  due: number,
  amount: number,
  invoices: number,
  currency: string,
  tr: Translator,
): TotalRow[] {
  const receive = Number.isFinite(amount) && amount > 0 ? Math.min(amount, due) : 0;
  return [
    { label: tr.plural('collect.dueBefore', invoices), value: formatMoney(due, currency) },
    { label: tr.t('collect.receiveNow'), value: formatMoney(receive, currency) },
    {
      label: tr.t('collect.dueAfter'),
      value: formatMoney(Math.max(0, due - receive), currency),
      accent: true,
    },
  ];
}

export function allocationText(
  allocations: readonly Allocation[],
  currency: string,
  tr: Translator,
): string {
  return allocations
    .map((a) =>
      tr.t('collect.allocationLine', {
        invoice: a.invoice,
        amount: formatMoney(a.amount, currency),
      }),
    )
    .join(' + ');
}

/** "Invoice balance after payment" on the review step. */
export function balanceCard(
  invoices: readonly UnpaidInvoice[],
  allocations: readonly Allocation[],
  currency: string,
  tr: Translator,
): CardView {
  const money = (value: number) => formatMoney(value, currency);
  const amount = allocations.reduce((sum, a) => sum + a.amount, 0);
  const due = invoices.reduce((sum, i) => sum + i.outstanding, 0) - amount;
  const title = tr.plural('collect.balanceTitle', allocations.length);
  if (allocations.length === 1) {
    const invoice = invoices.find((i) => i.name === allocations[0].invoice)!;
    const paid = invoice.total - invoice.outstanding;
    const values = {
      total: money(invoice.total),
      paid: money(paid),
      amount: money(amount),
      after: money(paid + amount),
      due: money(invoice.outstanding - amount),
    };
    return {
      title,
      message: tr.t(
        invoice.outstanding - amount > 0 ? 'collect.balanceOne' : 'collect.balanceOneSettled',
        values,
      ),
    };
  }
  return {
    title,
    message: tr.t('collect.balanceMany', {
      amount: money(amount),
      count: allocations.length,
      due: money(Math.max(0, due)),
    }),
  };
}

/** The "collected" card and totals on the recorded step. */
export function recordedView(result: CollectionResult, currency: string, tr: Translator) {
  const money = (value: number) => formatMoney(value, currency);
  const sum = (pick: (i: CollectionResult['invoices'][number]) => number) =>
    result.invoices.reduce((total, invoice) => total + pick(invoice), 0);
  const [only] = result.invoices;
  const due = sum((i) => i.outstanding);
  const message =
    result.invoices.length === 1
      ? tr.t(due > 0 ? 'collect.allocatedOne' : 'collect.allocatedOneSettled', {
          invoice: only.invoice,
          paid: money(only.paid),
          due: money(due),
        })
      : tr.t('collect.allocatedMany', {
          invoices: result.invoices.map((i) => tr.isolate(i.invoice)).join(', '),
          due: money(due),
        });
  return {
    card: { title: tr.t('collect.collected', { amount: money(result.amount) }), message },
    totals: [
      { label: tr.t('sale.review.invoiceTotal'), value: money(sum((i) => i.total)) },
      { label: tr.t('sale.review.amountPaid'), value: money(sum((i) => i.paid)) },
      { label: tr.t('sale.review.outstanding'), value: money(due) },
    ],
  };
}
