import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { invoiceTotal } from '../../../core/erpnext/invoice-total';
import { PageFetch, filledSource, mergeSources } from '../../../core/util/paged-list';

export interface PaymentRecord {
  name: string;
  direction: 'received' | 'paid' | 'expense';
  /** The customer or supplier; for an expense, its category. */
  party: string;
  account: string;
  amount: number;
  status: 'confirmed' | 'draft' | 'cancelled';
  postingDate: string;
  /** When it was entered: orders a day's payments and expenses together. */
  created: string;
  invoices: string[];
  /** Expenses only: whether a receipt is attached. */
  receipt?: boolean;
}

export interface OpenBalance {
  party: string;
  invoice: string;
  total: number;
  outstanding: number;
}

export interface MoneyOverview {
  /** Largest unpaid customer invoice and supplier bill, when the role can read them. */
  receivable: OpenBalance | null;
  payable: OpenBalance | null;
}

// Account names are long; batches keep each GET URL well under the request-line limit.
const ACCOUNT_BATCH = 30;

function batches<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

@Injectable({ providedIn: 'root' })
export class MoneyApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** The largest unpaid customer invoice and supplier bill, when the role can read them. */
  async overview(company: string, owner: string | null): Promise<MoneyOverview> {
    const [receivable, payable] = await Promise.all([
      this.largestOpen('Sales Invoice', 'customer_name', company).catch(() => null),
      owner
        ? Promise.resolve(null)
        : this.largestOpen('Purchase Invoice', 'supplier_name', company).catch(() => null),
    ]);
    return { receivable, payable };
  }

  /**
   * The payment history, newest first: Payment Entries, and (with `expenseAccounts`, the expense categories) the
   * Journal Entries debiting them, each read from its own cursor and merged by date, then entry time. Make one per
   * query.
   */
  history(
    company: string,
    owner: string | null,
    expenseAccounts: readonly string[] = [],
  ): PageFetch<PaymentRecord> {
    return mergeSources<PaymentRecord>(
      [
        (start, size) => this.payments(company, owner, start, size),
        ...batches(expenseAccounts, ACCOUNT_BATCH).map((accounts) =>
          filledSource((rawStart, size) =>
            this.expenses(company, accounts, expenseAccounts, rawStart, size),
          ),
        ),
      ],
      newestFirst,
      (r) => `${r.direction === 'expense' ? 'JE' : 'PE'}:${r.name}`,
    );
  }

  /** One page of Journal Entries that debit these expense categories: Madar's expenses, and ones made in Desk. */
  private async expenses(
    company: string,
    accounts: readonly string[],
    expenseAccounts: readonly string[],
    start: number,
    size: number,
  ): Promise<{ rows: PaymentRecord[]; raw: number }> {
    const found = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        posting_date: string;
        creation: string;
        docstatus: number;
      }>('Journal Entry', {
        fields: ['name', 'posting_date', 'creation', 'docstatus'],
        filters: [
          ['company', '=', company],
          ['docstatus', '<', 2],
          ['Journal Entry Account', 'account', 'in', accounts],
        ],
        orderBy: 'posting_date desc, creation desc, name desc',
        limit: size,
        limitStart: start,
      }),
    );
    // An entry with two expense rows comes back once per row.
    const entries = found.filter((e, i) => found.findIndex((o) => o.name === e.name) === i);
    const names = entries.map((e) => e.name);
    if (!names.length) {
      return { rows: [], raw: found.length };
    }
    const [rows, files] = await Promise.all([
      firstValueFrom(
        this.erpnext.list<{ parent: string; account: string; debit: number; credit: number }>(
          'Journal Entry Account',
          {
            fields: ['parent', 'account', 'debit', 'credit'],
            filters: [['parent', 'in', names]],
            parent: 'Journal Entry',
            limit: 0,
          },
        ),
      ),
      firstValueFrom(
        this.erpnext.list<{ attached_to_name: string }>('File', {
          fields: ['attached_to_name'],
          filters: [
            ['attached_to_doctype', '=', 'Journal Entry'],
            ['attached_to_name', 'in', names],
          ],
          limit: 0,
        }),
      ).catch(() => []),
    ]);
    const expense = new Set(expenseAccounts);
    const accountNames = await this.accountNames([...new Set(rows.map((r) => r.account))]);
    const name = (account: string | undefined) =>
      account ? (accountNames.get(account) ?? account) : '';
    const records = entries.map((entry): PaymentRecord => {
      const own = rows.filter((r) => r.parent === entry.name);
      const debits = own.filter((r) => expense.has(r.account) && r.debit > 0);
      return {
        name: entry.name,
        direction: 'expense',
        party: debits.map((r) => name(r.account)).join(', '),
        account: name(own.find((r) => r.credit > 0)?.account),
        amount: debits.reduce((sum, r) => sum + r.debit, 0),
        status: entry.docstatus === 1 ? 'confirmed' : 'draft',
        postingDate: entry.posting_date,
        created: entry.creation,
        invoices: [],
        receipt: files.some((f) => f.attached_to_name === entry.name),
      };
    });
    // Entries that only credit an expense account (reversals, refunds made in Desk) aren't expenses.
    return { rows: records.filter((r) => r.amount > 0), raw: found.length };
  }

  private async payments(
    company: string,
    owner: string | null,
    start: number,
    size: number,
  ): Promise<PaymentRecord[]> {
    const filters: Filter[] = [['company', '=', company]];
    if (owner) {
      filters.push(['owner', '=', owner]);
    }
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        payment_type: string;
        party_name: string | null;
        paid_to: string;
        paid_from: string;
        paid_amount: number;
        docstatus: number;
        posting_date: string;
        creation: string;
      }>('Payment Entry', {
        fields: [
          'name',
          'payment_type',
          'party_name',
          'paid_to',
          'paid_from',
          'paid_amount',
          'docstatus',
          'posting_date',
          'creation',
        ],
        filters,
        orderBy: 'posting_date desc, creation desc, name desc',
        limit: size,
        limitStart: start,
      }),
    );
    if (!rows.length) {
      return [];
    }
    const [references, accounts] = await Promise.all([
      firstValueFrom(
        this.erpnext.list<{ parent: string; reference_name: string }>('Payment Entry Reference', {
          fields: ['parent', 'reference_name'],
          filters: [
            ['parent', 'in', rows.map((r) => r.name)],
            ['parenttype', '=', 'Payment Entry'],
          ],
          parent: 'Payment Entry',
          limit: 0,
        }),
      ).catch(() => []),
      this.accountNames([...new Set(rows.flatMap((r) => [r.paid_to, r.paid_from]))]),
    ]);
    return rows.map((r) => {
      const received = r.payment_type === 'Receive';
      const account = received ? r.paid_to : r.paid_from;
      return {
        name: r.name,
        direction: received ? 'received' : 'paid',
        party: r.party_name ?? '',
        account: accounts.get(account) ?? account,
        amount: r.paid_amount,
        status: r.docstatus === 1 ? 'confirmed' : r.docstatus === 2 ? 'cancelled' : 'draft',
        postingDate: r.posting_date,
        created: r.creation,
        invoices: references
          .filter((ref) => ref.parent === r.name)
          .map((ref) => ref.reference_name),
      };
    });
  }

  private async largestOpen(
    doctype: 'Sales Invoice' | 'Purchase Invoice',
    partyField: string,
    company: string,
  ): Promise<OpenBalance | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<Record<string, string | number>>(doctype, {
        fields: ['name', partyField, 'grand_total', 'rounded_total', 'outstanding_amount'],
        filters: [
          ['company', '=', company],
          ['docstatus', '=', 1],
          ['outstanding_amount', '>', 0],
        ],
        orderBy: 'outstanding_amount desc',
        limit: 1,
      }),
    );
    return row
      ? {
          party: String(row[partyField] ?? ''),
          invoice: String(row['name']),
          total: invoiceTotal({
            grand_total: Number(row['grand_total']),
            rounded_total: Number(row['rounded_total'] ?? 0),
          }),
          outstanding: Number(row['outstanding_amount']),
        }
      : null;
  }

  private async accountNames(accounts: string[]): Promise<Map<string, string>> {
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string; account_name: string }>('Account', {
        fields: ['name', 'account_name'],
        filters: [['name', 'in', accounts.filter(Boolean)]],
        limit: 0,
      }),
    ).catch(() => []);
    return new Map(rows.map((r) => [r.name, r.account_name]));
  }
}

const newestFirst = (a: PaymentRecord, b: PaymentRecord) =>
  b.postingDate.localeCompare(a.postingDate) ||
  b.created.localeCompare(a.created) ||
  b.name.localeCompare(a.name);
