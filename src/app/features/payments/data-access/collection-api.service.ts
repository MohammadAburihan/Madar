import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { confirmRequest, reusableDraft, unresolvedOr } from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { invoiceTotal } from '../../../core/erpnext/invoice-total';
import { round2 } from '../../../core/format/number';
import {
  CollectedInvoice,
  CollectionRequest,
  CollectionResult,
  UnpaidInvoice,
} from './collection.models';

interface PaymentDoc {
  name: string;
  docstatus: number;
  posting_date: string;
  paid_amount: number;
  references: { reference_name: string; allocated_amount: number }[];
  [key: string]: unknown;
}

/** Customer collections: a submitted Payment Entry (Receive) allocated to the customer's unpaid invoices. */
@Injectable({ providedIn: 'root' })
export class CollectionApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Unpaid invoices in the company currency; foreign-currency invoices need ERPNext's exchange handling. */
  async unpaidInvoices(
    customer: string,
    company: string,
    currency: string,
  ): Promise<UnpaidInvoice[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        posting_date: string;
        due_date: string | null;
        grand_total: number;
        rounded_total: number;
        outstanding_amount: number;
        debit_to: string;
      }>('Sales Invoice', {
        fields: [
          'name',
          'posting_date',
          'due_date',
          'grand_total',
          'rounded_total',
          'outstanding_amount',
          'debit_to',
        ],
        filters: [
          ['customer', '=', customer],
          ['company', '=', company],
          ['currency', '=', currency],
          ['docstatus', '=', 1],
          ['outstanding_amount', '>', 0],
        ],
        orderBy: 'posting_date asc',
        limit: 50,
      }),
    );
    return rows.map((r) => ({
      name: r.name,
      postingDate: r.posting_date,
      dueDate: r.due_date,
      total: invoiceTotal(r),
      outstanding: r.outstanding_amount,
      receivable: r.debit_to,
    }));
  }

  /**
   * Inserts and submits the payment. A timeout or lost connection throws UnresolvedError: the payment may
   * exist, so callers must look it up with find(), not resubmit.
   */
  async confirm(
    request: CollectionRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<CollectionResult> {
    // Reading the draft and ERPNext's template writes nothing, so their errors are definite failures.
    const fresh = await this.paymentDoc(request);
    const current = draft
      ? await reusableDraft(this.erpnext.doc<PaymentDoc>('Payment Entry', draft))
      : null;
    if (current?.docstatus === 1) {
      // A slow earlier attempt recorded it after all.
      return this.result(current);
    }
    let payment: PaymentDoc;
    try {
      let doc: PaymentDoc;
      if (current) {
        // The fresh template is a new document (`__islocal`, no name); submitting it as-is would insert a
        // second payment. Keep the draft's identity and drop the template's new-document flags.
        doc = {
          ...current,
          ...withoutLocalFlags(fresh),
          name: current.name,
          modified: current['modified'],
          docstatus: 0,
        };
      } else {
        doc = await confirmRequest(
          this.erpnext.post<PaymentDoc>('frappe.client.insert', { doc: fresh }),
        );
        onInserted(doc.name);
      }
      payment = await confirmRequest(
        this.erpnext.post<PaymentDoc>('frappe.client.submit', { doc }),
      );
    } catch (error) {
      throw unresolvedOr(error);
    }
    return this.result(payment);
  }

  /** Looks a collection up by its Madar reference after an unresolved confirmation. */
  async find(reference: string): Promise<CollectionResult | 'not-found' | { draft: string }> {
    const [payment] = await firstValueFrom(
      this.erpnext.list<{ name: string; docstatus: number }>('Payment Entry', {
        fields: ['name', 'docstatus'],
        filters: [
          ['reference_no', '=', reference],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'docstatus desc',
        limit: 1,
      }),
    );
    if (!payment) {
      return 'not-found';
    }
    if (payment.docstatus === 0) {
      return { draft: payment.name };
    }
    return this.result(
      await firstValueFrom(this.erpnext.doc<PaymentDoc>('Payment Entry', payment.name)),
    );
  }

  private async paymentDoc(request: CollectionRequest): Promise<Record<string, unknown>> {
    // ERPNext's own "Get Payment Entry" fills party, receivable account, currencies and each reference's
    // totals, exactly as its Sales Invoice form does; Madar then sets the amounts and account.
    const entries = await Promise.all(
      request.allocations.map((a) =>
        firstValueFrom(
          this.erpnext.post<PaymentDoc & { references: Record<string, unknown>[] }>(
            'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry',
            // bank_account makes ERPNext fill paid_to's currency and type from the chosen account.
            { dt: 'Sales Invoice', dn: a.invoice, bank_account: request.account.account },
          ),
        ),
      ),
    );
    const [first] = entries;
    return {
      ...first,
      mode_of_payment: request.account.mode,
      paid_to: request.account.account,
      paid_amount: request.amount,
      received_amount: request.amount,
      // An early-payment discount adds a deduction; Madar collects the full amount, so none apply.
      deductions: [],
      // Bank modes require a reference; it also lets "Check result" find this payment.
      reference_no: request.reference,
      reference_date: first.posting_date,
      remarks: `Madar collection ${request.reference}`,
      references: entries.flatMap((entry, i) =>
        spread(entry.references, request.allocations[i].amount),
      ),
    };
  }

  /** Deletes a draft a failed confirmation left behind, so abandoned payments don't linger in ERPNext. */
  async discard(draft: string): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.client.delete', { doctype: 'Payment Entry', name: draft }),
    );
  }

  private async result(payment: PaymentDoc): Promise<CollectionResult> {
    // Invoices with payment terms have one reference row per term; report each invoice once.
    const names = [...new Set(payment.references.map((r) => r.reference_name))];
    const invoices = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        grand_total: number;
        rounded_total: number;
        outstanding_amount: number;
      }>('Sales Invoice', {
        fields: ['name', 'grand_total', 'rounded_total', 'outstanding_amount'],
        filters: [['name', 'in', names]],
        limit: 0,
      }),
    ).catch(() => []);
    return {
      payment: payment.name,
      postingDate: payment.posting_date,
      amount: payment.paid_amount,
      invoices: names.map((name): CollectedInvoice => {
        const invoice = invoices.find((i) => i.name === name);
        return {
          invoice: name,
          allocated: round2(
            payment.references
              .filter((r) => r.reference_name === name)
              .reduce((sum, r) => sum + r.allocated_amount, 0),
          ),
          total: invoice ? invoiceTotal(invoice) : 0,
          paid: invoice ? round2(invoiceTotal(invoice) - invoice.outstanding_amount) : 0,
          outstanding: invoice?.outstanding_amount ?? 0,
        };
      }),
    };
  }
}

/**
 * An invoice with payment terms comes back as one reference row per term. Each row's
 * `outstanding_amount` is the whole invoice's; what the term still owes is `payment_term_outstanding`.
 * Fill the rows in order so no term is allocated more than it owes.
 */
function spread(rows: Record<string, unknown>[], amount: number): Record<string, unknown>[] {
  let left = amount;
  return rows
    .map((row, i) => {
      const owed = Number(row['payment_term_outstanding'] ?? row['outstanding_amount'] ?? 0);
      const share = i === rows.length - 1 ? left : round2(Math.min(left, owed));
      left = round2(left - share);
      return { ...row, allocated_amount: share };
    })
    .filter((row) => row.allocated_amount > 0);
}

function withoutLocalFlags(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !key.startsWith('__')));
}
