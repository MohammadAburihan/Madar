import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { InvoiceRecord, OrderRecord, QuoteRecord } from './sales-records.models';

/** The newest records each list shows; searching narrows them. */
export const RECORDS_LIMIT = 30;

export interface RecordsQuery {
  company: string;
  currency: string;
  term: string;
  /** Sales roles see only the documents they made (OWN_SALES_ONLY); null for everyone's. */
  owner: string | null;
}

/** The sales records lists: invoices, orders and quotations, newest first. */
@Injectable({ providedIn: 'root' })
export class SalesRecordsApiService {
  private readonly erpnext = inject(ErpnextClient);

  async invoices(q: RecordsQuery): Promise<InvoiceRecord[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        customer_name: string;
        docstatus: number;
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
        orderBy: 'posting_date desc, creation desc',
        limit: RECORDS_LIMIT,
      }),
    );
    return rows.map((r) => ({
      name: r.name,
      customer: r.customer_name,
      docstatus: r.docstatus,
      isReturn: !!r.is_return,
      // A draft has moved no stock yet, whatever it will do once confirmed.
      delivered: r.docstatus === 1 && !!r.update_stock,
      total: r.base_rounded_total || r.base_grand_total,
      // Outstanding is in the receivable account's currency: converted only when that isn't the company's.
      outstanding:
        r.docstatus === 1
          ? r.outstanding_amount *
            (r.party_account_currency === q.currency ? 1 : r.conversion_rate || 1)
          : 0,
      date: r.posting_date,
    }));
  }

  async orders(q: RecordsQuery): Promise<OrderRecord[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        customer_name: string;
        docstatus: number;
        status: string;
        total_qty: number;
        per_delivered: number;
        per_billed: number;
        base_grand_total: number;
        transaction_date: string;
      }>('Sales Order', {
        fields: [
          'name',
          'customer_name',
          'docstatus',
          'status',
          'total_qty',
          'per_delivered',
          'per_billed',
          'base_grand_total',
          'transaction_date',
        ],
        filters: scope(q),
        orFilters: search(q.term, 'customer_name'),
        orderBy: 'transaction_date desc, creation desc',
        limit: RECORDS_LIMIT,
      }),
    );
    return rows.map((r) => ({
      name: r.name,
      customer: r.customer_name,
      docstatus: r.docstatus,
      status: r.status,
      qty: r.total_qty,
      delivered: r.per_delivered,
      billed: r.per_billed,
      total: r.base_grand_total,
      date: r.transaction_date,
    }));
  }

  async quotes(q: RecordsQuery): Promise<QuoteRecord[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        customer_name: string;
        docstatus: number;
        status: string;
        base_grand_total: number;
        valid_till: string | null;
        transaction_date: string;
      }>('Quotation', {
        fields: [
          'name',
          'customer_name',
          'docstatus',
          'status',
          'base_grand_total',
          'valid_till',
          'transaction_date',
        ],
        filters: scope(q),
        orFilters: search(q.term, 'customer_name'),
        orderBy: 'transaction_date desc, creation desc',
        limit: RECORDS_LIMIT,
      }),
    );
    return rows.map((r) => ({
      name: r.name,
      customer: r.customer_name,
      docstatus: r.docstatus,
      status: r.status,
      total: r.base_grand_total,
      validTill: r.valid_till,
      date: r.transaction_date,
    }));
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
