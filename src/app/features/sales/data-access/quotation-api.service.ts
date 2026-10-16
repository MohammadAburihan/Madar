import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PostedEarlierError,
  confirmRequest,
  reusableDraft,
  unresolvedOr,
} from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { HtmlPdfService } from '../../../core/erpnext/html-pdf.service';
import { QuotationDetail, QuotationRequest } from './quotation.models';

interface QuotationDoc {
  name: string;
  docstatus: number;
  status: string;
  party_name: string;
  customer_name: string;
  transaction_date: string;
  valid_till: string | null;
  base_grand_total: number;
  base_rounded_total: number;
  items?: {
    item_code: string;
    item_name: string;
    qty: number;
    uom: string;
    rate: number;
    base_rate: number;
    base_amount: number;
  }[];
  [key: string]: unknown;
}

/** Quotations: drafting, confirming and reading them, and their PDF. */
@Injectable({ providedIn: 'root' })
export class QuotationApiService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly htmlPdf = inject(HtmlPdfService);

  /**
   * Inserts and submits the quotation, or submits the remembered draft. A timeout throws UnresolvedError: callers
   * look it up with find() instead of submitting again.
   */
  async confirm(
    request: QuotationRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<string> {
    const current = draft
      ? await reusableDraft(this.erpnext.doc<QuotationDoc>('Quotation', draft))
      : null;
    if (current?.docstatus === 1) {
      // A slow earlier attempt confirmed it; that is this request's result only if nothing changed.
      if (!sameQuotation(current, request)) {
        throw new PostedEarlierError(current.name);
      }
      return current.name;
    }
    try {
      const doc = current
        ? {
            ...current,
            ...this.quotationDoc(request),
            name: current.name,
            modified: current['modified'],
          }
        : await confirmRequest(
            this.erpnext.post<QuotationDoc>('frappe.client.insert', {
              doc: this.quotationDoc(request),
            }),
          );
      if (!current) {
        onInserted(doc.name);
      }
      const submitted = await confirmRequest(
        this.erpnext.post<QuotationDoc>('frappe.client.submit', { doc }),
      );
      return submitted.name;
    } catch (error) {
      throw unresolvedOr(error);
    }
  }

  /** Saves the quotation as a draft (new, or over the remembered one) and returns its name. */
  async saveDraft(request: QuotationRequest, draft: string | null): Promise<string> {
    const current = draft
      ? await reusableDraft(this.erpnext.doc<QuotationDoc>('Quotation', draft))
      : null;
    if (current?.docstatus === 1) {
      // Confirmed by a slow earlier attempt: saving a draft now would start a second quotation.
      throw new PostedEarlierError(current.name);
    }
    if (current) {
      const saved = await firstValueFrom(
        this.erpnext.post<QuotationDoc>('frappe.client.save', {
          doc: { ...current, ...this.quotationDoc(request), name: current.name },
        }),
      );
      return saved.name;
    }
    const inserted = await firstValueFrom(
      this.erpnext.post<QuotationDoc>('frappe.client.insert', { doc: this.quotationDoc(request) }),
    );
    return inserted.name;
  }

  /** Looks a quotation up by its Madar reference after an unresolved confirmation. */
  async find(reference: string): Promise<{ quotation: string } | 'not-found' | { draft: string }> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string; docstatus: number }>('Quotation', {
        fields: ['name', 'docstatus'],
        filters: [
          ['utm_content', '=', reference],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'docstatus desc',
        limit: 1,
      }),
    );
    if (!row) {
      return 'not-found';
    }
    return row.docstatus === 0 ? { draft: row.name } : { quotation: row.name };
  }

  /** Deletes a draft a failed confirmation left behind. */
  async discard(draft: string): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.client.delete', { doctype: 'Quotation', name: draft }),
    );
  }

  async quotation(name: string): Promise<QuotationDetail> {
    const doc = await firstValueFrom(this.erpnext.doc<QuotationDoc>('Quotation', name));
    const codes = [...new Set((doc.items ?? []).map((i) => i.item_code))];
    const stocked = codes.length
      ? await firstValueFrom(
          this.erpnext.list<{ name: string }>('Item', {
            fields: ['name'],
            filters: [
              ['name', 'in', codes],
              ['is_stock_item', '=', 1],
            ],
            limit: 0,
          }),
        ).catch(() => [])
      : [];
    const stock = new Set(stocked.map((i) => i.name));
    return {
      name: doc.name,
      customer: doc.party_name,
      customerName: doc.customer_name || doc.party_name,
      docstatus: doc.docstatus,
      status: doc.status,
      date: doc.transaction_date,
      validTill: doc.valid_till,
      total: doc.base_rounded_total || doc.base_grand_total,
      lines: (doc.items ?? []).map((i) => ({
        code: i.item_code,
        name: i.item_name,
        qty: Number(i.qty),
        uom: i.uom,
        // Company currency, like the total: a quotation made in Desk may be in the customer's currency.
        rate: Number(i.base_rate),
        amount: Number(i.base_amount),
        isStock: stock.has(i.item_code),
      })),
    };
  }

  /** The quotation page Madar builds, rendered to PDF on the server, for sharing with the customer. */
  pdf(html: string): Promise<Blob> {
    return this.htmlPdf.render(html);
  }

  private quotationDoc(request: QuotationRequest): Record<string, unknown> {
    return {
      doctype: 'Quotation',
      quotation_to: 'Customer',
      party_name: request.customer,
      company: request.company,
      currency: request.currency,
      transaction_date: request.date,
      valid_till: request.validTill,
      utm_content: request.reference,
      // The quoted rates and total are what the user saw: no pricing rules, default taxes or rounding.
      ignore_pricing_rule: 1,
      disable_rounded_total: 1,
      taxes_and_charges: '',
      taxes: [],
      items: request.lines.map((l) => ({
        item_code: l.item,
        qty: l.qty,
        uom: l.uom,
        // Without a list rate ERPNext fills in the list price, even over a rate of 0.
        price_list_rate: l.rate,
        rate: l.rate,
      })),
    };
  }
}

function sameQuotation(doc: QuotationDoc, request: QuotationRequest): boolean {
  const rows = doc.items ?? [];
  return (
    doc.party_name === request.customer &&
    rows.length === request.lines.length &&
    request.lines.every(
      (l, i) =>
        rows[i].item_code === l.item &&
        Math.abs(Number(rows[i].qty) - l.qty) <= 0.005 + 1e-9 &&
        Math.abs(Number(rows[i].rate) - l.rate) <= 0.005 + 1e-9,
    )
  );
}
