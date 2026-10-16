import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { invoiceTotal } from '../../../core/erpnext/invoice-total';
import { canReturn } from './sales-return.models';
import { stockedItems } from './stocked-items';

export interface InvoiceDetail {
  name: string;
  customer: string;
  customerName: string;
  postingDate: string;
  status: 'draft' | 'confirmed' | 'cancelled';
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

/** Without the credits, paid would count them as money: only a role's 403 is passed over. */
const forbiddenAsNone = (error: unknown): never[] => {
  if (ErpnextError.from(error).kind === 'forbidden') {
    return [];
  }
  throw error;
};

@Injectable({ providedIn: 'root' })
export class InvoiceApiService {
  private readonly erpnext = inject(ErpnextClient);

  async load(name: string): Promise<InvoiceDetail> {
    const [invoice, references, credits] = await Promise.all([
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
          is_return: number;
          is_pos?: number;
          items?: { item_code: string }[];
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
      // Every entry settling it in the ledger; which of them are credit notes is worked out below.
      firstValueFrom(
        this.erpnext.list<{
          voucher_type: string;
          voucher_no: string;
          amount_in_account_currency: number;
        }>('Payment Ledger Entry', {
          fields: ['voucher_type', 'voucher_no', 'amount_in_account_currency'],
          filters: [
            ['against_voucher_type', '=', 'Sales Invoice'],
            ['against_voucher_no', '=', name],
            ['voucher_type', 'in', ['Sales Invoice', 'Journal Entry']],
            ['voucher_no', '!=', name],
            ['delinked', '=', 0],
          ],
          limit: 0,
        }),
      ).catch(forbiddenAsNone),
    ]);
    // A credit note matched to it later is settled by a "Credit Note" Journal Entry; bank journals are money.
    const journals = [
      ...new Set(
        credits.filter((c) => c.voucher_type === 'Journal Entry').map((c) => c.voucher_no),
      ),
    ];
    const creditJournals = new Set(
      journals.length
        ? (
            await firstValueFrom(
              this.erpnext.list<{ name: string }>('Journal Entry', {
                fields: ['name'],
                filters: [
                  ['name', 'in', journals],
                  ['voucher_type', '=', 'Credit Note'],
                ],
                limit: 0,
              }),
            ).catch(forbiddenAsNone)
          ).map((j) => j.name)
        : [],
    );
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
      total: invoiceTotal(invoice),
      outstanding: invoice.outstanding_amount,
      credited: Math.max(
        -credits
          .filter((c) => c.voucher_type === 'Sales Invoice' || creditJournals.has(c.voucher_no))
          .reduce((sum, c) => sum + Number(c.amount_in_account_currency), 0),
        0,
      ),
      delivered: invoice.docstatus === 1 && !!invoice.update_stock,
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
