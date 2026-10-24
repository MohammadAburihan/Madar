import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import { TableRow } from '../../../shared/ui/data-table.component';
import { OpenBalance, PaymentRecord } from '../data-access/money-api.service';

export function matches(payment: PaymentRecord, term: string): boolean {
  const query = term.trim().toLowerCase();
  return (
    !query ||
    [payment.name, payment.party, payment.account, ...payment.invoices].some((value) =>
      value.toLowerCase().includes(query),
    )
  );
}

export function paymentCard(payment: PaymentRecord, currency: string, tr: Translator) {
  const amount = formatMoney(payment.amount, currency);
  if (payment.direction === 'expense') {
    return {
      title: tr.t('money.expenseRecord', { payment: payment.name, amount }),
      message: [
        tr.t('money.partyAccount', { party: payment.party, account: payment.account }),
        tr.t(payment.receipt ? 'money.receiptAttached' : 'money.receiptMissing'),
      ].join('\n'),
    };
  }
  return {
    title: tr.t(payment.direction === 'received' ? 'money.received' : 'money.paid', {
      payment: payment.name,
      amount,
    }),
    message: [
      tr.t('money.partyAccount', { party: payment.party, account: payment.account }),
      payment.invoices.length
        ? tr.t('money.allocatedTo', {
            invoices: payment.invoices.map((v) => tr.isolate(v)).join(', '),
          })
        : tr.t('money.notAllocated'),
    ].join('\n'),
  };
}

export function paymentRow(payment: PaymentRecord, currency: string, tr: Translator): TableRow {
  return {
    id: payment.name,
    cells: [
      tr.t('money.recordName', { record: payment.name, party: payment.party }),
      payment.account,
      formatMoney(payment.amount, currency),
      tr.t(`money.status.${payment.status}`),
    ],
  };
}

export function balanceCard(
  balance: OpenBalance,
  side: 'customer' | 'supplier',
  currency: string,
  tr: Translator,
) {
  const plain = (amount: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      amount,
    );
  return {
    title: tr.t(`money.${side}Due`, {
      party: balance.party,
      amount: formatMoney(balance.outstanding, currency),
    }),
    message: tr.t(`money.${side}DueDetail`, {
      invoice: balance.invoice,
      total: plain(balance.total),
      paid: plain(balance.total - balance.outstanding),
    }),
  };
}
