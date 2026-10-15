import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PostedEarlierError,
  confirmRequest,
  reusableDraft,
  unresolvedOr,
} from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import {
  InvoicePreview,
  InvoiceRequest,
  LinkedPayment,
  OrderInvoice,
  SupplierInvoice,
} from './purchase.models';

interface InvoiceDoc {
  name: string;
  docstatus: number;
  supplier_name: string;
  bill_no: string | null;
  currency: string;
  grand_total: number;
  /** Zero when the company turns rounding off; outstanding follows it otherwise. */
  rounded_total?: number;
  outstanding_amount: number;
  items: {
    item_code: string;
    item_name: string;
    uom: string;
    qty: number;
    rate: number;
    purchase_order?: string | null;
    purchase_receipt?: string | null;
  }[];
  [key: string]: unknown;
}

/** What the supplier is owed: ERPNext rounds the total by default and bases outstanding on it. */
const payable = (doc: { grand_total: number; rounded_total?: number }) =>
  doc.rounded_total || doc.grand_total;

/** The receipts no longer bill what the user was shown: someone billed some of them meanwhile. */
export class BillingChangedError extends Error {
  constructor() {
    super('What is left to bill changed since it was shown');
  }
}

const MAKE_INVOICE =
  'erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice';

/** Supplier invoices: billing the goods received against an order, and reading invoices back. */
@Injectable({ providedIn: 'root' })
export class SupplierInvoiceApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** The received goods of an order that no invoice has billed yet, as ERPNext would bill them. */
  async preview(order: string): Promise<InvoicePreview> {
    const template = await this.template(order, await this.unbilledReceipts(order));
    if (!template) {
      return { receipts: [], lines: [], currency: '', total: 0 };
    }
    return {
      receipts: template.receipts,
      lines: template.doc.items.map((i) => ({
        code: i.item_code,
        name: i.item_name,
        uom: i.uom,
        qty: i.qty,
        rate: i.rate,
      })),
      currency: template.doc.currency,
      total: template.total,
    };
  }

  /**
   * Inserts and submits the invoice for the given receipts. A timeout or lost connection throws
   * UnresolvedError: the invoice may exist, so callers must look it up with find(), not resubmit.
   */
  async record(
    request: InvoiceRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<string> {
    const current = draft
      ? await reusableDraft(this.erpnext.doc<InvoiceDoc>('Purchase Invoice', draft))
      : null;
    if (current?.docstatus === 1) {
      // A slow earlier attempt posted it; that is this request's result only if nothing changed.
      if (!sameInvoice(current, request)) {
        throw new PostedEarlierError(current.name);
      }
      return current.name;
    }
    if (current) {
      // Rebuilt from the receipts rather than edited, so it bills exactly what is still unbilled.
      await this.discard(current.name);
    }
    const template = await this.template(request.order, request.receipts);
    // Built again now: if it no longer bills what the user confirmed, they must look again first.
    if (
      !template ||
      template.receipts.length !== request.receipts.length ||
      Math.abs(template.total - request.total) > 0.005
    ) {
      throw new BillingChangedError();
    }
    const doc = {
      ...template.doc,
      bill_no: request.billNo,
      remarks: `Madar bill ${request.reference}`,
    };
    try {
      const inserted = await confirmRequest(
        this.erpnext.post<InvoiceDoc>('frappe.client.insert', { doc }),
      );
      onInserted(inserted.name);
      const submitted = await confirmRequest(
        this.erpnext.post<InvoiceDoc>('frappe.client.submit', { doc: inserted }),
      );
      return submitted.name;
    } catch (error) {
      throw unresolvedOr(error);
    }
  }

  /** Looks an invoice up by its Madar reference after an unresolved confirmation. */
  async find(reference: string): Promise<{ invoice: string } | 'not-found' | { draft: string }> {
    const [invoice] = await firstValueFrom(
      this.erpnext.list<{ name: string; docstatus: number }>('Purchase Invoice', {
        fields: ['name', 'docstatus'],
        filters: [
          ['remarks', 'like', `%${reference}%`],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'docstatus desc',
        limit: 1,
      }),
    );
    if (!invoice) {
      return 'not-found';
    }
    return invoice.docstatus === 0 ? { draft: invoice.name } : { invoice: invoice.name };
  }

  /** Deletes an invoice draft a failed confirmation left behind. */
  async discard(draft: string): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.client.delete', { doctype: 'Purchase Invoice', name: draft }),
    );
  }

  async invoice(name: string): Promise<SupplierInvoice> {
    const [doc, payments] = await Promise.all([
      firstValueFrom(this.erpnext.doc<InvoiceDoc>('Purchase Invoice', name)),
      this.payments(name),
    ]);
    return {
      name: doc.name,
      billNo: doc.bill_no || null,
      supplierName: doc.supplier_name,
      order: doc.items.find((i) => i.purchase_order)?.purchase_order ?? null,
      currency: doc.currency,
      total: payable(doc),
      outstanding: doc.outstanding_amount,
      cancelled: doc.docstatus === 2,
      payments,
    };
  }

  /** The submitted supplier invoices that bill an order, newest first. */
  async forOrder(order: string): Promise<OrderInvoice[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        bill_no: string | null;
        currency: string;
        grand_total: number;
        rounded_total: number;
        outstanding_amount: number;
      }>('Purchase Invoice', {
        fields: [
          'name',
          'bill_no',
          'currency',
          'grand_total',
          'rounded_total',
          'outstanding_amount',
        ],
        filters: [
          ['Purchase Invoice Item', 'purchase_order', '=', order],
          ['docstatus', '=', 1],
          // Debit notes (supplier returns) aren't invoices to show or add up here.
          ['is_return', '=', 0],
        ],
        orderBy: 'creation desc',
        limit: 0,
      }),
    );
    // One row per matching item: an invoice billing two lines of the order comes back twice.
    const seen = new Set<string>();
    return rows
      .filter((r) => !seen.has(r.name) && seen.add(r.name))
      .map((r) => ({
        name: r.name,
        billNo: r.bill_no || null,
        currency: r.currency,
        total: payable(r),
        outstanding: r.outstanding_amount,
      }));
  }

  private async unbilledReceipts(order: string): Promise<string[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Purchase Receipt', {
        fields: ['name'],
        filters: [
          ['Purchase Receipt Item', 'purchase_order', '=', order],
          ['docstatus', '=', 1],
          ['is_return', '=', 0],
          ['per_billed', '<', 100],
        ],
        orderBy: 'posting_date asc',
        limit: 0,
      }),
    );
    return [...new Set(rows.map((r) => r.name))];
  }

  /**
   * ERPNext's invoice for several receipts: each mapping call adds one receipt's unbilled rows. A receipt that
   * ERPNext finds fully billed by quantity (billed at a lower rate, or partly returned) is skipped, and rows of
   * other orders on a shared receipt are left out. Null when nothing is left to bill.
   */
  private async template(
    order: string,
    receipts: readonly string[],
  ): Promise<{ doc: InvoiceDoc; receipts: string[]; total: number } | null> {
    let doc: InvoiceDoc | null = null;
    const used: string[] = [];
    for (const receipt of receipts) {
      try {
        doc = await firstValueFrom(
          this.erpnext.post<InvoiceDoc>(MAKE_INVOICE, {
            source_name: receipt,
            // The mapper only accepts the document to extend as a JSON string.
            ...(doc ? { target_doc: JSON.stringify(doc) } : {}),
          }),
        );
        used.push(receipt);
      } catch (error) {
        // "All items have already been Invoiced/Returned" is a validation error; anything else is real.
        if (ErpnextError.from(error).status !== 417) {
          throw error;
        }
      }
    }
    if (!doc) {
      return null;
    }
    const all = doc.items;
    const items = all.filter((i) => i.purchase_order === order);
    if (!items.length) {
      return null;
    }
    const kept = used.filter((r) => items.some((i) => i.purchase_receipt === r));
    // ERPNext recalculates on insert; for the preview, its total (with taxes and rounding) is scaled down to the
    // rows kept.
    const value = (rows: InvoiceDoc['items']) => rows.reduce((sum, i) => sum + i.qty * i.rate, 0);
    const total =
      items.length === all.length
        ? payable(doc)
        : Math.round(((payable(doc) * value(items)) / (value(all) || 1)) * 100) / 100;
    return { doc: { ...doc, items }, receipts: kept, total };
  }

  private async payments(invoice: string): Promise<LinkedPayment[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string; paid_from: string; allocated: number }>('Payment Entry', {
        fields: ['name', 'paid_from', 'references.allocated_amount as allocated'],
        filters: [
          ['Payment Entry Reference', 'reference_name', '=', invoice],
          ['docstatus', '=', 1],
        ],
        orderBy: 'posting_date asc',
        limit: 0,
      }),
    ).catch(() => []);
    if (!rows.length) {
      return [];
    }
    const accounts = await firstValueFrom(
      this.erpnext.list<{ name: string; account_name: string }>('Account', {
        fields: ['name', 'account_name'],
        filters: [['name', 'in', [...new Set(rows.map((r) => r.paid_from))]]],
        limit: 0,
      }),
    ).catch(() => []);
    return rows.map((r) => ({
      name: r.name,
      amount: r.allocated,
      account: accounts.find((a) => a.name === r.paid_from)?.account_name ?? r.paid_from,
    }));
  }
}

function sameInvoice(doc: InvoiceDoc, request: InvoiceRequest): boolean {
  const billed = new Set(doc.items.map((i) => i.purchase_receipt).filter(Boolean));
  return (
    (doc.bill_no ?? '') === request.billNo &&
    billed.size === request.receipts.length &&
    request.receipts.every((r) => billed.has(r))
  );
}
