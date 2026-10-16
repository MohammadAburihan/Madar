import { formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import {
  ContactInfo,
  ContactKind,
  ContactRow,
  CustomerDetail,
  HistoryEntry,
  SupplierDetail,
} from '../data-access/contacts.models';

const qty = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);

/** "059-000-0142 · Ramallah" / "Outstanding ILS 200.00", as on the customer list mock. */
export function contactCard(row: ContactRow, currency: string, tr: Translator) {
  return {
    id: row.id,
    title: row.name,
    meta: [row.phone, row.city].filter(Boolean).join(' · ') || null,
    balance:
      row.outstanding === null
        ? null
        : tr.t('contacts.outstanding', { amount: formatMoney(row.outstanding, currency) }),
  };
}

/** The desktop table: name · city · outstanding (the last only where the role sees it). */
export function contactRow(row: ContactRow, currency: string): string[] {
  return [
    row.name,
    row.city ?? '',
    ...(row.outstanding === null ? [] : [formatMoney(row.outstanding, currency)]),
  ];
}

/** Phone, email and the address lines, one per line; repeated lines (street and city alike) once. */
export function contactLines(contact: ContactInfo): string {
  const lines = [contact.phone, contact.email, ...contact.address].filter((l): l is string => !!l);
  return lines.filter((l, i) => lines.indexOf(l) === i).join('\n');
}

export function contactSubtitle(kind: ContactKind, id: string, tr: Translator): string {
  return tr.t(kind === 'customers' ? 'contacts.customerSubtitle' : 'contacts.supplierSubtitle', {
    id,
  });
}

/** ERPNext's invoice status in the words of the sales pages. */
function paymentState(status: string, tr: Translator): string {
  const key =
    status === 'Paid'
      ? 'paid'
      : status.startsWith('Partly Paid')
        ? 'partlyPaid'
        : status === 'Credit Note Issued'
          ? 'creditNote'
          : 'unpaid';
  return tr.t(`contacts.payment.${key}`);
}

/** The customer's totals, latest sale and recent activity. */
export function customerView(
  customer: CustomerDetail,
  currency: string,
  language: Language,
  tr: Translator,
) {
  const t = (key: string, params?: Record<string, unknown>) => tr.t(`contacts.${key}`, params);
  const money = (value: number) => formatMoney(value, currency);
  return {
    totals: customer.totals
      ? [
          { label: t('invoiceTotal'), value: money(customer.totals.invoiced) },
          { label: t('amountPaid'), value: money(customer.totals.paid) },
          { label: t('outstandingLabel'), value: money(customer.totals.outstanding), accent: true },
        ]
      : [],
    due:
      customer.totals && customer.totals.outstanding > 0.005
        ? t('due', { amount: money(customer.totals.outstanding) })
        : null,
    latest: customer.latest
      ? {
          title: t('latestSale', { name: customer.latest.name }),
          message: `${t('latestConfirmed', {
            date: formatShortDate(customer.latest.date, language),
          })}\n${paymentState(customer.latest.status, tr)}`,
          summary: t('latestSummary', {
            name: customer.latest.name,
            invoiced: money(customer.latest.total),
            paid: money(Math.max(customer.latest.total - customer.latest.outstanding, 0)),
          }),
        }
      : null,
    recent: customer.recent.map(
      (r) => `${formatShortDate(r.date, language)} · ${r.name} · ${money(r.amount)}`,
    ),
  };
}

/** The supplier's balance, oldest unpaid invoice and open order. */
export function supplierView(supplier: SupplierDetail, currency: string, tr: Translator) {
  const t = (key: string, params?: Record<string, unknown>) => tr.t(`contacts.${key}`, params);
  const money = (value: number) => formatMoney(value, currency);
  const order = supplier.openOrder;
  return {
    balance:
      supplier.outstanding === null
        ? null
        : {
            title: t('outstanding', { amount: money(supplier.outstanding) }),
            message: supplier.unpaid
              ? t('unpaidInvoice', {
                  name: supplier.unpaid.name,
                  total: money(supplier.unpaid.total),
                  paid: money(supplier.unpaid.paid),
                  remaining: money(supplier.unpaid.remaining),
                })
              : t('nothingDue'),
          },
    order: order
      ? {
          title: t('openOrder'),
          message: t('openOrderProgress', {
            name: order.name,
            ordered: qty(order.ordered),
            received: qty(order.received),
            billed: qty(order.billed),
            left: qty(Math.max(order.ordered - order.received, 0)),
          }),
        }
      : null,
  };
}

const plain = (value: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  );

/** One line of the transaction history, as on the history mock. */
export function historyCard(
  entry: HistoryEntry,
  kind: ContactKind,
  currency: string,
  tr: Translator,
): { title: string; message: string } {
  const t = (key: string, params?: Record<string, unknown>) =>
    tr.t(`contacts.history.${key}`, params);
  const money = (value: number) => formatMoney(value, currency);
  switch (entry.kind) {
    case 'invoice':
      return {
        title: `${entry.name} · ${money(entry.amount ?? 0)}`,
        message: `${t('invoiceState', { state: paymentState(entry.status, tr) })}\n${t('paidDue', {
          // What credit notes took off isn't money received.
          paid: plain(Math.max((entry.amount ?? 0) - entry.outstanding - entry.credited, 0)),
          due: plain(entry.outstanding),
        })}`,
      };
    case 'return':
      return { title: `${entry.name} · ${money(entry.amount ?? 0)}`, message: t('creditNote') };
    case 'payment':
      return {
        title: `${entry.name} · ${money(entry.amount ?? 0)}`,
        message: [
          t(kind === 'customers' ? 'customerPayment' : 'supplierPayment', {
            account: entry.place ?? '',
          }),
          entry.invoices.length ? t('allocated', { invoices: entry.invoices.join(', ') }) : null,
        ]
          .filter(Boolean)
          .join('\n'),
      };
    case 'delivery':
      return {
        title: `${entry.name} · ${tr.plural('contacts.history.units', entry.qty, { count: qty(entry.qty) })}`,
        // Rows may each carry their own warehouse; then the note has none to name.
        message: [
          t(
            kind === 'customers'
              ? entry.status === 'Return'
                ? 'goodsReturned'
                : 'goodsDelivered'
              : entry.status === 'Return'
                ? 'goodsSentBack'
                : 'goodsReceived',
          ),
          entry.place,
        ]
          .filter(Boolean)
          .join(' · '),
      };
  }
}
