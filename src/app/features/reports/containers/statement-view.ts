import { htmlText } from '../../../core/erpnext/html-pdf.service';
import { formatMoney } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { TableRow } from '../../../shared/ui/data-table.component';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import { PartyKind, Statement, StatementEntry } from '../data-access/report.models';
import { rangeText } from './reports-view';

const amount = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const plain = (value: number) => (value < 0 ? `−${amount.format(-value)}` : amount.format(value));
const signedMoney = (value: number, currency: string) =>
  value < 0 ? `− ${formatMoney(-value, currency)}` : formatMoney(value, currency);

/** "02/09/2026": the glossary's entry-field date format, also used on statements. */
export function slashDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Where Madar can open a statement entry, for the roles that see reports (the owner). */
export function entryRoute(kind: PartyKind, entry: StatementEntry): string[] | null {
  if (entry.voucherType === 'Sales Invoice') {
    return ['/sales/invoices', entry.voucher];
  }
  if (entry.voucherType === 'Purchase Invoice') {
    return ['/purchases/invoice', entry.voucher];
  }
  if (entry.voucherType === 'Payment Entry' && kind === 'supplier') {
    return ['/purchases/payment', entry.voucher];
  }
  return null;
}

/** "Sales invoice · 3 Olive tree", "Payment · Main cash · for SI-1038", "Journal entry". */
export function entryDetail(kind: PartyKind, entry: StatementEntry, tr: Translator): string {
  const t = (key: string, params?: Record<string, unknown>) =>
    tr.t(`statements.details.${key}`, params);
  const item = entry.firstItem
    ? entry.firstItem.more
      ? t('itemMore', {
          qty: entry.firstItem.qty,
          item: entry.firstItem.name,
          more: entry.firstItem.more,
        })
      : t('item', { qty: entry.firstItem.qty, item: entry.firstItem.name })
    : null;
  switch (entry.kind) {
    case 'invoice':
      return [t(kind === 'customer' ? 'salesInvoice' : 'purchaseInvoice'), item]
        .filter(Boolean)
        .join(' · ');
    case 'return':
      return [t('return'), item].filter(Boolean).join(' · ');
    case 'payment':
      return [
        t('payment'),
        entry.account,
        entry.against.length ? t('for', { invoices: entry.against.join(', ') }) : null,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'journal':
      return t('journal');
  }
}

/** Opening balance, invoiced, paid and outstanding, as on the phone's statement mock. */
export function summaryRows(statement: Statement, currency: string, tr: Translator): TotalRow[] {
  const t = (key: string, params?: Record<string, unknown>) => tr.t(`statements.${key}`, params);
  return [
    {
      label: t('openingOn', { date: slashDate(statement.range.from).slice(0, 5) }),
      value: signedMoney(statement.opening, currency),
    },
    { label: t('invoiced'), value: formatMoney(statement.invoiced, currency) },
    {
      label: t('paid'),
      value: statement.paid
        ? `− ${formatMoney(statement.paid, currency)}`
        : formatMoney(0, currency),
    },
    {
      label: t('outstandingOn', { date: slashDate(statement.range.to).slice(0, 5) }),
      value: signedMoney(statement.outstanding, currency),
      accent: true,
    },
  ];
}

/** The desktop's four figures, the outstanding one tinted. */
export function statementMetrics(statement: Statement, currency: string, tr: Translator) {
  const t = (key: string, params?: Record<string, unknown>) => tr.t(`statements.${key}`, params);
  return [
    {
      label: t('opening'),
      value: signedMoney(statement.opening, currency),
      hint: t('onDate', { date: slashDate(statement.range.from) }),
      tint: false,
    },
    {
      label: t('invoiced'),
      value: formatMoney(statement.invoiced, currency),
      hint: tr.plural(`statements.invoiceCount.${statement.kind}`, statement.invoices),
      tint: false,
    },
    {
      label: t('paid'),
      value: formatMoney(statement.paid, currency),
      hint: tr.plural('statements.paymentCount', statement.payments),
      tint: false,
    },
    {
      label: t('outstanding'),
      value: signedMoney(statement.outstanding, currency),
      hint: t('onDate', { date: slashDate(statement.range.to) }),
      tint: true,
    },
  ];
}

/** The phone's entry cards: "Invoice SI-1038", its date, the amount and the balance after it. */
export function entryCards(statement: Statement, currency: string, tr: Translator) {
  return statement.entries.map((entry) => ({
    id: entry.voucher,
    title: tr.t(`statements.entry.${entry.kind}`, { voucher: entry.voucher }),
    date: slashDate(entry.date),
    amount: entry.invoiced
      ? formatMoney(entry.invoiced, currency)
      : `− ${formatMoney(entry.paid, currency)}`,
    balance: tr.t('statements.balanceAfter', { balance: plain(entry.balance) }),
    openable: !!entryRoute(statement.kind, entry),
  }));
}

/** Date · Document · Details · Invoiced · Paid · Balance, between the opening and outstanding lines. */
export function entryRows(statement: Statement, tr: Translator): TableRow[] {
  return [
    {
      id: 'opening',
      cells: [
        slashDate(statement.range.from),
        tr.t('statements.opening'),
        '',
        '',
        '',
        plain(statement.opening),
      ],
    },
    ...statement.entries.map((entry) => ({
      id: entry.voucher,
      cells: [
        slashDate(entry.date),
        entry.voucher,
        entryDetail(statement.kind, entry, tr),
        entry.invoiced ? plain(entry.invoiced) : '',
        entry.paid ? plain(entry.paid) : '',
        plain(entry.balance),
      ],
    })),
    {
      id: 'outstanding',
      cells: [
        slashDate(statement.range.to),
        tr.t('statements.outstanding'),
        '',
        plain(statement.invoiced),
        plain(statement.paid),
        plain(statement.outstanding),
      ],
    },
  ];
}

/** "Rehan Nursery · Lina Haddad · 1 Sep – 14 Oct 2026". */
export function statementSubtitle(
  business: string,
  partyName: string | null,
  statement: Pick<Statement, 'range'>,
  language: Language,
): string {
  return [business, partyName, rangeText(statement.range, language)].filter(Boolean).join(' · ');
}

const escape = htmlText;

/** The statement as a self-contained HTML page for the server's PDF renderer, in the reader's language. */
export function statementHtml(
  statement: Statement,
  title: string,
  subtitle: string,
  currency: string,
  language: Language,
  tr: Translator,
): string {
  const headers = ['date', 'document', 'details', 'invoiced', 'paid', 'balance'].map((key) =>
    tr.t(`statements.headers.${key}`),
  );
  const numeric = new Set([3, 4, 5]);
  const cell = (text: string, i: number, tag = 'td') =>
    `<${tag}${numeric.has(i) ? ' class="num"' : ''}>${escape(text)}</${tag}>`;
  const rows = entryRows(statement, tr)
    .map((row) => `<tr>${row.cells.map((c, i) => cell(c, i)).join('')}</tr>`)
    .join('');
  const summary = summaryRows(statement, currency, tr)
    .map((r) => `<tr><td>${escape(r.label)}</td><td class="num">${escape(r.value)}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
body{font-family:sans-serif;font-size:12px;color:#1c2b27}h1{font-size:20px;margin:0 0 4px}p{color:#5b6b66;margin:0 0 16px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{padding:6px 8px;border-bottom:1px solid #dfe5e2;text-align:start}
th{background:#e4f0eb}.num{text-align:end;direction:ltr;unicode-bidi:isolate}.summary{width:50%}
</style></head><body><h1>${escape(title)}</h1><p>${escape(subtitle)}</p>
<table class="summary">${summary}</table>
<table><thead><tr>${headers.map((h, i) => cell(h, i, 'th')).join('')}</tr></thead><tbody>${rows}</tbody></table>
<p>${escape(tr.t('statements.note'))} · ${escape(tr.t('statements.amountsIn', { currency }))}</p>
</body></html>`;
}
