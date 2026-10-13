import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { invoiceTotal } from '../../../core/erpnext/invoice-total';

export interface PaymentRecord {
  name: string;
  direction: 'received' | 'paid';
  party: string;
  account: string;
  amount: number;
  status: 'confirmed' | 'draft' | 'cancelled';
  postingDate: string;
  invoices: string[];
}

export interface OpenBalance {
  party: string;
  invoice: string;
  total: number;
  outstanding: number;
}

export interface MoneyOverview {
  payments: PaymentRecord[];
  /** Largest unpaid customer invoice and supplier bill, when the role can read them. */
  receivable: OpenBalance | null;
  payable: OpenBalance | null;
}

const HISTORY_LIMIT = 50;

@Injectable({ providedIn: 'root' })
export class MoneyApiService {
  private readonly erpnext = inject(ErpnextClient);

  async overview(company: string, owner: string | null): Promise<MoneyOverview> {
    const [payments, receivable, payable] = await Promise.all([
      this.payments(company, owner),
      this.largestOpen('Sales Invoice', 'customer_name', company).catch(() => null),
      owner
        ? Promise.resolve(null)
        : this.largestOpen('Purchase Invoice', 'supplier_name', company).catch(() => null),
    ]);
    return { payments, receivable, payable };
  }

  private async payments(company: string, owner: string | null): Promise<PaymentRecord[]> {
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
        ],
        filters,
        orderBy: 'posting_date desc, creation desc',
        limit: HISTORY_LIMIT,
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
