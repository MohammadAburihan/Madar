import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { HtmlPdfService } from '../../../core/erpnext/html-pdf.service';
import { DateRange, PartyKind, Statement, StatementEntry } from './report.models';

const round = (value: number) => Math.round(value * 100) / 100;
const BATCH = 30;
const batches = <T>(values: readonly T[]) =>
  Array.from({ length: Math.ceil(values.length / BATCH) }, (_, i) =>
    values.slice(i * BATCH, i * BATCH + BATCH),
  );
/** "Main cash - RN" → "Main cash": ERPNext names accounts "{name} - {company abbreviation}". */
const accountName = (account: string | null) => account?.replace(/ - [^-]+$/, '') ?? null;

/** Customer and supplier statements from the party ledger, and their PDF. */
@Injectable({ providedIn: 'root' })
export class StatementsApiService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly htmlPdf = inject(HtmlPdfService);

  async statement(
    kind: PartyKind,
    party: string,
    company: string,
    range: DateRange,
  ): Promise<Statement> {
    const base: Filter[] = [
      ['company', '=', company],
      ['party_type', '=', kind === 'customer' ? 'Customer' : 'Supplier'],
      ['party', '=', party],
      ['is_cancelled', '=', 0],
    ];
    // Amounts in the company currency. A customer's balance is what they owe (debit); a supplier's, what is owed to them.
    const owed = (debit: number, credit: number) =>
      kind === 'customer' ? debit - credit : credit - debit;
    const [before, rows] = await Promise.all([
      firstValueFrom(
        this.erpnext.list<Record<string, number>>('GL Entry', {
          fields: [{ SUM: 'debit' }, { SUM: 'credit' }],
          filters: [...base, ['posting_date', '<', range.from]],
          limit: 1,
        }),
      ),
      firstValueFrom(
        this.erpnext.list<Record<string, number | string>>('GL Entry', {
          fields: [
            'voucher_type',
            'voucher_no',
            'posting_date',
            { SUM: 'debit' },
            { SUM: 'credit' },
            { MIN: 'creation' },
          ],
          filters: [...base, ['posting_date', 'between', [range.from, range.to]]],
          groupBy: 'voucher_type, voucher_no, posting_date',
          orderBy: 'posting_date asc',
          limit: 0,
        }),
      ),
    ]);
    const opening = round(
      owed(Number(before[0]?.['SUM(`debit`)'] ?? 0), Number(before[0]?.['SUM(`credit`)'] ?? 0)),
    );
    const moves = rows
      .map((r) => {
        const debit = Number(r['SUM(`debit`)'] ?? 0);
        const credit = Number(r['SUM(`credit`)'] ?? 0);
        // Each side kept: a fully paid invoice (a POS sale, an "is paid" bill) both adds and settles, and still counts.
        const adds = round(kind === 'customer' ? debit : credit);
        const settles = round(kind === 'customer' ? credit : debit);
        return {
          date: String(r['posting_date']),
          voucherType: String(r['voucher_type']),
          voucher: String(r['voucher_no']),
          posted: String(r['MIN(`creation`)'] ?? ''),
          adds,
          settles,
          amount: round(adds - settles),
        };
      })
      .filter((m) => m.adds !== 0 || m.settles !== 0)
      // Same-day documents in the order they were posted: an invoice before the payment that settles it.
      .sort((a, b) => a.date.localeCompare(b.date) || a.posted.localeCompare(b.posted));
    const invoiceType = kind === 'customer' ? 'Sales Invoice' : 'Purchase Invoice';
    const [invoices, payments] = await Promise.all([
      this.invoiceDetails(
        invoiceType,
        moves.filter((m) => m.voucherType === invoiceType).map((m) => m.voucher),
      ),
      this.paymentDetails(
        kind,
        moves.filter((m) => m.voucherType === 'Payment Entry').map((m) => m.voucher),
      ),
    ]);
    let balance = opening;
    const entries: StatementEntry[] = moves.map((m) => {
      balance = round(balance + m.amount);
      const invoice = invoices.get(m.voucher);
      const payment = payments.get(m.voucher);
      return {
        date: m.date,
        voucherType: m.voucherType,
        voucher: m.voucher,
        kind:
          m.voucherType === invoiceType
            ? invoice?.isReturn || m.amount < 0
              ? 'return'
              : 'invoice'
            : m.voucherType === 'Payment Entry'
              ? 'payment'
              : 'journal',
        firstItem: invoice?.firstItem ?? null,
        account: payment?.account ?? null,
        against: payment?.against ?? [],
        invoiced: m.adds,
        paid: m.settles,
        balance,
      };
    });
    const invoiced = round(entries.reduce((sum, e) => sum + e.invoiced, 0));
    const paid = round(entries.reduce((sum, e) => sum + e.paid, 0));
    return {
      kind,
      party,
      range,
      opening,
      invoiced,
      paid,
      outstanding: round(opening + invoiced - paid),
      invoices: entries.filter((e) => e.kind === 'invoice').length,
      payments: entries.filter((e) => e.kind === 'payment').length,
      entries,
    };
  }

  /** Renders the statement's HTML to a PDF on the ERPNext server. */
  pdf(html: string): Promise<Blob> {
    return this.htmlPdf.render(html);
  }

  private async invoiceDetails(doctype: string, names: readonly string[]) {
    const details = new Map<
      string,
      { isReturn: boolean; firstItem: { name: string; qty: number; more: number } | null }
    >();
    const rows = (
      await Promise.all(
        batches(names).map((group) =>
          firstValueFrom(
            this.erpnext.list<{ name: string; is_return: number; item_name: string; qty: number }>(
              doctype,
              {
                fields: ['name', 'is_return', 'items.item_name as item_name', 'items.qty as qty'],
                filters: [['name', 'in', group] as Filter],
                limit: 0,
              },
            ),
          ),
        ),
      )
    ).flat();
    for (const row of rows) {
      const seen = details.get(row.name);
      details.set(row.name, {
        isReturn: !!row.is_return,
        firstItem: seen?.firstItem
          ? { ...seen.firstItem, more: seen.firstItem.more + 1 }
          : { name: row.item_name, qty: Math.abs(row.qty), more: 0 },
      });
    }
    return details;
  }

  private async paymentDetails(kind: PartyKind, names: readonly string[]) {
    const details = new Map<string, { account: string | null; against: string[] }>();
    const rows = (
      await Promise.all(
        batches(names).map((group) =>
          firstValueFrom(
            this.erpnext.list<{
              name: string;
              paid_to: string | null;
              paid_from: string | null;
              reference_name: string | null;
            }>('Payment Entry', {
              fields: [
                'name',
                'paid_to',
                'paid_from',
                'references.reference_name as reference_name',
              ],
              filters: [['name', 'in', group] as Filter],
              limit: 0,
            }),
          ),
        ),
      )
    ).flat();
    for (const row of rows) {
      const seen = details.get(row.name);
      const against = [...(seen?.against ?? [])];
      if (row.reference_name && !against.includes(row.reference_name)) {
        against.push(row.reference_name);
      }
      details.set(row.name, {
        // Money from a customer lands in paid_to; money to a supplier leaves from paid_from.
        account: accountName(kind === 'customer' ? row.paid_to : row.paid_from),
        against,
      });
    }
    return details;
  }
}
