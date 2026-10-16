import { formatMoney } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';
import {
  ReturnLine,
  ReturnRequest,
  ReturnResult,
  ReturnSource,
  creditFor,
} from '../data-access/sales-return.models';

const qty = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
const amount = (value: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  );

type Quantities = Record<string, number>;

/** "Return from sale" / "Original invoice SI-1042 · Lina Haddad". */
export function returnHeading(source: ReturnSource, tr: Translator) {
  return {
    title: tr.t('sales.return.title'),
    subtitle: tr.t('sales.return.subtitle', {
      invoice: source.invoice,
      customer: source.customerName,
    }),
  };
}

/** "Sold 2 · Returned 0" / "Return 1 × ILS 85.00". */
export function returnLineCard(line: ReturnLine, now: number, currency: string, tr: Translator) {
  return {
    title: line.name,
    meta: tr.t('sales.return.lineMeta', {
      sold: qty(line.sold),
      returned: qty(line.sold - line.returnable),
    }),
    detail: tr.t('sales.return.lineDetail', {
      qty: qty(now || 0),
      rate: formatMoney(line.rate, currency),
    }),
  };
}

export function returnQtyLabel(line: ReturnLine, lineCount: number, tr: Translator): string {
  return lineCount > 1
    ? tr.t('sales.return.qtyFor', { code: line.code })
    : tr.t('sales.return.qty');
}

const listed = (lines: readonly ReturnLine[], quantities: Quantities) =>
  lines
    .filter((l) => (quantities[l.row] || 0) > 0)
    .map((l) => `${qty(quantities[l.row])} × ${l.name}`)
    .join(' + ');

/**
 * "Credit ILS 85.00 and return 1 × Olive tree to stock. Original payment stays ILS 120.00. New outstanding
 * balance: ILS 115.00." ERPNext keeps a credit larger than what is owed on the note, as the customer's credit.
 */
export function returnSummary(
  source: ReturnSource,
  lines: readonly ReturnLine[],
  quantities: Quantities,
  currency: string,
  tr: Translator,
): string {
  const t = (key: string, params?: Record<string, unknown>) => tr.t(`sales.return.${key}`, params);
  const credit = creditFor(lines, quantities);
  const goods = listed(
    lines.filter((l) => l.isStock && source.movesStock),
    quantities,
  );
  const paid = source.paid;
  return [
    goods
      ? t('summaryGoods', { credit: formatMoney(credit, currency), goods })
      : t('summaryCredit', { credit: formatMoney(credit, currency) }),
    t('summaryPaid', { paid: formatMoney(paid, currency) }),
    credit <= source.outstanding + 0.005
      ? t('summaryDue', { due: formatMoney(source.outstanding - credit, currency) })
      : t('summaryCustomerCredit'),
  ].join(' ');
}

/** "Credit posted · ILS 85.00" / "1 × Olive tree returned to Main warehouse. … Due reduced 200.00 → 115.00." */
export function returnDone(
  source: ReturnSource,
  sent: ReturnRequest,
  result: ReturnResult,
  warehouse: string,
  currency: string,
  tr: Translator,
) {
  const t = (key: string, params?: Record<string, unknown>) => tr.t(`sales.return.${key}`, params);
  const quantities = Object.fromEntries(sent.lines.map((l) => [l.row, l.qty]));
  const goods = listed(
    source.lines.filter((l) => l.isStock && source.movesStock),
    quantities,
  );
  const paid = source.paid;
  const reduced = result.dueAfter < source.outstanding - 0.005;
  return {
    title: t('doneTitle'),
    subtitle: t('doneSubtitle', { invoice: source.invoice, customer: source.customerName }),
    cardTitle: t('doneCard', { credit: formatMoney(result.credit, currency) }),
    cardMessage: [
      goods
        ? sent.warehouse
          ? t('doneGoods', { goods, warehouse })
          : t('doneGoodsAsSold', { goods })
        : null,
      t('donePaid', { paid: amount(paid) }),
      reduced
        ? t('doneDue', { before: amount(source.outstanding), after: amount(result.dueAfter) })
        : t('doneCustomerCredit'),
      t('doneNoRefund'),
    ]
      .filter(Boolean)
      .join(' '),
  };
}
