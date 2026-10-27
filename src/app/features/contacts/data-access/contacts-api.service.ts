import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { WALK_IN_CUSTOMER } from '../../../core/customers/customer-directory.service';
import { PartyBalancesService, inCompany } from '../../../core/customers/party-balances.service';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { Page, PageFetch, mapPage, mergeSources, pageOf } from '../../../core/util/paged-list';
import {
  ContactInfo,
  ContactKind,
  ContactRow,
  CustomerDetail,
  HistoryEntry,
  SupplierDetail,
} from './contacts.models';

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

/** A role that may not read one kind of record still sees the rest; other failures stay failures. */
const forbiddenAsNone = (error: unknown): never[] => {
  if (ErpnextError.from(error).kind === 'forbidden') {
    return [];
  }
  throw error;
};

const owed = (row: Record<string, unknown>) =>
  Number(row['base_rounded_total']) || Number(row['base_grand_total']) || 0;

/** Customers and suppliers: the lists, and each one's balance and latest business. */
@Injectable({ providedIn: 'root' })
export class ContactsApiService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly balances = inject(PartyBalancesService);

  /** One page of customers matching the term, with what each owes across currencies, as their page totals it. */
  /** `owner` limits the balances to that user's own sales (salespeople, store associates). */
  async customerList(
    term: string,
    company: Company,
    owner: string | null,
    active: boolean,
    start: number,
    size: number,
  ): Promise<Page<ContactRow>> {
    const like = `%${term.trim()}%`;
    const read = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        customer_name: string;
        mobile_no: string | null;
        primary_address: string | null;
      }>('Customer', {
        fields: ['name', 'customer_name', 'mobile_no', 'primary_address'],
        filters: [
          ['disabled', '=', active ? 0 : 1],
          ['name', '!=', WALK_IN_CUSTOMER],
          ['customer_name', '!=', WALK_IN_CUSTOMER],
        ],
        orFilters: term.trim()
          ? [
              ['customer_name', 'like', like],
              ['mobile_no', 'like', like],
              ['name', 'like', like],
            ]
          : undefined,
        orderBy: 'customer_name asc, name asc',
        limit: size + 1,
        limitStart: start,
      }),
    );
    const { rows, more } = pageOf(read, size);
    // Roles that can't read Sales Invoices still see the customers.
    const balances = rows.length
      ? await this.balances
          .outstanding(
            'Sales Invoice',
            'customer',
            rows.map((r) => r.name),
            company,
            owner,
          )
          .catch(() => null)
      : null;
    return {
      more,
      items: rows.map((r) => ({
        id: r.name,
        name: r.customer_name,
        phone: r.mobile_no,
        city: lines(r.primary_address)[0] ?? null,
        outstanding: balances ? (balances.get(r.name) ?? 0) : null,
      })),
    };
  }

  /** Suppliers matching the term; balances only for roles that see supplier money. */
  async supplierList(
    term: string,
    company: Company,
    withBalances: boolean,
    active: boolean,
    start: number,
    size: number,
  ): Promise<Page<ContactRow>> {
    const like = `%${term.trim()}%`;
    const read = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        supplier_name: string;
        mobile_no: string | null;
        primary_address: string | null;
      }>('Supplier', {
        fields: ['name', 'supplier_name', 'mobile_no', 'primary_address'],
        filters: [['disabled', '=', active ? 0 : 1]],
        orFilters: term.trim()
          ? [
              ['supplier_name', 'like', like],
              ['mobile_no', 'like', like],
              ['name', 'like', like],
            ]
          : undefined,
        orderBy: 'supplier_name asc, name asc',
        limit: size + 1,
        limitStart: start,
      }),
    );
    const { rows, more } = pageOf(read, size);
    const balances =
      withBalances && rows.length
        ? await this.balances
            .outstanding(
              'Purchase Invoice',
              'supplier',
              rows.map((r) => r.name),
              company,
              null,
            )
            .catch(() => null)
        : null;
    return {
      more,
      items: rows.map((r) => ({
        id: r.name,
        name: r.supplier_name,
        phone: r.mobile_no,
        city: lines(r.primary_address)[0] ?? null,
        outstanding: balances ? (balances.get(r.name) ?? 0) : null,
      })),
    };
  }

  /**
   * Deactivates or reactivates a customer or supplier (ERPNext's Disabled). Its history stays; while inactive it
   * leaves the lists and ERPNext refuses new sales or purchases with it. Setting a value, so repeating it is safe.
   */
  async setActive(kind: ContactKind, id: string, active: boolean): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.client.set_value', {
        doctype: kind === 'customers' ? 'Customer' : 'Supplier',
        name: id,
        // As a dict: Frappe's set_value treats a plain value of 0 as "no value".
        fieldname: { disabled: active ? 0 : 1 },
      }),
    );
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

  /**
   * The contact's invoices, returns, payments and deliveries, newest first. Each kind is paged from its own cursor and
   * merged by date, then creation time. `owner` keeps sales roles to their own; `withMoney` false leaves a
   * supplier's money out (non-cost roles). Make one per query: it caches what each kind has read.
   */
  history(
    kind: ContactKind,
    id: string,
    company: Company,
    owner: string | null,
    withMoney: boolean,
  ): PageFetch<HistoryEntry> {
    const customer = kind === 'customers';
    const scope = (party: string): Filter[] => [
      [party, '=', id],
      ['company', '=', company.name],
      ['docstatus', '=', 1],
      ...(owner ? ([['owner', '=', owner]] as Filter[]) : []),
    ];
    const recent = (start: number, size: number) => ({
      orderBy: 'posting_date desc, creation desc, name desc',
      limit: size,
      limitStart: start,
    });
    type Row = { entry: HistoryEntry; made: string };
    // A role that can't read invoices or payments still sees the rest of the history.
    const none = (): Promise<Row[]> => Promise.resolve([]);
    const invoices = (start: number, size: number): Promise<Row[]> =>
      firstValueFrom(
        this.erpnext.list<Record<string, unknown>>(
          customer ? 'Sales Invoice' : 'Purchase Invoice',
          {
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
              'return_against',
              'update_outstanding_for_self',
              'creation',
            ],
            filters: scope(customer ? 'customer' : 'supplier'),
            ...recent(start, size),
          },
        ),
      )
        .then((rows) =>
          rows.map((r) => ({
            made: String(r['creation'] ?? ''),
            entry: {
              kind: r['is_return'] ? ('return' as const) : ('invoice' as const),
              name: String(r['name']),
              date: String(r['posting_date']),
              amount: Math.abs(owed(r)),
              outstanding: inCompany(r['outstanding_amount'], r, company.currency),
              credited: 0,
              // Credit notes that reduced an invoice's balance aren't payments against it.
              ...(r['is_return'] && !r['update_outstanding_for_self']
                ? { creditFor: String(r['return_against'] ?? ''), creditAmount: Math.abs(owed(r)) }
                : {}),
              status: String(r['status']),
              place: null,
              invoices: [],
              qty: 0,
            },
          })),
        )
        .catch(forbiddenAsNone);
    const payments = async (start: number, size: number): Promise<Row[]> => {
      const rows = await firstValueFrom(
        this.erpnext.list<{
          name: string;
          posting_date: string;
          base_paid_amount: number;
          paid_to: string;
          paid_from: string;
          creation?: string;
        }>('Payment Entry', {
          fields: ['name', 'posting_date', 'base_paid_amount', 'paid_to', 'paid_from', 'creation'],
          // Money received from customers or paid to suppliers; refunds the other way aren't these.
          filters: [
            ['party_type', '=', customer ? 'Customer' : 'Supplier'],
            ['payment_type', '=', customer ? 'Receive' : 'Pay'],
            ...scope('party'),
          ],
          ...recent(start, size),
        }),
      );
      const [allocations, accounts] = await Promise.all([
        rows.length
          ? firstValueFrom(
              this.erpnext.list<{ parent: string; reference_name: string }>(
                'Payment Entry Reference',
                {
                  fields: ['parent', 'reference_name'],
                  filters: [['parent', 'in', rows.map((p) => p.name)]],
                  parent: 'Payment Entry',
                  limit: 0,
                },
              ),
            ).catch(forbiddenAsNone)
          : Promise.resolve([]),
        this.names(
          'Account',
          'account_name',
          rows.map((p) => (customer ? p.paid_to : p.paid_from)),
        ),
      ]);
      return rows.map((p) => {
        const account = customer ? p.paid_to : p.paid_from;
        return {
          made: p.creation ?? '',
          entry: {
            kind: 'payment' as const,
            name: p.name,
            date: p.posting_date,
            amount: Number(p.base_paid_amount),
            outstanding: 0,
            credited: 0,
            status: '',
            place: accounts.get(account) ?? account,
            invoices: [
              ...new Set(
                allocations.filter((a) => a.parent === p.name).map((a) => a.reference_name),
              ),
            ],
            qty: 0,
          },
        };
      });
    };
    const deliveries = async (start: number, size: number): Promise<Row[]> => {
      const rows = await firstValueFrom(
        this.erpnext.list<{
          name: string;
          posting_date: string;
          total_qty: number;
          set_warehouse: string | null;
          is_return: number;
          creation?: string;
        }>(customer ? 'Delivery Note' : 'Purchase Receipt', {
          fields: ['name', 'posting_date', 'total_qty', 'set_warehouse', 'is_return', 'creation'],
          filters: scope(customer ? 'customer' : 'supplier'),
          ...recent(start, size),
        }),
      );
      const warehouses = await this.names(
        'Warehouse',
        'warehouse_name',
        rows.map((d) => d.set_warehouse ?? ''),
      );
      return rows.map((d) => ({
        made: d.creation ?? '',
        entry: {
          kind: 'delivery' as const,
          name: d.name,
          date: d.posting_date,
          amount: null,
          outstanding: 0,
          credited: 0,
          status: d.is_return ? 'Return' : '',
          place: d.set_warehouse ? (warehouses.get(d.set_warehouse) ?? d.set_warehouse) : null,
          invoices: [],
          qty: Math.abs(Number(d.total_qty)),
        },
      }));
    };
    const merged = mergeSources<Row>(
      [
        withMoney ? invoices : none,
        withMoney ? (start, size) => payments(start, size).catch(forbiddenAsNone) : none,
        (start, size) => deliveries(start, size).catch(forbiddenAsNone),
      ],
      // Same-day records in the order they were made, newest first, across all kinds.
      (a, b) =>
        b.entry.date.localeCompare(a.entry.date) ||
        b.made.localeCompare(a.made) ||
        b.entry.name.localeCompare(a.entry.name),
      (r) => `${r.entry.kind === 'return' ? 'invoice' : r.entry.kind}:${r.entry.name}`,
    );
    return mapPage(merged, (rows) => rows.map((r) => r.entry));
  }

  /** The contact's display name, for pages that only have its id. */
  async displayName(kind: ContactKind, id: string): Promise<string> {
    const customer = kind === 'customers';
    const field = customer ? 'customer_name' : 'supplier_name';
    const names = await this.names(customer ? 'Customer' : 'Supplier', field, [id]);
    return names.get(id) ?? id;
  }

  /** Display names for linked records; an unreadable lookup leaves the ids. */
  private async names(doctype: string, field: string, ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) {
      return new Map();
    }
    const rows = await firstValueFrom(
      this.erpnext.list<Record<string, string>>(doctype, {
        fields: ['name', field],
        filters: [['name', 'in', unique]],
        limit: 0,
      }),
    ).catch(() => []);
    return new Map(rows.map((r) => [r['name'], r[field]]));
  }
}

function info(doc: PartyDoc, name: string): ContactInfo {
  return {
    id: doc.name,
    name,
    phone: doc.mobile_no ?? null,
    email: doc.email_id ?? null,
    address: lines(doc.primary_address),
    active: !doc['disabled'],
  };
}

/** Fills in what credit notes took off each invoice among the entries shown. */
export function withCredits(entries: readonly HistoryEntry[]): HistoryEntry[] {
  const credited = new Map<string, number>();
  for (const e of entries) {
    if (e.creditFor) {
      credited.set(e.creditFor, (credited.get(e.creditFor) ?? 0) + (e.creditAmount ?? 0));
    }
  }
  return entries.map((e) =>
    e.kind === 'invoice' || e.kind === 'return' ? { ...e, credited: credited.get(e.name) ?? 0 } : e,
  );
}
