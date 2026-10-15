import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';

export interface PaymentAccount {
  mode: string;
  account: string;
  label: string;
  /** Bank modes need a reference number and date on the payment. */
  isBank: boolean;
  /** The account's currency, when it could be read. */
  currency?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PaymentAccountsService {
  private readonly erpnext = inject(ErpnextClient);

  /** Enabled payment modes with an account for this company, limited to the ones the role may use. */
  async list(company: string, allowed: 'all' | readonly string[]): Promise<PaymentAccount[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        type: string;
        account: string | null;
        company: string | null;
      }>('Mode of Payment', {
        fields: [
          'name',
          'type',
          'accounts.default_account as account',
          'accounts.company as company',
        ],
        filters: [['enabled', '=', 1]],
        limit: 0,
      }),
    );
    const usable = rows.filter(
      (r) => r.company === company && r.account && (allowed === 'all' || allowed.includes(r.name)),
    );
    if (!usable.length) {
      return [];
    }
    const accounts = await firstValueFrom(
      this.erpnext.list<{ name: string; account_name: string; account_currency: string }>(
        'Account',
        {
          fields: ['name', 'account_name', 'account_currency'],
          filters: [['name', 'in', usable.map((r) => r.account!)]],
          limit: 0,
        },
      ),
    ).catch(() => []);
    return usable.map((r) => ({
      mode: r.name,
      account: r.account!,
      label: accounts.find((a) => a.name === r.account)?.account_name ?? r.name,
      isBank: r.type === 'Bank',
      currency: accounts.find((a) => a.name === r.account)?.account_currency ?? null,
    }));
  }
}
