import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { Page, pageOf } from '../../../core/util/paged-list';
import { InvoiceRecord, OrderRecord, QuoteRecord } from './sales-records.models';

export interface RecordsQuery {
  company: string;
  currency: string;
  term: string;
  /** Sales roles see only the documents they made (OWN_SALES_ONLY); null for everyone's. */
  owner: string | null;
}

/** The sales records lists, a page at a time: invoices, orders and quotations, newest first. */
@Injectable({ providedIn: 'root' })
export class SalesRecordsApiService {
  private readonly erpnext = inject(ErpnextClient);

  async invoices(q: RecordsQuery, start: number, size: number): Promise<Page<InvoiceRecord>> {
    const read = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        customer_name: string;
        docstatus: number;
        status: string;
        is_return: number;
        update_stock: number;
        base_grand_total: number;
        base_rounded_total: number;
        outstanding_amount: number;
        conversion_rate: number;
        party_account_currency: string | null;
        posting_date: string;
      }>('Sales Invoice', {
        fields: [
          'name',
          'customer_name',
          'docstatus',
          'status',
          'is_return',
          'update_stock',
          'base_grand_total',
          'base_rounded_total',
          'outstanding_amount',
          'conversion_rate',
          'party_account_currency',
          'posting_date',
        ],
        filters: scope(q),
        orFilters: search(q.term, 'customer_name'),
        orderBy: 'posting_date desc, creation desc, name desc',
        limit: size + 1,
        limitStart: start,
      }),
    );
    const { rows, more } = pageOf(read, size);
    const fromDeliveries = await this.billedDeliveries(
      rows.filter((r) => r.docstatus === 1).map((r) => r.name),
    );
    const items = rows.map((r) => ({
      name: r.name,
      customer: r.customer_name,
      docstatus: r.docstatus,
      status: r.status,
      isReturn: !!r.is_return,
      // A draft has moved no stock yet; a confirmed invoice did, or billed a delivery that did.
      delivered:
        r.docstatus !== 1
          ? false
          : r.update_stock || fromDeliveries?.has(r.name)
            ? true
            : fromDeliveries
              ? false
              : null,
      total: r.base_rounded_total || r.base_grand_total,
      // Outstanding is in the receivable account's currency: converted only when that isn't the company's.
      outstanding:
        r.docstatus === 1
          ? r.outstanding_amount *
            (r.party_account_currency === q.currency ? 1 : r.conversion_rate || 1)
          : 0,
      date: r.posting_date,
    }));
    return { items, more };
  }

  /**
   * The invoices whose goods left with a delivery: one the invoice bills, or one made from it afterwards (which
   * records the delivered quantity on the invoice's rows). Null when that can't be read.
   */
  private async billedDeliveries(names: readonly string[]): Promise<Set<string> | null> {
    if (!names.length) {
      return new Set();
    }
    const find = (filter: Filter) =>
      firstValueFrom(
        this.erpnext.list<{ name: string }>('Sales Invoice', {
          fields: ['name'],
          filters: [['name', 'in', names] as Filter, filter],
          limit: 0,
        }),
      );
    try {
      const [billed, deliveredAfter, fromOrders] = await Promise.all([
        find(['Sales Invoice Item', 'delivery_note', 'is', 'set']),
        find(['Sales Invoice Item', 'delivered_qty', '>', 0]),
        this.deliveredThroughOrders(names),
      ]);
      return new Set([...billed, ...deliveredAfter].map((r) => r.name).concat(fromOrders));
    } catch {
      // Better to say nothing about the goods than "Invoice only" for goods that did leave.
      return null;
    }
  }

  /**
   * Invoices billing an order whose goods a delivery note made from the same order delivered: ERPNext links the
   * two only through the order rows, leaving the invoice rows' own delivered quantity at 0.
   */
  private async deliveredThroughOrders(names: readonly string[]): Promise<string[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string; so_detail: string }>('Sales Invoice', {
        fields: ['name', 'items.so_detail as so_detail'],
        filters: [
          ['name', 'in', names],
          ['Sales Invoice Item', 'so_detail', 'is', 'set'],
        ],
        limit: 0,
      }),
    );
    const orderRows = [...new Set(rows.map((r) => r.so_detail).filter(Boolean))];
    if (!orderRows.length) {
      return [];
    }
    // In batches, to keep each GET URL short.
    const batches = Array.from({ length: Math.ceil(orderRows.length / 100) }, (_, i) =>
      orderRows.slice(i * 100, i * 100 + 100),
    );
    const delivered = (
      await Promise.all(
        batches.map((batch) =>
          firstValueFrom(
            this.erpnext.list<{ name: string }>('Sales Order Item', {
              fields: ['name'],
              filters: [
                ['name', 'in', batch],
                ['delivered_qty', '>', 0],
              ],
              parent: 'Sales Order',
              limit: 0,
            }),
          ),
        ),
      )
    ).flat();
    const done = new Set(delivered.map((d) => d.name));
    return [...new Set(rows.filter((r) => done.has(r.so_detail)).map((r) => r.name))];
  }

  async orders(q: RecordsQuery, start: number, size: number): Promise<Page<OrderRecord>> {
    const read = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        customer_name: string;
        docstatus: number;
        status: string;
        total_qty: number;
        delivery_status: string;
        billing_status: string;
        base_grand_total: number;
        base_rounded_total: number;
        transaction_date: string;
      }>('Sales Order', {
        fields: [
          'name',
          'customer_name',
          'docstatus',
          'status',
          'total_qty',
          'delivery_status',
          'billing_status',
          'base_grand_total',
          'base_rounded_total',
          'transaction_date',
        ],
        filters: scope(q),
        orFilters: search(q.term, 'customer_name'),
        orderBy: 'transaction_date desc, creation desc, name desc',
        limit: size + 1,
        limitStart: start,
      }),
    );
    const { rows, more } = pageOf(read, size);
    const items = rows.map((r) => ({
      name: r.name,
      customer: r.customer_name,
      docstatus: r.docstatus,
      status: r.status,
      qty: r.total_qty,
      deliveryStatus: r.delivery_status,
      billingStatus: r.billing_status,
      total: r.base_rounded_total || r.base_grand_total,
      date: r.transaction_date,
    }));
    return { items, more };
  }

  async quotes(q: RecordsQuery, start: number, size: number): Promise<Page<QuoteRecord>> {
    const read = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        customer_name: string;
        docstatus: number;
        status: string;
        base_grand_total: number;
        base_rounded_total: number;
        valid_till: string | null;
        transaction_date: string;
      }>('Quotation', {
        fields: [
          'name',
          'customer_name',
          'docstatus',
          'status',
          'base_grand_total',
          'base_rounded_total',
          'valid_till',
          'transaction_date',
        ],
        // Quotations to Leads belong to Desk's CRM, not to the customer's sales.
        filters: [...scope(q), ['quotation_to', '=', 'Customer']],
        orFilters: search(q.term, 'customer_name'),
        orderBy: 'transaction_date desc, creation desc, name desc',
        limit: size + 1,
        limitStart: start,
      }),
    );
    const { rows, more } = pageOf(read, size);
    const items = rows.map((r) => ({
      name: r.name,
      customer: r.customer_name,
      docstatus: r.docstatus,
      status: r.status,
      total: r.base_rounded_total || r.base_grand_total,
      validTill: r.valid_till,
      date: r.transaction_date,
    }));
    return { items, more };
  }
}

function scope(q: RecordsQuery): Filter[] {
  return [
    ['company', '=', q.company],
    ['docstatus', '<', 2],
    ...(q.owner ? ([['owner', '=', q.owner]] as Filter[]) : []),
  ];
}

/** Matches the document number or the customer's name. */
function search(term: string, nameField: string): Filter[] | undefined {
  const like = `%${term.trim()}%`;
  return term.trim()
    ? [
        ['name', 'like', like],
        [nameField, 'like', like],
      ]
    : undefined;
}
