import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient, Filter } from '../erpnext/erpnext-client';
import { shareInFlight } from '../util/share-in-flight';

export interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  /** Unpaid balance on submitted invoices, in company currency. */
  outstanding: number;
  /** Submitted invoices with a balance still due. */
  unpaidInvoices: number;
}

export interface NewCustomer {
  name: string;
  phone: string;
  email: string;
  address: string;
}

export const WALK_IN_CUSTOMER = 'Walk-in Customer';

/** Customer search and quick creation, shared by every task that starts by picking a customer. */
@Injectable({ providedIn: 'root' })
export class CustomerDirectoryService {
  private readonly erpnext = inject(ErpnextClient);
  private walkInId: string | null = null;
  private readonly resolveWalkIn = shareInFlight(() => this.findOrCreateWalkIn());

  /**
   * The Walk-in Customer's id, created on first use: a new site has none. ERPNext names it after its
   * customer name or from a series depending on Selling Settings, so the id is looked up, not assumed.
   */
  async walkIn(): Promise<string> {
    return this.walkInId ?? (await this.resolveWalkIn());
  }

  /**
   * Balances count only `company`'s invoices in its `currency` when given, so they match what a task can
   * collect and the currency they are shown in.
   */
  async search(
    term: string,
    company?: { name: string; currency: string },
    limit = 5,
  ): Promise<CustomerOption[]> {
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
        orderBy: 'modified desc',
        limit,
      }),
    );
    const balances = await this.balancesFor(
      rows.map((r) => r.name),
      company,
    ).catch(() => new Map<string, { outstanding: number; count: number }>());
    return rows.map((r) => ({
      id: r.name,
      name: r.customer_name,
      phone: r.mobile_no,
      city: firstAddressLine(r.primary_address),
      outstanding: balances.get(r.name)?.outstanding ?? 0,
      unpaidInvoices: balances.get(r.name)?.count ?? 0,
    }));
  }

  /**
   * One customer by exact id, for a page opened on a known customer; null when there is none. For a task
   * (`company` given) a disabled customer counts as none, and the balance is filled in as `search` does.
   */
  async byId(
    id: string,
    company?: { name: string; currency: string },
  ): Promise<CustomerOption | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        customer_name: string;
        mobile_no: string | null;
        primary_address: string | null;
      }>('Customer', {
        fields: ['name', 'customer_name', 'mobile_no', 'primary_address'],
        filters: [['name', '=', id], ...(company ? ([['disabled', '=', 0]] as Filter[]) : [])],
        limit: 1,
      }),
    );
    if (!row) {
      return null;
    }
    const balance = company
      ? (await this.balancesFor([row.name], company).catch(() => new Map())).get(row.name)
      : undefined;
    return {
      id: row.name,
      name: row.customer_name,
      phone: row.mobile_no,
      city: firstAddressLine(row.primary_address),
      outstanding: balance?.outstanding ?? 0,
      unpaidInvoices: balance?.count ?? 0,
    };
  }

  async create(customer: NewCustomer, country: string): Promise<CustomerOption> {
    // ERPNext creates the primary contact and address from these quick-entry fields.
    const doc = await firstValueFrom(
      this.erpnext.post<{ name: string; customer_name: string; mobile_no: string | null }>(
        'frappe.client.insert',
        {
          doc: {
            doctype: 'Customer',
            customer_name: customer.name.trim(),
            customer_type: 'Individual',
            ...(customer.phone.trim() ? { mobile_no: customer.phone.trim() } : {}),
            ...(customer.email.trim() ? { email_id: customer.email.trim() } : {}),
            ...(customer.address.trim()
              ? { address_line1: customer.address.trim(), city: customer.address.trim(), country }
              : {}),
          },
        },
      ),
    );
    return {
      id: doc.name,
      name: doc.customer_name,
      phone: doc.mobile_no,
      city: customer.address.trim() || null,
      outstanding: 0,
      unpaidInvoices: 0,
    };
  }

  private async findOrCreateWalkIn(): Promise<string> {
    const find = async () => {
      for (const field of ['name', 'customer_name']) {
        const [row] = await firstValueFrom(
          this.erpnext.list<{ name: string }>('Customer', {
            fields: ['name'],
            filters: [[field, '=', WALK_IN_CUSTOMER]],
            limit: 1,
          }),
        );
        if (row) {
          return row.name;
        }
      }
      return null;
    };
    let id = await find();
    if (!id) {
      try {
        const created = await firstValueFrom(
          this.erpnext.post<{ name: string }>('frappe.client.insert', {
            doc: {
              doctype: 'Customer',
              customer_name: WALK_IN_CUSTOMER,
              customer_type: 'Individual',
            },
          }),
        );
        id = created.name;
      } catch (error) {
        // Another device may have created it a moment ago.
        id = await find();
        if (!id) {
          throw error;
        }
      }
    }
    this.walkInId = id;
    return id;
  }

  private async balancesFor(
    customers: string[],
    company?: { name: string; currency: string },
  ): Promise<Map<string, { outstanding: number; count: number }>> {
    if (!customers.length) {
      return new Map();
    }
    const rows = await firstValueFrom(
      this.erpnext.list<Record<string, number | string>>('Sales Invoice', {
        fields: ['customer', { SUM: 'outstanding_amount' }, { COUNT: 'name' }],
        filters: [
          ['customer', 'in', customers],
          ['docstatus', '=', 1],
          ['outstanding_amount', '>', 0],
          ...(company
            ? ([
                ['company', '=', company.name],
                ['currency', '=', company.currency],
              ] as Filter[])
            : []),
        ],
        groupBy: 'customer',
        limit: 0,
      }),
    );
    return new Map(
      rows.map((r) => [
        String(r['customer']),
        {
          outstanding: Number(r['SUM(`outstanding_amount`)'] ?? 0),
          count: Number(r['COUNT(`name`)'] ?? 0),
        },
      ]),
    );
  }
}

/** ERPNext's primary_address is HTML-ish text; its first line is the street or city. */
function firstAddressLine(address: string | null): string | null {
  const line = address?.split(/<br\s*\/?>/i)[0]?.trim();
  return line || null;
}
