import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import {
  SupplierInvoice,
  SupplierPayment,
  UnpaidSupplierInvoice,
} from '../data-access/purchase.models';
import { invoiceTotals } from './invoice-view';

export function payHeading(invoice: SupplierInvoice, tr: Translator) {
  return {
    title: tr.t('purchase.pay.title'),
    subtitle: tr.t('purchase.pay.subtitle', {
      supplier: invoice.supplierName,
      invoice: invoice.name,
    }),
  };
}

/** "PINV-0068 · Outstanding ILS 270.00" for each invoice that can be paid. */
export function invoiceOptions(
  unpaid: readonly UnpaidSupplierInvoice[],
  currency: string,
  tr: Translator,
): { value: string; label: string }[] {
  return unpaid.map((i) => ({
    value: i.name,
    label: tr.t('purchase.pay.invoiceOption', {
      invoice: i.name,
      amount: formatMoney(i.outstanding, currency),
    }),
  }));
}

export function allocationText(
  amount: number,
  invoice: string,
  currency: string,
  tr: Translator,
): string {
  return tr.t('purchase.pay.allocationValue', {
    amount: formatMoney(Number.isFinite(amount) ? amount : 0, currency),
    invoice,
  });
}

/** "Pay ILS 100.00 from Main bank. The supplier invoice will have ILS 170.00 outstanding. …" */
export function payReview(
  amount: number,
  outstanding: number,
  account: string,
  currency: string,
  tr: Translator,
): string {
  const left = Math.round((outstanding - amount) * 100) / 100;
  return tr.t(left > 0.005 ? 'purchase.pay.review' : 'purchase.pay.reviewFull', {
    amount: formatMoney(amount, currency),
    account,
    left: formatMoney(left, currency),
  });
}

export function payConfirmLabel(amount: number, currency: string, tr: Translator): string {
  return tr.t('purchase.pay.confirm', {
    amount: formatMoney(Number.isFinite(amount) ? amount : 0, currency),
  });
}

export interface PaymentResultView {
  title: string;
  subtitle: string;
  chip: { label: string; tone: 'tint' | 'warning' };
  cardTitle: string;
  cardMessage: string;
  totals: TotalRow[];
  paidFrom: string;
}

/**
 * A recorded supplier payment, with the invoice it paid as it stands now: "Payment recorded" right after
 * paying, "Supplier payment" when opened later.
 */
export function paymentResult(
  payment: SupplierPayment,
  invoice: SupplierInvoice,
  recorded: boolean,
  tr: Translator,
): PaymentResultView {
  const money = (value: number) => formatMoney(value, invoice.currency);
  const paidUp = invoice.outstanding <= 0.005;
  const params = {
    amount: money(payment.amount),
    total: money(invoice.total),
    left: money(invoice.outstanding),
    order: invoice.order ?? invoice.name,
  };
  const message = recorded
    ? paidUp
      ? 'purchase.payment.recordedMessageFull'
      : 'purchase.payment.recordedMessage'
    : paidUp
      ? 'purchase.payment.pageMessageFull'
      : 'purchase.payment.pageMessage';
  const ref = invoice.billNo ?? invoice.name;
  return {
    title: tr.t(recorded ? 'purchase.payment.recordedTitle' : 'purchase.payment.pageTitle'),
    subtitle: (recorded ? [ref, invoice.supplierName] : [invoice.order, ref, invoice.supplierName])
      .filter(Boolean)
      .join(' · '),
    chip: {
      label: tr.t(paidUp ? 'purchase.payment.full' : 'purchase.payment.partial'),
      tone: paidUp ? 'tint' : 'warning',
    },
    cardTitle: tr.t('purchase.payment.recordedCard', params),
    cardMessage: tr.t(message, params),
    totals: invoiceTotals(invoice.total, invoice.outstanding, invoice.currency, tr),
    paidFrom: payment.paidFrom,
  };
}
