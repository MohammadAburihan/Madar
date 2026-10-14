import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PostedEarlierError,
  confirmRequest,
  reusableDraft,
  unresolvedOr,
} from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { shareInFlight } from '../../../core/util/share-in-flight';
import {
  OrderDetail,
  OrderRequest,
  OrderSummary,
  PurchaseItem,
  PurchasingOverview,
  orderProgress,
} from './purchase.models';

interface OrderDoc {
  name: string;
  docstatus: number;
  status: string;
  supplier: string;
  supplier_name: string;
  transaction_date: string;
  grand_total: number;
  per_received: number;
  per_billed: number;
  items?: {
    item_code: string;
    item_name: string;
    uom: string;
    qty: number;
    received_qty: number;
    rate: number;
    amount: number;
  }[];
  [key: string]: unknown;
}

const ORDER_FIELDS = [
  'name',
  'docstatus',
  'status',
  'supplier',
  'supplier_name',
  'transaction_date',
  'grand_total',
  'per_received',
  'per_billed',
];
const ORDER_LIMIT = 50;
const SEARCH_LIMIT = 10;

/** Purchase orders: the purchasing workspace, item prices, and creating and confirming an order. */
@Injectable({ providedIn: 'root' })
export class PurchaseApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Buying Settings' price list; purchase roles can read it but not Item Price itself. */
  readonly priceList = shareInFlight(async () => {
    const settings = await firstValueFrom(
      this.erpnext.post<{ buying_price_list: string | null }>('frappe.client.get_value', {
        doctype: 'Buying Settings',
        fieldname: 'buying_price_list',
      }),
    );
    return settings?.buying_price_list ?? null;
  });

  async overview(company: string): Promise<PurchasingOverview> {
    const [rows, supplierBalance] = await Promise.all([
      firstValueFrom(
        this.erpnext.list<OrderDoc>('Purchase Order', {
          fields: ORDER_FIELDS,
          filters: [
            ['company', '=', company],
            ['docstatus', '<', 2],
          ],
          orderBy: 'creation desc',
          limit: ORDER_LIMIT,
        }),
      ),
      this.supplierBalance(company).catch(() => null),
    ]);
    const quantities = await this.quantities(rows.map((r) => r.name));
    return {
      orders: rows.map((r) => summary(r, quantities.get(r.name))),
      supplierBalance,
    };
  }

  async order(name: string): Promise<OrderDetail> {
    const doc = await firstValueFrom(this.erpnext.doc<OrderDoc>('Purchase Order', name));
    const lines = (doc.items ?? []).map((i) => ({
      code: i.item_code,
      name: i.item_name,
      uom: i.uom,
      qty: i.qty,
      receivedQty: i.received_qty,
      rate: i.rate,
      amount: i.amount,
    }));
    return {
      ...summary(doc, {
        ordered: lines.reduce((sum, l) => sum + l.qty, 0),
        received: lines.reduce((sum, l) => sum + l.receivedQty, 0),
      }),
      lines,
    };
  }

  /** Purchasable items of one kind whose code, name or barcode matches, each with its buying price. */
  async searchItems(
    term: string,
    kind: 'product' | 'service',
    ctx: { company: string; supplier: string; currency: string; date: string },
  ): Promise<PurchaseItem[]> {
    const like = `%${term.trim()}%`;
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string; item_name: string; stock_uom: string }>('Item', {
        fields: ['name', 'item_name', 'stock_uom'],
        filters: [
          ['disabled', '=', 0],
          ['is_purchase_item', '=', 1],
          ['has_variants', '=', 0],
          ['is_stock_item', '=', kind === 'product' ? 1 : 0],
        ],
        orFilters: term.trim()
          ? [
              ['item_code', 'like', like],
              ['item_name', 'like', like],
              ['Item Barcode', 'barcode', 'like', like],
            ]
          : undefined,
        orderBy: 'item_name asc',
        limit: SEARCH_LIMIT,
      }),
    );
    const priceList = await this.priceList().catch(() => null);
    return Promise.all(
      rows.map(async (r) => ({
        code: r.name,
        name: r.item_name,
        uom: r.stock_uom,
        kind,
        rate: await this.rate(r.name, priceList, ctx).catch(() => 0),
      })),
    );
  }

  /**
   * Inserts and submits the order. A timeout or lost connection throws UnresolvedError: the order may exist,
   * so callers must look it up with find(), not resubmit. Resolves to the order's name.
   */
  async confirm(
    request: OrderRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<string> {
    const current = draft
      ? await reusableDraft(this.erpnext.doc<OrderDoc>('Purchase Order', draft))
      : null;
    if (current?.docstatus === 1) {
      // A slow earlier attempt confirmed it after all; that is this request's result only if nothing changed.
      if (!sameOrder(current, request)) {
        throw new PostedEarlierError(current.name);
      }
      return current.name;
    }
    try {
      const doc = current
        ? {
            ...current,
            ...this.orderDoc(request),
            name: current.name,
            modified: current['modified'],
          }
        : await confirmRequest(
            this.erpnext.post<OrderDoc>('frappe.client.insert', { doc: this.orderDoc(request) }),
          );
      if (!current) {
        onInserted(doc.name);
      }
      const submitted = await confirmRequest(
        this.erpnext.post<OrderDoc>('frappe.client.submit', { doc }),
      );
      return submitted.name;
    } catch (error) {
      throw unresolvedOr(error);
    }
  }

  /** Saves the order as an ERPNext draft (new, or over the remembered one) and returns its name. */
  async saveDraft(request: OrderRequest, draft: string | null): Promise<string> {
    const current = draft
      ? await reusableDraft(this.erpnext.doc<OrderDoc>('Purchase Order', draft))
      : null;
    if (current?.docstatus === 1) {
      // Confirmed by a slow earlier attempt: saving a draft now would start a second order.
      throw new PostedEarlierError(current.name);
    }
    if (current) {
      const saved = await firstValueFrom(
        this.erpnext.post<OrderDoc>('frappe.client.save', {
          doc: { ...current, ...this.orderDoc(request), name: current.name },
        }),
      );
      return saved.name;
    }
    const inserted = await firstValueFrom(
      this.erpnext.post<OrderDoc>('frappe.client.insert', { doc: this.orderDoc(request) }),
    );
    return inserted.name;
  }

  /** Looks an order up by its Madar reference after an unresolved confirmation. */
  async find(reference: string): Promise<{ order: string } | 'not-found' | { draft: string }> {
    const [order] = await firstValueFrom(
      this.erpnext.list<{ name: string; docstatus: number }>('Purchase Order', {
        fields: ['name', 'docstatus'],
        filters: [
          ['order_confirmation_no', '=', reference],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'docstatus desc',
        limit: 1,
      }),
    );
    if (!order) {
      return 'not-found';
    }
    return order.docstatus === 0 ? { draft: order.name } : { order: order.name };
  }

  /** Deletes a draft a failed confirmation left behind. */
  async discard(draft: string): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.client.delete', { doctype: 'Purchase Order', name: draft }),
    );
  }

  private orderDoc(request: OrderRequest): Record<string, unknown> {
    return {
      doctype: 'Purchase Order',
      company: request.company,
      supplier: request.supplier,
      // No transaction_date: ERPNext uses the site's own "today", not the device's.
      schedule_date: request.scheduleDate,
      // Purchase Order has no remarks; this field is otherwise unused (decided 14 Oct 2026).
      order_confirmation_no: request.reference,
      items: request.lines.map((l) => ({
        item_code: l.item,
        qty: l.qty,
        rate: l.rate,
        uom: l.uom,
        schedule_date: request.scheduleDate,
      })),
    };
  }

  private async rate(
    item: string,
    priceList: string | null,
    ctx: { company: string; supplier: string; currency: string; date: string },
  ): Promise<number> {
    const details = await firstValueFrom(
      this.erpnext.post<{ price_list_rate: number; last_purchase_rate: number }>(
        'erpnext.stock.get_item_details.get_item_details',
        {
          ctx: {
            item_code: item,
            company: ctx.company,
            doctype: 'Purchase Order',
            supplier: ctx.supplier,
            currency: ctx.currency,
            conversion_rate: 1,
            qty: 1,
            transaction_date: ctx.date,
            // Without the price list ERPNext returns no list price, only the last purchase rate.
            ...(priceList
              ? {
                  buying_price_list: priceList,
                  price_list_currency: ctx.currency,
                  plc_conversion_rate: 1,
                }
              : {}),
          },
        },
      ),
    );
    return details.price_list_rate || details.last_purchase_rate || 0;
  }

  private async quantities(
    orders: string[],
  ): Promise<Map<string, { ordered: number; received: number }>> {
    if (!orders.length) {
      return new Map();
    }
    const rows = await firstValueFrom(
      this.erpnext.list<{ parent: string; qty: number; received_qty: number }>(
        'Purchase Order Item',
        {
          fields: ['parent', 'qty', 'received_qty'],
          filters: [['parent', 'in', orders]],
          parent: 'Purchase Order',
          limit: 0,
        },
      ),
    );
    const totals = new Map<string, { ordered: number; received: number }>();
    for (const row of rows) {
      const total = totals.get(row.parent) ?? { ordered: 0, received: 0 };
      total.ordered += row.qty;
      total.received += row.received_qty;
      totals.set(row.parent, total);
    }
    return totals;
  }

  private async supplierBalance(company: string): Promise<number> {
    const [row] = await firstValueFrom(
      this.erpnext.list<Record<string, number>>('Purchase Invoice', {
        fields: [{ SUM: 'outstanding_amount' }],
        filters: [
          ['company', '=', company],
          ['docstatus', '=', 1],
        ],
        limit: 1,
      }),
    );
    return Number(row?.['SUM(`outstanding_amount`)'] ?? 0);
  }
}

function summary(
  doc: OrderDoc,
  quantities: { ordered: number; received: number } | undefined,
): OrderSummary {
  return {
    name: doc.name,
    supplier: doc.supplier,
    supplierName: doc.supplier_name,
    date: doc.transaction_date,
    total: doc.grand_total,
    progress: orderProgress(doc),
    orderedQty: quantities?.ordered ?? 0,
    receivedQty: quantities?.received ?? 0,
  };
}

function sameOrder(doc: OrderDoc, request: OrderRequest): boolean {
  const rows = doc.items ?? [];
  return (
    doc.supplier === request.supplier &&
    rows.length === request.lines.length &&
    request.lines.every(
      (l, i) =>
        rows[i].item_code === l.item &&
        Number(rows[i].qty) === l.qty &&
        Number(rows[i].rate) === l.rate,
    )
  );
}
