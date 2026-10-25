import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient, Filter } from '../erpnext/erpnext-client';

/** An amount kept in the party's account currency, in the company currency. */
export const inCompany = (amount: unknown, row: Record<string, unknown>, currency: string) =>
  Number(amount ?? 0) *
  (row['party_account_currency'] === currency ? 1 : Number(row['conversion_rate']) || 1);

/** What customers and suppliers owe, the way every page that shows a balance counts it. */
@Injectable({ providedIn: 'root' })
export class PartyBalancesService {
  private readonly erpnext = inject(ErpnextClient);

  /**
   * Outstanding per party in the company currency: each invoice is kept in its party's account currency.
   * `owner` limits it to that user's own invoices (salespeople, store associates).
   */
  async outstanding(
    doctype: 'Sales Invoice' | 'Purchase Invoice',
    party: 'customer' | 'supplier',
    parties: string[],
    company: { name: string; currency: string },
    owner: string | null,
  ): Promise<Map<string, number>> {
    const groups = await firstValueFrom(
      this.erpnext.list<Record<string, number | string>>(doctype, {
        fields: [party, 'party_account_currency', 'conversion_rate', { SUM: 'outstanding_amount' }],
        filters: [
          [party, 'in', parties],
          ['company', '=', company.name],
          ['docstatus', '=', 1],
          ['outstanding_amount', '!=', 0],
          ...(owner ? ([['owner', '=', owner]] as Filter[]) : []),
        ],
        groupBy: `${party}, party_account_currency, conversion_rate`,
        limit: 0,
      }),
    );
    const balances = new Map<string, number>();
    for (const g of groups) {
      const id = String(g[party]);
      balances.set(
        id,
        (balances.get(id) ?? 0) + inCompany(g['SUM(`outstanding_amount`)'], g, company.currency),
      );
    }
    return balances;
  }
}
