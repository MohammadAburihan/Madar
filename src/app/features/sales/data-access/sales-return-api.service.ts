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
import { ReturnRequest, ReturnResult, ReturnSource, canReturn } from './sales-return.models';
import { stockedItems } from './stocked-items';

interface InvoiceRow {
  name?: string;
  item_code: string;
  item_name: string;
  qty: number;
  uom: string;
  base_net_rate: number;
  warehouse?: string | null;
  sales_invoice_item?: string | null;
  [key: string]: unknown;
}

interface InvoiceDoc {
  name: string;
  docstatus: number;
  is_return?: number;
  is_pos?: number;
  customer_name: string;
  update_stock: number;
  base_grand_total: number;
  base_rounded_total: number;
  base_net_total?: number;
  outstanding_amount: number;
  conversion_rate: number;
  party_account_currency?: string | null;
  remarks?: string | null;
  items: InvoiceRow[];
  [key: string]: unknown;
}

const MAKE_SALES_RETURN = 'erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return';

/** Thrown when the invoice has less left to return than the user confirmed (returned in Desk meanwhile). */
export class ReturnChangedError extends Error {
  constructor() {
    super('The invoice has less left to return');
  }
}

const owed = (doc: { base_rounded_total: number; base_grand_total: number }) =>
  doc.base_rounded_total || doc.base_grand_total;

/** The receivable's outstanding in the company currency (it may be kept in the customer's). */
const outstandingIn = (doc: InvoiceDoc, currency: string) =>
  Number(doc.outstanding_amount) *
  (doc.party_account_currency === currency ? 1 : Number(doc.conversion_rate) || 1);

/** Returns against a sales invoice: a credit note that brings the goods back and reduces what is owed. */
@Injectable({ providedIn: 'root' })
export class SalesReturnApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** The invoice and what each of its rows still has to return, from ERPNext's own return mapper. */
  async source(invoice: string, currency: string): Promise<ReturnSource> {
    const [doc, template, credits] = await Promise.all([
      firstValueFrom(this.erpnext.doc<InvoiceDoc>('Sales Invoice', invoice)),
      // ERPNext answers 417 when every row is returned already: nothing is left.
      this.template(invoice).catch((error: unknown) => {
        if (ErpnextError.from(error).status === 417) {
          return { items: [] as InvoiceRow[] };
        }
        throw error;
      }),
      firstValueFrom(
        this.erpnext.list<{ base_grand_total: number; update_outstanding_for_self: number }>(
          'Sales Invoice',
          {
            fields: ['base_grand_total', 'update_outstanding_for_self'],
            filters: [
              ['return_against', '=', invoice],
              ['is_return', '=', 1],
              ['docstatus', '=', 1],
            ],
            limit: 0,
          },
        ),
      ),
    ]);
    // Earlier returns that reduced this invoice's outstanding aren't payments.
    const credited = credits
      .filter((c) => !c.update_outstanding_for_self)
      .reduce((sum, c) => sum + Math.abs(Number(c.base_grand_total)), 0);
    const outstanding = outstandingIn(doc, currency);
    // Taxes and rounding scale every row alike, so a row's credit is its net amount in the same proportion.
    const net = Number(doc.base_net_total) || 0;
    const scale = net ? Math.abs(owed(doc) / net) : 1;
    const left = new Map(template.items.map((i) => [i.sales_invoice_item, -Number(i.qty)]));
    const stock = await stockedItems(
      this.erpnext,
      doc.items.map((i) => i.item_code),
    );
    return {
      invoice: doc.name,
      customerName: doc.customer_name,
      movesStock: !!doc.update_stock,
      returnable: canReturn({
        docstatus: doc.docstatus,
        isReturn: !!doc.is_return,
        isPos: !!doc.is_pos,
        movesStock: !!doc.update_stock,
        hasGoods: stock.size > 0,
      }),
      total: owed(doc),
      outstanding,
      paid: Math.max(Math.round((owed(doc) - outstanding - credited) * 100) / 100, 0),
      lines: doc.items.map((i) => ({
        row: i.name ?? '',
        code: i.item_code,
        name: i.item_name,
        uom: i.uom,
        sold: Number(i.qty),
        returnable: Math.max(left.get(i.name) ?? 0, 0),
        rate: Number(i.base_net_rate) * scale,
        warehouse: i.warehouse ?? null,
        isStock: stock.has(i.item_code),
      })),
    };
  }

  /**
   * Posts the credit note. It reduces the original invoice's outstanding (ERPNext keeps the credit on the note
   * instead when it is larger than what is owed). A timeout throws UnresolvedError: callers look it up with find().
   */
  async confirm(
    request: ReturnRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<ReturnResult> {
    const remembered = draft
      ? await reusableDraft(this.erpnext.doc<InvoiceDoc>('Sales Invoice', draft))
      : null;
    // Posted with this task's reference, it is this request's result; posted otherwise, it is someone else's.
    const ours = String(remembered?.remarks ?? '').includes(request.reference);
    if (remembered?.docstatus === 1 && ours) {
      // Posted by a slow earlier attempt: this request's result only if it returned what is asked now.
      if (!sameReturn(remembered, request)) {
        throw new PostedEarlierError(remembered.name);
      }
      return this.result(remembered, request);
    }
    const current = remembered?.docstatus === 0 ? remembered : null;
    try {
      const [template, original] = await Promise.all([
        this.template(request.invoice).catch((error: unknown) => {
          // Everything was returned since the form loaded.
          throw ErpnextError.from(error).status === 417 ? new ReturnChangedError() : error;
        }),
        firstValueFrom(this.erpnext.doc<InvoiceDoc>('Sales Invoice', request.invoice)),
      ]);
      const qty = new Map(request.lines.map((l) => [l.row, l.qty]));
      const left = new Map(template.items.map((i) => [i.sales_invoice_item, -Number(i.qty)]));
      if (request.lines.some((l) => (left.get(l.row) ?? 0) < l.qty - 1e-9)) {
        throw new ReturnChangedError();
      }
      // The mapper copies the whole fixed discount and "Actual" charges; a part return takes its share by value.
      const value = (rows: { qty: number; rate: number }[]) =>
        rows.reduce((sum, r) => sum + Math.abs(r.qty) * r.rate, 0);
      const sold = value(
        original.items.map((i) => ({ qty: Number(i.qty), rate: Number(i['rate']) })),
      );
      const share = sold
        ? value(
            original.items
              .filter((i) => i.name && qty.has(i.name))
              .map((i) => ({ qty: qty.get(i.name!)!, rate: Number(i['rate']) })),
          ) / sold
        : 1;
      const scaled = (amount: unknown) => Math.round(Number(amount ?? 0) * share * 100) / 100;
      const taxes = ((template['taxes'] ?? []) as Record<string, unknown>[]).map((t) =>
        t['charge_type'] === 'Actual' ? { ...t, tax_amount: scaled(t['tax_amount']) } : t,
      );
      const fields = {
        ...Object.fromEntries(Object.entries(template).filter(([key]) => !key.startsWith('__'))),
        // Credits the original invoice; ERPNext keeps it on the note itself when it exceeds what is owed.
        update_outstanding_for_self: 0,
        taxes,
        // A percentage discount is worked out again from the returned rows; a fixed one isn't.
        ...(Number(template['additional_discount_percentage'])
          ? {}
          : { discount_amount: scaled(template['discount_amount']) }),
        remarks: [`Madar return ${request.reference}`, request.reason.trim()]
          .filter(Boolean)
          .join(' · '),
        ...(template.update_stock && request.warehouse ? { set_warehouse: request.warehouse } : {}),
        items: template.items
          .filter((i) => i.sales_invoice_item && qty.has(i.sales_invoice_item))
          .map((i) => ({
            ...i,
            qty: -qty.get(i.sales_invoice_item!)!,
            ...(template.update_stock && request.warehouse ? { warehouse: request.warehouse } : {}),
          })),
      };
      let doc: InvoiceDoc;
      if (current) {
        // Selling roles can't delete the draft a failed try left: it is rebuilt in place.
        doc = await confirmRequest(
          this.erpnext.post<InvoiceDoc>('frappe.client.save', {
            doc: {
              ...fields,
              name: current.name,
              modified: current['modified'],
              creation: current['creation'],
              owner: current['owner'],
            },
          }),
        );
      } else {
        doc = await confirmRequest(
          this.erpnext.post<InvoiceDoc>('frappe.client.insert', { doc: fields }),
        );
        onInserted(doc.name);
      }
      const submitted = await confirmRequest(
        this.erpnext.post<InvoiceDoc>('frappe.client.submit', { doc }),
      );
      return await this.result(submitted, request);
    } catch (error) {
      throw error instanceof ReturnChangedError ? error : unresolvedOr(error);
    }
  }

  /** Looks a return up by its Madar reference after an unresolved confirmation. */
  async find(
    request: ReturnRequest,
  ): Promise<{ result: ReturnResult } | 'not-found' | { draft: string }> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string; docstatus: number }>('Sales Invoice', {
        fields: ['name', 'docstatus'],
        filters: [
          ['remarks', 'like', `%${request.reference}%`],
          ['is_return', '=', 1],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'docstatus desc',
        limit: 1,
      }),
    );
    if (!row) {
      return 'not-found';
    }
    if (row.docstatus === 0) {
      return { draft: row.name };
    }
    const doc = await firstValueFrom(this.erpnext.doc<InvoiceDoc>('Sales Invoice', row.name));
    return { result: await this.result(doc, request) };
  }

  private template(invoice: string): Promise<InvoiceDoc> {
    return firstValueFrom(
      this.erpnext.post<InvoiceDoc>(MAKE_SALES_RETURN, { source_name: invoice }),
    );
  }

  private async result(note: InvoiceDoc, request: ReturnRequest): Promise<ReturnResult> {
    const original = await firstValueFrom(
      this.erpnext.doc<InvoiceDoc>('Sales Invoice', request.invoice),
    );
    return {
      name: note.name,
      credit: Math.abs(owed(note)),
      dueAfter: outstandingIn(original, request.currency),
    };
  }
}

function sameReturn(note: InvoiceDoc, request: ReturnRequest): boolean {
  const rows = note.items ?? [];
  return (
    rows.length === request.lines.length &&
    request.lines.every((l) =>
      rows.some((r) => r.sales_invoice_item === l.row && Math.abs(-Number(r.qty) - l.qty) <= 1e-6),
    )
  );
}
