import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { AccountFlow, DateRange, PeriodFigures } from './report.models';

interface AccountRow {
  name: string;
  account_name: string;
  root_type: string;
  account_type: string | null;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Report figures from the general ledger: profit and money in and out, as ERPNext posted them. */
@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly accountCache = new Map<string, Promise<AccountRow[]>>();

  async figures(company: string, range: DateRange, reread = false): Promise<PeriodFigures> {
    const chart = this.accounts(company);
    const accounts = await chart;
    const payment = accounts.filter((a) => a.account_type === 'Cash' || a.account_type === 'Bank');
    // Debits and credits are in the company currency. Opening entries and year-end closing are not activity.
    const activity: Filter[] = [
      ['company', '=', company],
      ['is_cancelled', '=', 0],
      ['is_opening', '!=', 'Yes'],
      ['voucher_type', '!=', 'Period Closing Voucher'],
      ['posting_date', 'between', [range.from, range.to]],
    ];
    const [rows, vouchers] = await Promise.all([
      firstValueFrom(
        this.erpnext.list<Record<string, number | string>>('GL Entry', {
          fields: ['account', { SUM: 'debit' }, { SUM: 'credit' }],
          filters: activity,
          groupBy: 'account',
          limit: 0,
        }),
      ),
      payment.length
        ? firstValueFrom(
            this.erpnext.list<Record<string, number | string>>('GL Entry', {
              fields: [
                'voucher_type',
                'voucher_no',
                'account',
                { SUM: 'debit' },
                { SUM: 'credit' },
              ],
              filters: [...activity, ['account', 'in', payment.map((a) => a.name)] as Filter],
              groupBy: 'voucher_type, voucher_no, account',
              limit: 0,
            }),
          )
        : Promise.resolve([]),
    ]);
    if (!reread && rows.some((r) => !accounts.some((a) => a.name === r['account']))) {
      // An account added since the chart was read: read it again rather than leave its figures out.
      await this.rereadAccounts(company, chart);
      return this.figures(company, range, true);
    }
    const byName = new Map(accounts.map((a) => [a.name, a]));
    let income = 0;
    let costOfGoods = 0;
    let expenses = 0;
    for (const row of rows) {
      const account = byName.get(String(row['account']));
      const debit = Number(row['SUM(`debit`)'] ?? 0);
      const credit = Number(row['SUM(`credit`)'] ?? 0);
      if (account?.root_type === 'Income') {
        income += credit - debit;
      } else if (account?.root_type === 'Expense') {
        if (account.account_type === 'Cost of Goods Sold') {
          costOfGoods += debit - credit;
        } else {
          expenses += debit - credit;
        }
      }
    }
    const flows = paymentFlows(vouchers, byName);
    return {
      ...range,
      income: round(income),
      costOfGoods: round(costOfGoods),
      expenses: round(expenses),
      profit: round(income - costOfGoods - expenses),
      moneyIn: round(flows.reduce((sum, f) => sum + f.moneyIn, 0)),
      moneyOut: round(flows.reduce((sum, f) => sum + f.moneyOut, 0)),
      accounts: flows,
    };
  }

  /** Starts a report load from a fresh chart of accounts, so changed account types count from now on. */
  forgetChart(company: string): void {
    this.accountCache.delete(company);
  }

  /** The company's ledger accounts, read once per company and again when the ledger names one it lacks. */
  private accounts(company: string): Promise<AccountRow[]> {
    let cached = this.accountCache.get(company);
    if (!cached) {
      cached = firstValueFrom(
        this.erpnext.list<AccountRow>('Account', {
          fields: ['name', 'account_name', 'root_type', 'account_type'],
          filters: [
            ['company', '=', company],
            ['is_group', '=', 0],
          ],
          limit: 0,
        }),
      );
      this.remember(company, cached);
    }
    return cached;
  }

  /** One reread for every parallel call that found the same stale chart. */
  private rereadAccounts(company: string, stale: Promise<AccountRow[]>): Promise<AccountRow[]> {
    const current = this.accountCache.get(company);
    if (current && current !== stale) {
      return current;
    }
    this.accountCache.delete(company);
    return this.accounts(company);
  }

  private remember(company: string, read: Promise<AccountRow[]>): void {
    this.accountCache.set(company, read);
    // A failed read is retried next time; a later, successful one is left in place.
    read.catch(() => {
      if (this.accountCache.get(company) === read) {
        this.accountCache.delete(company);
      }
    });
  }
}

/**
 * Money in and out per payment account. Within one voucher, what moves from one of the business's cash or bank
 * accounts to another (a transfer, a contra entry) nets out: only the rest came in or went out.
 */
function paymentFlows(
  rows: readonly Record<string, number | string>[],
  accounts: ReadonlyMap<string, AccountRow>,
): AccountFlow[] {
  const vouchers = new Map<string, { account: string; debit: number; credit: number }[]>();
  for (const row of rows) {
    const key = `${row['voucher_type']}|${row['voucher_no']}`;
    const lines = vouchers.get(key) ?? [];
    lines.push({
      account: String(row['account']),
      debit: Number(row['SUM(`debit`)'] ?? 0),
      credit: Number(row['SUM(`credit`)'] ?? 0),
    });
    vouchers.set(key, lines);
  }
  const flows = new Map<string, { moneyIn: number; moneyOut: number }>();
  for (const lines of vouchers.values()) {
    const debits = lines.reduce((sum, l) => sum + l.debit, 0);
    const credits = lines.reduce((sum, l) => sum + l.credit, 0);
    const moved = Math.min(debits, credits);
    for (const line of lines) {
      const flow = flows.get(line.account) ?? { moneyIn: 0, moneyOut: 0 };
      flow.moneyIn += debits ? (line.debit * (debits - moved)) / debits : 0;
      flow.moneyOut += credits ? (line.credit * (credits - moved)) / credits : 0;
      flows.set(line.account, flow);
    }
  }
  return [...flows.entries()]
    .map(([account, flow]) => ({
      account,
      name: accounts.get(account)?.account_name ?? account,
      moneyIn: round(flow.moneyIn),
      moneyOut: round(flow.moneyOut),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
