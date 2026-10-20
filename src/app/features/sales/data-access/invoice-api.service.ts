import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { referenceIn } from '../../../core/erpnext/draft';
import { invoiceTotal } from '../../../core/erpnext/invoice-total';
import { canReturn } from './sales-return.models';
import { creditsAgainst } from './credits';
import { stockedItems } from './stocked-items';

export interface InvoiceDetail {
  name: string;
  customer: string;
  customerName: string;
  postingDate: string;
  status: 'draft' | 'confirmed' | 'cancelled';
  company: string;
  owner: string;
  /** Madar's `SALE-…` reference when a quick sale made the invoice; only those drafts can be continued. */
  saleReference: string | null;
  /** A return (credit note) or an invoice that moves no stock isn't a quick sale. */
  quickSale: boolean;
  total: number;
  outstanding: number;
  /** What credit notes against it took off its outstanding: not money paid. */
  credited: number;
  /** The invoice itself moved the stock (Quick sale invoices do). */
  delivered: boolean;
  /** A confirmed sale whose goods (if any) left with the invoice itself, so Madar can take a return against it. */
  returnable: boolean;
  payments: { name: string; amount: number; account: string }[];
}

@Injectable({ providedIn: 'root' })
export class InvoiceApiService {
  private readonly erpnext = inject(ErpnextClient);

  async load(name: string): Promise<InvoiceDetail> {
    const [invoice, references, credits] = await Promise.all([
      firstValueFrom(
        this.erpnext.doc<{
          name: string;
          company: string;
          owner: string;
          remarks: string | null;
          customer: string;
          customer_name: string;
          posting_date: string;
          docstatus: number;
          grand_total: number;
          rounded_total: number;
          outstanding_amount: number;
          update_stock: number;
          is_return: number;
          is_pos?: number;
          items?: {
            item_code: string;
            delivery_note?: string | null;
            delivered_qty?: number;
            so_detail?: string | null;
          }[];
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
      creditsAgainst(this.erpnext, name),
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
    // Goods can also leave on a delivery note: one the invoice bills, one made from it, or one from the same order.
    const rows = invoice.items ?? [];
    const orderRows = [...new Set(rows.map((r) => r.so_detail).filter((r): r is string => !!r))];
    const deliveredElsewhere =
      rows.some((r) => !!r.delivery_note || Number(r.delivered_qty) > 0) ||
      (orderRows.length > 0 &&
        (
          await firstValueFrom(
            this.erpnext.list<{ name: string }>('Sales Order Item', {
              fields: ['name'],
              filters: [
                ['name', 'in', orderRows],
                ['delivered_qty', '>', 0],
              ],
              parent: 'Sales Order',
              limit: 1,
            }),
          ).catch(() => [])
        ).length > 0);
    const goods = invoice.update_stock
      ? new Set<string>()
      : await stockedItems(
          this.erpnext,
          (invoice.items ?? []).map((i) => i.item_code),
        ).catch(() => new Set(['?']));
    return {
      name: invoice.name,
      customer: invoice.customer,
      customerName: invoice.customer_name,
      postingDate: invoice.posting_date,
      status:
        invoice.docstatus === 1 ? 'confirmed' : invoice.docstatus === 2 ? 'cancelled' : 'draft',
      company: invoice.company,
      owner: invoice.owner,
      saleReference: referenceIn(invoice.remarks, 'SALE'),
      quickSale: !!invoice.update_stock && !invoice.is_return,
      total: invoiceTotal(invoice),
      outstanding: invoice.outstanding_amount,
      credited: credits.account,
      delivered: invoice.docstatus === 1 && (!!invoice.update_stock || deliveredElsewhere),
      returnable: canReturn({
        docstatus: invoice.docstatus,
        isReturn: !!invoice.is_return,
        isPos: !!invoice.is_pos,
        movesStock: !!invoice.update_stock,
        hasGoods: goods.size > 0,
      }),
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
