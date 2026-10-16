import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { InvoiceRecord, OrderRecord, QuoteRecord } from './sales-records.models';

/** The newest records each list shows; searching narrows them. */
export const RECORDS_LIMIT = 30;

/** The sales records lists: invoices, orders and quotations, newest first. */
@Injectable({ providedIn: 'root' })
export class SalesRecordsApiService {
  private readonly erpnext = inject(ErpnextClient);

  async invoices(company: string, term: string): Promise<InvoiceRecord[]> {
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
          'posting_date',
        ],
        filters: [
          ['company', '=', company],
          ['docstatus', '<', 2],
        ],
        orFilters: search(term, 'customer_name'),
        orderBy: 'posting_date desc, creation desc',
        limit: RECORDS_LIMIT,
      }),
    );
    return rows.map((r) => ({
      name: r.name,
      customer: r.customer_name,
      docstatus: r.docstatus,
      isReturn: !!r.is_return,
      delivered: !!r.update_stock,
      total: r.base_rounded_total || r.base_grand_total,
      // Outstanding is in the invoice's currency; the list shows the company's.
      outstanding: r.outstanding_amount * (r.conversion_rate || 1),
      date: r.posting_date,
    }));
  }

  async orders(company: string, term: string): Promise<OrderRecord[]> {
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
        filters: [
          ['company', '=', company],
          ['docstatus', '<', 2],
        ],
        orFilters: search(term, 'customer_name'),
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

  async quotes(company: string, term: string): Promise<QuoteRecord[]> {
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
        filters: [
          ['company', '=', company],
          ['docstatus', '<', 2],
        ],
        orFilters: search(term, 'customer_name'),
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
