import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { invoiceTotal } from '../../../core/erpnext/invoice-total';

export interface InvoiceDetail {
  name: string;
  customer: string;
  customerName: string;
  postingDate: string;
  status: 'draft' | 'confirmed' | 'cancelled';
  total: number;
  outstanding: number;
  /** The invoice itself moved the stock (Quick sale invoices do). */
  delivered: boolean;
  payments: { name: string; amount: number; account: string }[];
}

@Injectable({ providedIn: 'root' })
export class InvoiceApiService {
  private readonly erpnext = inject(ErpnextClient);

  async load(name: string): Promise<InvoiceDetail> {
    const [invoice, references] = await Promise.all([
      firstValueFrom(
        this.erpnext.doc<{
          name: string;
          customer: string;
          customer_name: string;
          posting_date: string;
          docstatus: number;
          grand_total: number;
          rounded_total: number;
          outstanding_amount: number;
          update_stock: number;
        }>('Sales Invoice', name),
      ),
      firstValueFrom(
        this.erpnext.list<{ parent: string; allocated_amount: number }>('Payment Entry Reference', {
          fields: ['parent', 'allocated_amount'],
          filters: [
            ['reference_doctype', '=', 'Sales Invoice'],
            ['reference_name', '=', name],
            ['parenttype', '=', 'Payment Entry'],
          ],
          parent: 'Payment Entry',
          limit: 0,
        }),
      ).catch(() => []),
    ]);
    const payments = references.length
      ? await firstValueFrom(
          this.erpnext.list<{ name: string; paid_to: string }>('Payment Entry', {
            fields: ['name', 'paid_to'],
            filters: [
              ['name', 'in', references.map((r) => r.parent)],
              ['docstatus', '=', 1],
            ],
            orderBy: 'posting_date asc, creation asc',
            limit: 0,
          }),
        ).catch(() => [])
      : [];
    const accounts = payments.length
      ? await firstValueFrom(
          this.erpnext.list<{ name: string; account_name: string }>('Account', {
            fields: ['name', 'account_name'],
            filters: [['name', 'in', [...new Set(payments.map((p) => p.paid_to))]]],
            limit: 0,
          }),
        ).catch(() => [])
      : [];
    return {
      name: invoice.name,
      customer: invoice.customer,
      customerName: invoice.customer_name,
      postingDate: invoice.posting_date,
      status:
        invoice.docstatus === 1 ? 'confirmed' : invoice.docstatus === 2 ? 'cancelled' : 'draft',
      total: invoiceTotal(invoice),
      outstanding: invoice.outstanding_amount,
      delivered: invoice.docstatus === 1 && !!invoice.update_stock,
      payments: payments.map((p) => ({
        name: p.name,
        amount: references
          .filter((r) => r.parent === p.name)
          .reduce((sum, r) => sum + r.allocated_amount, 0),
        account: accounts.find((a) => a.name === p.paid_to)?.account_name ?? p.paid_to,
      })),
    };
  }
}
