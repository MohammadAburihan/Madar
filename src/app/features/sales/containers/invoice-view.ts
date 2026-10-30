import { formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { InvoiceDetail } from '../data-access/invoice-api.service';
import { paymentStatusOf } from './quick-sale-view';

type Tone = 'tint' | 'warning' | 'danger';

export function invoiceView(
  invoice: InvoiceDetail,
  after: string | null,
  currency: string,
  language: Language,
  tr: Translator,
) {
  const money = (amount: number) => formatMoney(amount, currency);
  // Credit notes lower the outstanding too, but pay nothing: they aren't counted as paid.
  const credited = invoice.credited;
  const paid = Math.max(
    Math.round((invoice.total - invoice.outstanding - credited) * 100) / 100,
    0,
  );
  const payment =
    // Settled to the cent by a credit; a negative outstanding is a refund still owed, not a credit settlement.
    Math.abs(invoice.outstanding) <= 0.005 && credited > 0.005
      ? 'credited'
      : paymentStatusOf(paid, invoice.total - credited);
  const count = invoice.payments.length;
  const accounts = [...new Set(invoice.payments.map((p) => p.account))];
  const chips: { label: string; tone: Tone }[] = [
    {
      label: tr.t(`invoice.status.${invoice.status}`),
      tone: invoice.status === 'cancelled' ? 'danger' : 'tint',
    },
  ];
  if (invoice.status === 'confirmed') {
    chips.push({
      label: tr.t(`invoice.payment.${payment}`),
      tone:
        payment === 'paid' || payment === 'credited'
          ? 'tint'
          : payment === 'partial'
            ? 'warning'
            : 'danger',
    });
  }
  if (invoice.opening) {
    chips.push({ label: tr.t('invoice.opening'), tone: 'tint' });
  }
  if (invoice.delivered) {
    chips.push({ label: tr.t('invoice.goods'), tone: 'tint' });
  }
  const received =
    accounts.length === 1
      ? tr.t(
          count === 1
            ? 'invoice.receivedIn'
            : count === 2
              ? 'invoice.receivedBoth'
              : 'invoice.receivedAll',
          {
            accounts: accounts[0],
          },
        )
      : null;
  return {
    title: tr.t('invoice.title', { invoice: invoice.name }),
    subtitle: after
      ? tr.t('invoice.after', { customer: invoice.customerName, payment: after })
      : tr.t('invoice.subtitle', {
          customer: invoice.customerName,
          date: formatShortDate(invoice.postingDate, language),
        }),
    chips,
    totals: [
      { label: tr.t('sale.review.invoiceTotal'), value: money(invoice.total) },
      { label: tr.t('sale.review.amountPaid'), value: money(paid) },
      ...(credited > 0.005 ? [{ label: tr.t('invoice.credited'), value: money(credited) }] : []),
      { label: tr.t('sale.review.outstanding'), value: money(invoice.outstanding) },
    ],
    payments: {
      title: count
        ? count === 2
          ? tr.t('invoice.paymentsTwo')
          : tr.plural('invoice.payments', count)
        : tr.t('invoice.noPayments'),
      message: [
        ...invoice.payments.map((p) =>
          tr.t('invoice.paymentLine', { payment: p.name, amount: money(p.amount) }),
        ),
        ...(received ? [received] : []),
      ].join('\n'),
    },
  };
}

/** A quick-sale draft of this business (and, for a role limited to its own sales, this user's) can be continued. */
export function canContinueSale(
  invoice: InvoiceDetail,
  scope: { sell: boolean; company: string; owner: string | null },
): boolean {
  return (
    scope.sell &&
    invoice.status === 'draft' &&
    invoice.quickSale &&
    !!invoice.saleReference &&
    invoice.company === scope.company &&
    (!scope.owner || invoice.owner === scope.owner)
  );
}
