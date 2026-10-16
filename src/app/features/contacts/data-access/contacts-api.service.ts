import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { WALK_IN_CUSTOMER } from '../../../core/customers/customer-directory.service';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { ContactInfo, ContactRow, CustomerDetail, SupplierDetail } from './contacts.models';

/** Lists show this many rows; the screen says so when there may be more. */
export const LIST_LIMIT = 30;

interface PartyDoc {
  name: string;
  mobile_no?: string | null;
  email_id?: string | null;
  primary_address?: string | null;
  [key: string]: unknown;
}

interface Company {
  name: string;
  currency: string;
}

const lines = (address: string | null | undefined) =>
  (address ?? '')
    .split(/<br\s*\/?>|\n/i)
    .map((l) => l.trim())
    .filter(Boolean);

/** An amount kept in the party's account currency, in the company currency. */
const inCompany = (amount: unknown, row: Record<string, unknown>, currency: string) =>
  Number(amount ?? 0) *
  (row['party_account_currency'] === currency ? 1 : Number(row['conversion_rate']) || 1);

const owed = (row: Record<string, unknown>) =>
  Number(row['base_rounded_total']) || Number(row['base_grand_total']) || 0;

/** Customers and suppliers: the lists, and each one's balance and latest business. */
@Injectable({ providedIn: 'root' })
export class ContactsApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Customers matching the term, with what each owes across currencies, as their page totals it. */
  /** `owner` limits the balances to that user's own sales (salespeople, store associates). */
  async customerList(term: string, company: Company, owner: string | null): Promise<ContactRow[]> {
    const like = `%${term.trim()}%`;
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        customer_name: string;
        mobile_no: string | null;
        primary_address: string | null;
      }>('Customer', {
        fields: ['name', 'customer_name', 'mobile_no', 'primary_address'],
        filters: [
          ['disabled', '=', 0],
          ['name', '!=', WALK_IN_CUSTOMER],
        ],
        orFilters: term.trim()
          ? [
              ['customer_name', 'like', like],
              ['mobile_no', 'like', like],
              ['name', 'like', like],
            ]
          : undefined,
        orderBy: 'customer_name asc',
        limit: LIST_LIMIT,
      }),
    );
    // Roles that can't read Sales Invoices still see the customers.
    const balances = rows.length
      ? await this.balances(
          'Sales Invoice',
          'customer',
          rows.map((r) => r.name),
          company,
          owner,
        ).catch(() => null)
      : null;
    return rows.map((r) => ({
      id: r.name,
      name: r.customer_name,
      phone: r.mobile_no,
      city: lines(r.primary_address)[0] ?? null,
      outstanding: balances ? (balances.get(r.name) ?? 0) : null,
    }));
  }

  /** Suppliers matching the term; balances only for roles that see supplier money. */
  async supplierList(term: string, company: Company, withBalances: boolean): Promise<ContactRow[]> {
    const like = `%${term.trim()}%`;
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        supplier_name: string;
        mobile_no: string | null;
        primary_address: string | null;
      }>('Supplier', {
        fields: ['name', 'supplier_name', 'mobile_no', 'primary_address'],
        filters: [['disabled', '=', 0]],
        orFilters: term.trim()
          ? [
              ['supplier_name', 'like', like],
              ['mobile_no', 'like', like],
              ['name', 'like', like],
            ]
          : undefined,
        orderBy: 'supplier_name asc',
        limit: LIST_LIMIT,
      }),
    );
    const balances =
      withBalances && rows.length
        ? await this.balances(
            'Purchase Invoice',
            'supplier',
            rows.map((r) => r.name),
            company,
            null,
          ).catch(() => null)
        : null;
    return rows.map((r) => ({
      id: r.name,
      name: r.supplier_name,
      phone: r.mobile_no,
      city: lines(r.primary_address)[0] ?? null,
      outstanding: balances ? (balances.get(r.name) ?? 0) : null,
    }));
  }

  /** `owner` limits the totals and activity to that user's own sales and payments. */
  async customer(id: string, company: Company, owner: string | null): Promise<CustomerDetail> {
    const doc = await firstValueFrom(this.erpnext.doc<PartyDoc>('Customer', id));
    // Roles without Sales Invoice access still see the contact itself.
    const [invoices, payments] = await Promise.all([
      this.erpnext
        .listAll<Record<string, unknown>>('Sales Invoice', {
          fields: [
            'name',
            'posting_date',
            'status',
            'is_return',
            'base_grand_total',
            'base_rounded_total',
            'outstanding_amount',
            'conversion_rate',
            'party_account_currency',
          ],
          filters: [
            ['customer', '=', id],
            ['company', '=', company.name],
            ['docstatus', '=', 1],
            ...(owner ? ([['owner', '=', owner]] as Filter[]) : []),
          ],
          orderBy: 'posting_date desc, creation desc',
        })
        .catch(() => null),
      firstValueFrom(
        this.erpnext.list<{ name: string; posting_date: string; base_paid_amount: number }>(
          'Payment Entry',
          {
            fields: ['name', 'posting_date', 'base_paid_amount'],
            filters: [
              ['party_type', '=', 'Customer'],
              ['party', '=', id],
              ['payment_type', '=', 'Receive'],
              ['company', '=', company.name],
              ['docstatus', '=', 1],
              ...(owner ? ([['owner', '=', owner]] as Filter[]) : []),
            ],
            orderBy: 'posting_date desc, creation desc',
            limit: 5,
          },
        ),
      ).catch(() => []),
    ]);
    const sales = invoices?.filter((r) => !r['is_return']) ?? [];
    const latest = sales[0];
    const invoiced = sales.reduce((sum, r) => sum + owed(r), 0);
    const returned = (invoices ?? [])
      .filter((r) => r['is_return'])
      .reduce((sum, r) => sum + Math.abs(owed(r)), 0);
    const outstanding = (invoices ?? []).reduce(
      (sum, r) => sum + inCompany(r['outstanding_amount'], r, company.currency),
      0,
    );
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      ...info(doc, String(doc['customer_name'] ?? doc.name)),
      totals: invoices
        ? {
            invoiced: round(invoiced),
            paid: round(Math.max(invoiced - returned - outstanding, 0)),
            outstanding: round(outstanding),
          }
        : null,
      latest: latest
        ? {
            name: String(latest['name']),
            date: String(latest['posting_date']),
            status: String(latest['status']),
            total: owed(latest),
            outstanding: inCompany(latest['outstanding_amount'], latest, company.currency),
          }
        : null,
      recent: [
        ...sales.slice(0, 5).map((r) => ({
          kind: 'invoice' as const,
          name: String(r['name']),
          date: String(r['posting_date']),
          amount: owed(r),
        })),
        ...payments.map((p) => ({
          kind: 'payment' as const,
          name: p.name,
          date: p.posting_date,
          amount: Number(p.base_paid_amount),
        })),
      ]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5),
    };
  }

  /** The supplier, with money only for roles that see supplier balances. */
  async supplier(id: string, company: Company, withMoney: boolean): Promise<SupplierDetail> {
    const doc = await firstValueFrom(this.erpnext.doc<PartyDoc>('Supplier', id));
    const [invoices, order] = await Promise.all([
      withMoney
        ? this.erpnext
            .listAll<Record<string, unknown>>('Purchase Invoice', {
              fields: [
                'name',
                'base_grand_total',
                'base_rounded_total',
                'outstanding_amount',
                'conversion_rate',
                'party_account_currency',
              ],
              filters: [
                ['supplier', '=', id],
                ['company', '=', company.name],
                ['docstatus', '=', 1],
                ['outstanding_amount', '!=', 0],
              ],
              orderBy: 'posting_date asc, creation asc',
            })
            .catch(() => null)
        : Promise.resolve(null),
      this.openOrder(id, company).catch(() => null),
    ]);
    const unpaid = invoices?.find((r) => Number(r['outstanding_amount']) > 0);
    const remaining = unpaid
      ? inCompany(unpaid['outstanding_amount'], unpaid, company.currency)
      : 0;
    return {
      ...info(doc, String(doc['supplier_name'] ?? doc.name)),
      outstanding: invoices
        ? invoices.reduce(
            (sum, r) => sum + inCompany(r['outstanding_amount'], r, company.currency),
            0,
          )
        : null,
      unpaid: unpaid
        ? {
            name: String(unpaid['name']),
            total: owed(unpaid),
            paid: Math.max(owed(unpaid) - remaining, 0),
            remaining,
          }
        : null,
      openOrder: order,
    };
  }

  private async openOrder(
    supplier: string,
    company: Company,
  ): Promise<SupplierDetail['openOrder']> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Purchase Order', {
        fields: ['name'],
        filters: [
          ['supplier', '=', supplier],
          ['company', '=', company.name],
          ['docstatus', '=', 1],
          ['status', 'in', ['To Receive and Bill', 'To Receive', 'To Bill']],
        ],
        orderBy: 'transaction_date desc, creation desc',
        limit: 1,
      }),
    );
    if (!row) {
      return null;
    }
    const doc = await firstValueFrom(
      this.erpnext.doc<{
        items: { qty: number; received_qty: number; billed_amt: number; rate: number }[];
      }>('Purchase Order', row.name),
    );
    const sum = (pick: (i: (typeof doc.items)[number]) => number) =>
      Math.round(doc.items.reduce((total, i) => total + pick(i), 0) * 1e6) / 1e6;
    return {
      name: row.name,
      ordered: sum((i) => Number(i.qty)),
      received: sum((i) => Number(i.received_qty)),
      billed: sum((i) => (Number(i.rate) ? Number(i.billed_amt) / Number(i.rate) : 0)),
    };
  }

  /** Outstanding per party in the company currency: each is kept in its party's account currency. */
  private async balances(
    doctype: 'Sales Invoice' | 'Purchase Invoice',
    party: 'customer' | 'supplier',
    parties: string[],
    company: Company,
    owner: string | null,
  ) {
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

function info(doc: PartyDoc, name: string): ContactInfo {
  return {
    id: doc.name,
    name,
    phone: doc.mobile_no ?? null,
    email: doc.email_id ?? null,
    address: lines(doc.primary_address),
  };
}
