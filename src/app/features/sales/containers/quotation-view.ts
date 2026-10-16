import { htmlText } from '../../../core/erpnext/html-pdf.service';
import { formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { QuotationDetail } from '../data-access/quotation.models';

const qty = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);

/** "Confirmed · ILS 320.00" / "2 × Olive tree + 1 × Garden consultation. No stock movement, invoice or payment." */
export function quotationSummary(quotation: QuotationDetail, currency: string, tr: Translator) {
  const state =
    quotation.docstatus === 0
      ? tr.t('sales.records.draft')
      : tr.t(`sales.records.quoteStatus.${quoteState(quotation.status)}`);
  return {
    title: tr.t('sales.quote.cardTitle', { state, total: formatMoney(quotation.total, currency) }),
    message: tr.t('sales.quote.cardMessage', {
      items: quotation.lines.map((l) => `${qty(l.qty)} × ${l.name}`).join(' + '),
    }),
  };
}

export function quoteState(status: string): 'open' | 'ordered' | 'lost' | 'expired' {
  return status === 'Ordered' || status === 'Partially Ordered'
    ? 'ordered'
    : status === 'Lost'
      ? 'lost'
      : status === 'Expired'
        ? 'expired'
        : 'open';
}

/** The quotation as a self-contained HTML page for the PDF the customer receives, in the reader's language. */
export function quotationHtml(
  quotation: QuotationDetail,
  business: string,
  currency: string,
  language: Language,
  tr: Translator,
): string {
  const t = (key: string, params?: Record<string, unknown>) =>
    htmlText(tr.t(`sales.quote.pdf.${key}`, params));
  const rows = quotation.lines
    .map(
      (l) =>
        `<tr><td>${htmlText(l.name)}</td><td class="num">${qty(l.qty)}</td><td class="num">${htmlText(formatMoney(l.rate, currency))}</td><td class="num">${htmlText(formatMoney(l.amount, currency))}</td></tr>`,
    )
    .join('');
  const valid = quotation.validTill
    ? `<p>${t('validUntil', { date: formatShortDate(quotation.validTill, language) })}</p>`
    : '';
  return `<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
body{font-family:sans-serif;font-size:12px;color:#1c2b27}h1{font-size:20px;margin:0 0 4px}p{color:#5b6b66;margin:0 0 8px}
table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:6px 8px;border-bottom:1px solid #dfe5e2;text-align:start}
th{background:#e4f0eb}.num{text-align:end;direction:ltr;unicode-bidi:isolate}.total{font-size:16px;font-weight:600;color:#1c2b27}
</style></head><body><h1>${t('title', { name: quotation.name })}</h1>
<p>${htmlText(business)} · ${t('for', { customer: quotation.customerName })} · ${htmlText(formatShortDate(quotation.date, language))}</p>${valid}
<table><thead><tr><th>${t('item')}</th><th class="num">${t('qty')}</th><th class="num">${t('rate')}</th><th class="num">${t('amount')}</th></tr></thead><tbody>${rows}</tbody></table>
<p class="total">${t('total', { amount: formatMoney(quotation.total, currency) })}</p>
<p>${t('note')}</p></body></html>`;
}
