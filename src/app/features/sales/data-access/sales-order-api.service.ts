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
  DeliveryRequest,
  OrderFromQuotationRequest,
  OrderInvoicePreview,
  OrderInvoiceRequest,
  OrderInvoiceResult,
  SalesOrderDetail,
} from './sales-order.models';
import { stockedItems } from './stocked-items';

interface OrderItem {
  name: string;
  item_code: string;
  item_name: string;
  qty: number;
  delivered_qty: number;
  conversion_factor?: number;
  delivered_by_supplier?: number;
  uom: string;
  base_rate: number;
  base_amount: number;
  prevdoc_docname?: string | null;
  delivery_date?: string | null;
  [key: string]: unknown;
}

interface OrderDoc {
  name: string;
  docstatus: number;
  status: string;
  customer: string;
  customer_name: string;
  delivery_status: string;
  billing_status: string;
  transaction_date: string;
  delivery_date: string | null;
  base_grand_total: number;
  base_rounded_total: number;
  utm_content?: string | null;
  items?: OrderItem[];
  [key: string]: unknown;
}

interface DeliveryDoc {
  name: string;
  docstatus: number;
  set_warehouse?: string | null;
  items: { so_detail?: string | null; item_code: string; qty: number; [key: string]: unknown }[];
  [key: string]: unknown;
}

interface InvoiceDoc {
  name: string;
  docstatus: number;
  base_grand_total: number;
  base_rounded_total: number;
  outstanding_amount?: number;
  items: {
    item_code: string;
    item_name: string;
    qty: number;
    base_amount: number;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}

const MAKE_SALES_ORDER = 'erpnext.selling.doctype.quotation.quotation.make_sales_order';
const MAKE_DELIVERY_NOTE = 'erpnext.selling.doctype.sales_order.sales_order.make_delivery_note';
const MAKE_SALES_INVOICE = 'erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice';

/** Thrown when the order has less left to deliver than the user confirmed (delivered in Desk meanwhile). */
export class DeliveryChangedError extends Error {
  constructor() {
    super('The order has less left to deliver');
  }
}

/** Thrown when ERPNext would now invoice another amount than the user reviewed (billed in Desk meanwhile). */
export class InvoiceChangedError extends Error {
  constructor() {
    super('The order would now be invoiced for another amount');
  }
}

const owed = (doc: { base_rounded_total: number; base_grand_total: number }) =>
  doc.base_rounded_total || doc.base_grand_total;

/** Sales orders: making one from a quotation, reading it, and changing when it is expected. */
@Injectable({ providedIn: 'root' })
export class SalesOrderApiService {
  private readonly erpnext = inject(ErpnextClient);

  async order(name: string): Promise<SalesOrderDetail> {
    const doc = await firstValueFrom(this.erpnext.doc<OrderDoc>('Sales Order', name));
    const items = doc.items ?? [];
    // Unreadable items read as goods: their counts are still right, only a service's wording would be.
    const stock = await stockedItems(
      this.erpnext,
      items.map((i) => i.item_code),
    ).catch(() => new Set(items.map((i) => i.item_code)));
    return {
      name: doc.name,
      customer: doc.customer,
      customerName: doc.customer_name || doc.customer,
      docstatus: doc.docstatus,
      status: doc.status,
      deliveryStatus: doc.delivery_status,
      billingStatus: doc.billing_status,
      date: doc.transaction_date,
      deliveryDate: doc.delivery_date,
      quotation: items.find((i) => i.prevdoc_docname)?.prevdoc_docname ?? null,
      total: doc.base_rounded_total || doc.base_grand_total,
      lines: items.map((i) => ({
        row: i.name,
        code: i.item_code,
        name: i.item_name,
        uom: i.uom,
        qty: Number(i.qty),
        deliveredQty: Number(i.delivered_qty ?? 0),
        conversionFactor: Number(i.conversion_factor) || 1,
        // Company currency, like the total: an order made in Desk may be in the customer's currency.
        rate: Number(i.base_rate),
        amount: Number(i.base_amount),
        isStock: stock.has(i.item_code),
        bySupplier: !!i.delivered_by_supplier,
      })),
    };
  }

  /** The submitted orders made from a quotation, newest first. */
  async ordersFor(quotation: string): Promise<string[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Sales Order', {
        fields: ['name'],
        filters: [
          ['Sales Order Item', 'prevdoc_docname', '=', quotation],
          ['docstatus', '=', 1],
        ],
        // One row per matching item otherwise, which would crowd older orders out.
        groupBy: 'name',
        orderBy: 'creation desc',
        limit: 20,
      }),
    );
    return [...new Set(rows.map((r) => r.name))];
  }

  /**
   * Makes and submits a sales order from a quotation, or settles the remembered draft. A timeout throws
   * UnresolvedError: callers look it up with find() instead of submitting again.
   */
  async fromQuotation(
    request: OrderFromQuotationRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<string> {
    const current = draft
      ? await reusableDraft(this.erpnext.doc<OrderDoc>('Sales Order', draft))
      : null;
    if (current?.docstatus === 1) {
      // A slow earlier attempt submitted it; that is this request's result only if nothing changed.
      if (!sameOrder(current, request)) {
        throw new PostedEarlierError(current.name);
      }
      return current.name;
    }
    if (current) {
      // Rebuilt from the quotation rather than edited, so the order always matches what is left to order.
      await this.discard(current.name);
    }
    const template = await firstValueFrom(
      this.erpnext.post<OrderDoc>(MAKE_SALES_ORDER, { source_name: request.quotation }),
    );
    const doc = {
      ...template,
      delivery_date: request.deliveryDate,
      // The mapper copies the quotation's own reference; the order needs its own for lookups.
      utm_content: request.reference,
      // The quoted rates are what the customer agreed to: no pricing rules re-apply.
      ignore_pricing_rule: 1,
      items: (template.items ?? []).map((i) => ({ ...i, delivery_date: request.deliveryDate })),
    };
    try {
      const inserted = await confirmRequest(
        this.erpnext.post<OrderDoc>('frappe.client.insert', { doc }),
      );
      onInserted(inserted.name);
      const submitted = await confirmRequest(
        this.erpnext.post<OrderDoc>('frappe.client.submit', { doc: inserted }),
      );
      return submitted.name;
    } catch (error) {
      throw unresolvedOr(error);
    }
  }

  /** Looks an order up by its Madar reference after an unresolved confirmation. */
  async find(reference: string): Promise<{ order: string } | 'not-found' | { draft: string }> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string; docstatus: number }>('Sales Order', {
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
    return row.docstatus === 0 ? { draft: row.name } : { order: row.name };
  }

  /** Deletes a draft a failed confirmation left behind. */
  async discard(draft: string): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.client.delete', { doctype: 'Sales Order', name: draft }),
    );
  }

  /** Moves the order's expected delivery; ERPNext takes the order's date from its rows, so they all move. */
  async setDeliveryDate(name: string, date: string): Promise<void> {
    const doc = await firstValueFrom(this.erpnext.doc<OrderDoc>('Sales Order', name));
    await firstValueFrom(
      this.erpnext.post('frappe.client.save', {
        doc: {
          ...doc,
          delivery_date: date,
          items: (doc.items ?? []).map((i) => ({ ...i, delivery_date: date })),
        },
      }),
    );
  }

  /** What each item has in each of the warehouses, in stock units: item code → warehouse → quantity. */
  async stock(
    codes: string[],
    warehouses: string[],
  ): Promise<Record<string, Record<string, number>>> {
    const unique = [...new Set(codes)];
    if (!unique.length || !warehouses.length) {
      return {};
    }
    const bins = await firstValueFrom(
      this.erpnext.list<{ item_code: string; warehouse: string; actual_qty: number }>('Bin', {
        fields: ['item_code', 'warehouse', 'actual_qty'],
        filters: [
          ['item_code', 'in', unique],
          ['warehouse', 'in', warehouses],
        ],
        limit: 0,
      }),
    );
    const stock: Record<string, Record<string, number>> = {};
    for (const b of bins) {
      (stock[b.item_code] ??= {})[b.warehouse] = Number(b.actual_qty);
    }
    return stock;
  }

  /**
   * Posts a delivery note for part or all of an order's goods. A timeout throws UnresolvedError: the delivery may
   * exist, so callers look it up with findDelivery(), not resubmit. Resolves to its name.
   */
  async deliver(
    request: DeliveryRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<string> {
    const current = draft
      ? await reusableDraft(this.erpnext.doc<DeliveryDoc>('Delivery Note', draft))
      : null;
    if (current?.docstatus === 1) {
      // A slow earlier attempt posted it; that is this request's result only if nothing changed.
      if (!sameDelivery(current, request)) {
        throw new PostedEarlierError(current.name);
      }
      return current.name;
    }
    if (current) {
      // Rebuilt from the order rather than edited, so the rows always match what is delivered now.
      await this.discardDelivery(current.name);
    }
    const template = await firstValueFrom(
      this.erpnext.post<DeliveryDoc>(MAKE_DELIVERY_NOTE, { source_name: request.order }),
    ).catch((error: unknown) => {
      throw ErpnextError.from(error).status === 417 ? new DeliveryChangedError() : error;
    });
    const qty = new Map(request.lines.map((l) => [l.row, l.qty]));
    // Delivered in Desk since the form loaded: every confirmed row must still have that much left.
    const left = new Map(template.items.map((i) => [i.so_detail, Number(i.qty)]));
    if (request.lines.some((l) => (left.get(l.row) ?? 0) < l.qty - 1e-9)) {
      throw new DeliveryChangedError();
    }
    const doc = {
      ...template,
      set_warehouse: request.warehouse,
      // The mapper copies the order's reference; the delivery needs its own for lookups.
      utm_content: request.reference,
      // Only the rows delivering something now; services count as delivered once their work is done.
      items: template.items
        .filter((i) => i.so_detail && qty.has(i.so_detail))
        .map((i) => ({ ...i, qty: qty.get(i.so_detail!), warehouse: request.warehouse })),
    };
    try {
      const inserted = await confirmRequest(
        this.erpnext.post<DeliveryDoc>('frappe.client.insert', { doc }),
      );
      onInserted(inserted.name);
      const submitted = await confirmRequest(
        this.erpnext.post<DeliveryDoc>('frappe.client.submit', { doc: inserted }),
      );
      return submitted.name;
    } catch (error) {
      throw unresolvedOr(error);
    }
  }

  /** Looks a delivery up by its Madar reference after an unresolved confirmation. */
  async findDelivery(
    reference: string,
  ): Promise<{ delivery: string } | 'not-found' | { draft: string }> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string; docstatus: number }>('Delivery Note', {
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
    return row.docstatus === 0 ? { draft: row.name } : { delivery: row.name };
  }

  /** Deletes a delivery draft a failed confirmation left behind. */
  async discardDelivery(draft: string): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.client.delete', { doctype: 'Delivery Note', name: draft }),
    );
  }

  /** What invoicing the order now would bill: ERPNext's own mapper, nothing saved. */
  async invoicePreview(order: string): Promise<OrderInvoicePreview> {
    const template = await firstValueFrom(
      this.erpnext.post<InvoiceDoc>(MAKE_SALES_INVOICE, { source_name: order }),
    );
    const stock = await stockedItems(
      this.erpnext,
      template.items.map((i) => i.item_code),
    ).catch(() => new Set<string>());
    return {
      lines: template.items.map((i) => ({
        code: i.item_code,
        name: i.item_name,
        qty: Number(i.qty),
        amount: Number(i.base_amount),
        isStock: stock.has(i.item_code),
      })),
      total: owed(template),
    };
  }

  /**
   * Invoices what the order still has to bill, without moving stock. A timeout throws UnresolvedError; callers
   * look it up with findInvoice().
   */
  async invoice(
    request: OrderInvoiceRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<OrderInvoiceResult> {
    const remembered = draft
      ? await reusableDraft(this.erpnext.doc<InvoiceDoc>('Sales Invoice', draft))
      : null;
    // Posted with this task's reference, it is this request's result; posted otherwise (in Desk, after an
    // earlier visit), it is someone else's invoice and the rest is billed anew.
    const ours = remembered && String(remembered['remarks'] ?? '').includes(request.reference);
    if (remembered?.docstatus === 1 && ours) {
      return invoiceResult(remembered, request.currency);
    }
    const current = remembered?.docstatus === 0 ? remembered : null;
    try {
      const template = await firstValueFrom(
        this.erpnext.post<InvoiceDoc>(MAKE_SALES_INVOICE, { source_name: request.order }),
      ).catch((error: unknown) => {
        // Everything was billed since the review: the review must reload to say so.
        throw ErpnextError.from(error).status === 417 ? new InvoiceChangedError() : error;
      });
      // Billed in Desk since the review, or prices changed: the user must see the new amount first.
      if (Math.abs(owed(template) - request.total) > 0.005) {
        throw new InvoiceChangedError();
      }
      const fields = {
        ...Object.fromEntries(Object.entries(template).filter(([key]) => !key.startsWith('__'))),
        // The goods leave through delivery notes; the invoice moves no stock.
        update_stock: 0,
        remarks: `Madar order invoice ${request.reference}`,
      };
      let doc: InvoiceDoc;
      if (current) {
        // Invoicing roles can't delete the draft a failed try left: it is rebuilt in place from what is left to bill.
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
      return invoiceResult(submitted, request.currency);
    } catch (error) {
      throw error instanceof InvoiceChangedError ? error : unresolvedOr(error);
    }
  }

  /** Looks an invoice up by its Madar reference after an unresolved confirmation. */
  async findInvoice(
    reference: string,
    currency: string,
  ): Promise<{ invoice: OrderInvoiceResult } | 'not-found' | { draft: string }> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        docstatus: number;
        base_grand_total: number;
        base_rounded_total: number;
        outstanding_amount: number;
        conversion_rate: number;
        party_account_currency: string | null;
      }>('Sales Invoice', {
        fields: [
          'name',
          'docstatus',
          'base_grand_total',
          'base_rounded_total',
          'outstanding_amount',
          'conversion_rate',
          'party_account_currency',
        ],
        filters: [
          ['remarks', 'like', `%${reference}%`],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'docstatus desc',
        limit: 1,
      }),
    );
    if (!row) {
      return 'not-found';
    }
    return row.docstatus === 0 ? { draft: row.name } : { invoice: invoiceResult(row, currency) };
  }
}

/** Both amounts in the company currency: the outstanding is the receivable's, which may be the customer's currency. */
function invoiceResult(
  doc: {
    name: string;
    base_grand_total: number;
    base_rounded_total: number;
    outstanding_amount?: number;
    conversion_rate?: number;
    party_account_currency?: string | null;
  },
  currency: string,
): OrderInvoiceResult {
  const total = owed(doc);
  const rate = doc.party_account_currency === currency ? 1 : Number(doc.conversion_rate) || 1;
  return {
    name: doc.name,
    total,
    outstanding:
      doc.outstanding_amount === undefined ? total : Number(doc.outstanding_amount) * rate,
  };
}

function sameDelivery(doc: DeliveryDoc, request: DeliveryRequest): boolean {
  const rows = doc.items ?? [];
  return (
    rows.length === request.lines.length &&
    request.lines.every((l) =>
      rows.some(
        (r) =>
          r.so_detail === l.row &&
          Math.abs(Number(r.qty) - l.qty) <= 1e-6 &&
          (r['warehouse'] ?? doc.set_warehouse) === request.warehouse,
      ),
    )
  );
}

/** Nothing the user chooses goes into the order; a retry after midnight only moves "today". */
function sameOrder(doc: OrderDoc, request: OrderFromQuotationRequest): boolean {
  return (doc.items ?? []).some((i) => i.prevdoc_docname === request.quotation);
}
