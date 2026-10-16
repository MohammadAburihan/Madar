import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
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

  async figures(company: string, range: DateRange): Promise<PeriodFigures> {
    const chart = this.accounts(company);
    const [cached, rows, transfers] = await Promise.all([
      chart,
      // Debits and credits are in the company currency. Opening entries and year-end closing are not activity.
      firstValueFrom(
        this.erpnext.list<Record<string, number | string>>('GL Entry', {
          fields: ['account', { SUM: 'debit' }, { SUM: 'credit' }],
          filters: [
            ['company', '=', company],
            ['is_cancelled', '=', 0],
            ['is_opening', '!=', 'Yes'],
            ['voucher_type', '!=', 'Period Closing Voucher'],
            ['posting_date', 'between', [range.from, range.to]],
          ],
          groupBy: 'account',
          limit: 0,
        }),
      ),
      this.internalTransfers(company, range),
    ]);
    let accounts = cached;
    if (rows.some((r) => !accounts.some((a) => a.name === r['account']))) {
      // An account added since the chart was read: read it again rather than leave its figures out.
      accounts = await this.rereadAccounts(company, chart);
    }
    const byName = new Map(accounts.map((a) => [a.name, a]));
    let income = 0;
    let costOfGoods = 0;
    let expenses = 0;
    const flows: AccountFlow[] = [];
    for (const row of rows) {
      const account = byName.get(String(row['account']));
      if (!account) {
        continue;
      }
      const debit = Number(row['SUM(`debit`)'] ?? 0);
      const credit = Number(row['SUM(`credit`)'] ?? 0);
      if (account.root_type === 'Income') {
        income += credit - debit;
      } else if (account.root_type === 'Expense') {
        if (account.account_type === 'Cost of Goods Sold') {
          costOfGoods += debit - credit;
        } else {
          expenses += debit - credit;
        }
      } else if (account.account_type === 'Cash' || account.account_type === 'Bank') {
        // Moving money between the business's own accounts brings nothing in and sends nothing out.
        const moved = transfers.get(account.name) ?? { in: 0, out: 0 };
        flows.push({
          account: account.name,
          name: account.account_name,
          moneyIn: round(debit - moved.in),
          moneyOut: round(credit - moved.out),
        });
      }
    }
    flows.sort((a, b) => a.name.localeCompare(b.name));
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

  /** What internal transfers moved into and out of each account in the period; none for roles that can't read them. */
  private async internalTransfers(
    company: string,
    range: DateRange,
  ): Promise<Map<string, { in: number; out: number }>> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        paid_from: string;
        paid_to: string;
        base_paid_amount: number;
        base_received_amount: number;
      }>('Payment Entry', {
        fields: ['paid_from', 'paid_to', 'base_paid_amount', 'base_received_amount'],
        filters: [
          ['company', '=', company],
          ['docstatus', '=', 1],
          ['payment_type', '=', 'Internal Transfer'],
          ['posting_date', 'between', [range.from, range.to]],
        ],
        limit: 0,
      }),
      // Auditors may not read payments: their totals then include transfers. Other failures fail the load.
    ).catch((error: unknown) => {
      if (ErpnextError.from(error).kind === 'forbidden') {
        return [];
      }
      throw error;
    });
    const moved = new Map<string, { in: number; out: number }>();
    const add = (account: string, side: 'in' | 'out', amount: number) => {
      const entry = moved.get(account) ?? { in: 0, out: 0 };
      entry[side] += amount;
      moved.set(account, entry);
    };
    for (const row of rows) {
      add(row.paid_from, 'out', row.base_paid_amount);
      add(row.paid_to, 'in', row.base_received_amount);
    }
    return moved;
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
