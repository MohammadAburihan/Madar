import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PostedEarlierError,
  confirmRequest,
  reusableDraft,
  unresolvedOr,
} from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { OrderFromQuotationRequest, SalesOrderDetail } from './sales-order.models';
import { stockedItems } from './stocked-items';

interface OrderItem {
  name: string;
  item_code: string;
  item_name: string;
  qty: number;
  delivered_qty: number;
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

const MAKE_SALES_ORDER = 'erpnext.selling.doctype.quotation.quotation.make_sales_order';

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
        // Company currency, like the total: an order made in Desk may be in the customer's currency.
        rate: Number(i.base_rate),
        amount: Number(i.base_amount),
        isStock: stock.has(i.item_code),
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
}

/** Nothing the user chooses goes into the order; a retry after midnight only moves "today". */
function sameOrder(doc: OrderDoc, request: OrderFromQuotationRequest): boolean {
  return (doc.items ?? []).some((i) => i.prevdoc_docname === request.quotation);
}
