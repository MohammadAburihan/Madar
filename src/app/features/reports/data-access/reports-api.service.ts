import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
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
    const [accounts, rows] = await Promise.all([
      this.accounts(company),
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
    ]);
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
        flows.push({
          account: account.name,
          name: account.account_name,
          moneyIn: round(debit),
          moneyOut: round(credit),
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

  /** The company's ledger accounts, read once per company: they change rarely. */
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
      // A failed read is retried next time rather than cached.
      cached.catch(() => this.accountCache.delete(company));
      this.accountCache.set(company, cached);
    }
    return cached;
  }
}
