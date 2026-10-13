import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';

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

  async search(term: string, limit = 5): Promise<CustomerOption[]> {
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
    const balances = await this.balancesFor(rows.map((r) => r.name)).catch(
      () => new Map<string, { outstanding: number; count: number }>(),
    );
    return rows.map((r) => ({
      id: r.name,
      name: r.customer_name,
      phone: r.mobile_no,
      city: firstAddressLine(r.primary_address),
      outstanding: balances.get(r.name)?.outstanding ?? 0,
      unpaidInvoices: balances.get(r.name)?.count ?? 0,
    }));
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

  private async balancesFor(
    customers: string[],
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
