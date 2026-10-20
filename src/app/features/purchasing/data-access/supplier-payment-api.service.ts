import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PostedEarlierError,
  UnresolvedError,
  confirmRequest,
  reusableDraft,
  unresolvedOr,
} from '../../../core/erpnext/confirmation';
import {
  DraftUnavailableError,
  missingAsUnavailable,
  referenceIn,
} from '../../../core/erpnext/draft';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { invoiceTotal } from '../../../core/erpnext/invoice-total';
import { spreadAllocation, withoutLocalFlags } from '../../../core/erpnext/payment-entry';
import { round2 } from '../../../core/format/number';
import {
  DraftPayment,
  SupplierPayment,
  SupplierPaymentRequest,
  UnpaidSupplierInvoice,
} from './purchase.models';

interface PaymentDoc {
  name: string;
  docstatus: number;
  party_name: string;
  paid_from: string;
  paid_amount: number;
  references: { reference_doctype?: string; reference_name: string; allocated_amount: number }[];
  [key: string]: unknown;
}

/** Paying suppliers: a submitted Payment Entry (Pay) allocated to one supplier invoice. */
@Injectable({ providedIn: 'root' })
export class SupplierPaymentApiService {
  private readonly erpnext = inject(ErpnextClient);

  /**
   * The supplier's invoices that still owe something, in the company currency, newest first. `include` (the
   * invoice the task was opened from) is always listed when it can be paid, even beyond the cap.
   */
  async unpaidInvoices(
    supplier: string,
    company: string,
    currency: string,
    include?: string,
  ): Promise<UnpaidSupplierInvoice[]> {
    const [rows, extra] = await Promise.all([
      this.unpaidRows(supplier, company, currency, null),
      include ? this.unpaidRows(supplier, company, currency, include) : [],
    ]);
    const all = rows.some((r) => r.name === include) ? rows : [...extra, ...rows];
    return all.map((r) => ({
      name: r.name,
      billNo: r.bill_no || null,
      total: invoiceTotal(r),
      outstanding: r.outstanding_amount,
    }));
  }

  private unpaidRows(supplier: string, company: string, currency: string, name: string | null) {
    return firstValueFrom(
      this.erpnext.list<{
        name: string;
        bill_no: string | null;
        grand_total: number;
        rounded_total: number;
        outstanding_amount: number;
      }>('Purchase Invoice', {
        fields: ['name', 'bill_no', 'grand_total', 'rounded_total', 'outstanding_amount'],
        filters: [
          ['supplier', '=', supplier],
          ['company', '=', company],
          // Foreign-currency invoices need ERPNext's exchange handling.
          ['currency', '=', currency],
          ['docstatus', '=', 1],
          ['outstanding_amount', '>', 0],
          ...(name ? [['name', '=', name] as Filter] : []),
        ],
        orderBy: 'posting_date desc, name desc',
        limit: name ? 1 : 50,
      }),
    );
  }

  /**
   * Inserts and submits the payment. A timeout or lost connection throws UnresolvedError: the payment may
   * exist, so callers must look it up with find(), not resubmit. Resolves to the payment's name.
   */
  async confirm(
    request: SupplierPaymentRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<string> {
    // Reading the draft and ERPNext's template writes nothing, so their errors are definite failures.
    const fresh = await this.paymentDoc(request);
    const current = draft
      ? await reusableDraft(this.erpnext.doc<PaymentDoc>('Payment Entry', draft))
      : null;
    if (current?.docstatus === 1) {
      // A slow earlier attempt recorded it after all; it's this request's result only if nothing changed.
      if (!samePayment(current, request)) {
        throw new PostedEarlierError(current.name);
      }
      return current.name;
    }
    try {
      let doc: Record<string, unknown>;
      if (current) {
        doc = this.overDraft(current, fresh);
      } else {
        doc = await confirmRequest(
          this.erpnext.post<PaymentDoc>('frappe.client.insert', { doc: fresh }),
        );
        onInserted((doc as PaymentDoc).name);
      }
      const payment = await confirmRequest(
        this.erpnext.post<PaymentDoc>('frappe.client.submit', { doc }),
      );
      return payment.name;
    } catch (error) {
      throw unresolvedOr(error);
    }
  }

  /** Saves the payment as an ERPNext draft (new, or over the remembered one) and returns its name. */
  async saveDraft(request: SupplierPaymentRequest, draft: string | null): Promise<string> {
    const fresh = await this.paymentDoc(request);
    const current = draft
      ? await reusableDraft(this.erpnext.doc<PaymentDoc>('Payment Entry', draft))
      : null;
    if (current?.docstatus === 1) {
      // Recorded by a slow earlier attempt: saving a draft now would start a second payment.
      throw new PostedEarlierError(current.name);
    }
    if (current) {
      const saved = await firstValueFrom(
        this.erpnext.post<PaymentDoc>('frappe.client.save', {
          doc: this.overDraft(current, fresh),
        }),
      );
      return saved.name;
    }
    try {
      const inserted = await confirmRequest(
        this.erpnext.post<PaymentDoc>('frappe.client.insert', { doc: fresh }),
      );
      return inserted.name;
    } catch (error) {
      // The insert may have gone through: adopt that draft rather than inserting a second one next time.
      if (!(error instanceof UnresolvedError)) {
        throw error;
      }
      const found = await this.find(request.reference).catch(() => 'not-found' as const);
      if (found !== 'not-found' && 'draft' in found) {
        return found.draft;
      }
      throw error;
    }
  }

  /** A draft supplier payment of this business that Madar made for one invoice; anything else can't be continued. */
  async draftPayment(name: string, scope: { company: string }): Promise<DraftPayment> {
    const doc = await firstValueFrom(this.erpnext.doc<PaymentDoc>('Payment Entry', name)).catch(
      (error) => {
        throw missingAsUnavailable(error, name);
      },
    );
    const reference = referenceIn(doc['reference_no'], 'PAYS');
    const invoices = [...new Set((doc.references ?? []).map((r) => r.reference_name))];
    if (
      doc.docstatus !== 0 ||
      doc['company'] !== scope.company ||
      doc['payment_type'] !== 'Pay' ||
      doc['party_type'] !== 'Supplier' ||
      !reference ||
      invoices.length !== 1 ||
      doc.references.some((r) => r.reference_doctype !== 'Purchase Invoice')
    ) {
      throw new DraftUnavailableError(name);
    }
    return {
      name: doc.name,
      reference,
      invoice: invoices[0],
      amount: doc.paid_amount,
      mode: (doc['mode_of_payment'] as string | null) || null,
    };
  }

  /** Looks a payment up by its Madar reference after an unresolved confirmation. */
  async find(reference: string): Promise<{ payment: string } | 'not-found' | { draft: string }> {
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
    return payment.docstatus === 0 ? { draft: payment.name } : { payment: payment.name };
  }

  /** Deletes a draft a failed confirmation left behind. */
  async discard(draft: string): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.client.delete', { doctype: 'Payment Entry', name: draft }),
    );
  }

  async payment(name: string): Promise<SupplierPayment> {
    const doc = await firstValueFrom(this.erpnext.doc<PaymentDoc>('Payment Entry', name));
    const [account] = await firstValueFrom(
      this.erpnext.list<{ account_name: string }>('Account', {
        fields: ['account_name'],
        filters: [['name', '=', doc.paid_from]],
        limit: 1,
      }),
    ).catch(() => []);
    // Invoices with payment terms have one reference row per term; report each invoice once.
    const names = [...new Set(doc.references.map((r) => r.reference_name))];
    return {
      name: doc.name,
      docstatus: doc.docstatus,
      supplierName: doc.party_name,
      amount: doc.paid_amount,
      paidFrom: account?.account_name ?? doc.paid_from,
      company: doc['company'] as string,
      reference: referenceIn(doc['reference_no'], 'PAYS'),
      toSupplier: doc['payment_type'] === 'Pay' && doc['party_type'] === 'Supplier',
      invoices: names.map((invoice) => ({
        invoice,
        allocated: round2(
          doc.references
            .filter((r) => r.reference_name === invoice)
            .reduce((sum, r) => sum + r.allocated_amount, 0),
        ),
      })),
    };
  }

  private async paymentDoc(request: SupplierPaymentRequest): Promise<Record<string, unknown>> {
    // ERPNext's own "Get Payment Entry" fills party, payable account, currencies and each reference's totals,
    // exactly as its Purchase Invoice form does; Madar then sets the amount and account.
    const entry = await firstValueFrom(
      this.erpnext.post<PaymentDoc & { references: Record<string, unknown>[] }>(
        'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry',
        // bank_account makes ERPNext fill paid_from's currency and type from the chosen account.
        { dt: 'Purchase Invoice', dn: request.invoice, bank_account: request.account.account },
      ),
    );
    return {
      ...entry,
      mode_of_payment: request.account.mode,
      paid_from: request.account.account,
      paid_amount: request.amount,
      received_amount: request.amount,
      // An early-payment discount adds a deduction; Madar pays the amount entered, so none apply.
      deductions: [],
      // Bank modes require a reference; it also lets "Check result" find this payment.
      reference_no: request.reference,
      reference_date: entry['posting_date'],
      remarks: `Madar supplier payment ${request.reference}`,
      references: spreadAllocation(entry.references, request.amount),
    };
  }

  /** The fresh template over a remembered draft, keeping the draft's identity: never a second document. */
  private overDraft(current: PaymentDoc, fresh: Record<string, unknown>): Record<string, unknown> {
    return {
      ...current,
      ...withoutLocalFlags(fresh),
      name: current.name,
      modified: current['modified'],
      docstatus: 0,
    };
  }
}

function samePayment(payment: PaymentDoc, request: SupplierPaymentRequest): boolean {
  const allocated = round2(
    payment.references
      .filter((r) => r.reference_name === request.invoice)
      .reduce((sum, r) => sum + r.allocated_amount, 0),
  );
  return (
    round2(payment.paid_amount) === round2(request.amount) &&
    payment.paid_from === request.account.account &&
    new Set(payment.references.map((r) => r.reference_name)).size === 1 &&
    allocated === round2(request.amount)
  );
}
