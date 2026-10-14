import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PostedEarlierError,
  confirmRequest,
  reusableDraft,
  unresolvedOr,
} from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import {
  InventoryOverview,
  Movement,
  StockItem,
  TransferRequest,
  TransferResult,
  WarehouseInfo,
} from './inventory.models';

interface EntryDoc {
  name: string;
  docstatus: number;
  posting_date: string;
  posting_time: string;
  [key: string]: unknown;
}

const HISTORY_LIMIT = 30;
// Keeps `in` filters short enough for the GET URL (see stockFor on Home).
const ITEM_BATCH = 100;

function batches<T>(values: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += ITEM_BATCH) {
    chunks.push(values.slice(i, i + ITEM_BATCH));
  }
  return chunks;
}

/** Stock balances, movement history, and warehouse transfers (Stock Entry, Material Transfer). */
@Injectable({ providedIn: 'root' })
export class InventoryApiService {
  private readonly erpnext = inject(ErpnextClient);

  async warehouses(company: string): Promise<WarehouseInfo[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string; warehouse_name: string }>('Warehouse', {
        fields: ['name', 'warehouse_name'],
        filters: [
          ['company', '=', company],
          ['is_group', '=', 0],
          ['disabled', '=', 0],
          ['warehouse_type', '!=', 'Transit'],
        ],
        orderBy: 'warehouse_name asc',
        limit: 0,
      }),
    );
    return rows.map((r) => ({ id: r.name, name: r.warehouse_name }));
  }

  async overview(company: string, today: string): Promise<InventoryOverview> {
    const warehouses = await this.warehouses(company);
    const [items, movesToday] = await Promise.all([
      this.stockItems(warehouses.map((w) => w.id)),
      firstValueFrom(
        this.erpnext.count('Stock Entry', [
          ['company', '=', company],
          ['docstatus', '=', 1],
          ['posting_date', '=', today],
        ]),
      ).catch(() => null),
    ]);
    return { warehouses, items, movesToday };
  }

  /** Stock items whose code or name matches, with their balances in the given warehouses. */
  async searchItems(term: string, warehouses: string[]): Promise<StockItem[]> {
    const like = `%${term.trim()}%`;
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Item', {
        fields: ['name'],
        filters: [
          ['disabled', '=', 0],
          ['is_stock_item', '=', 1],
          ['has_variants', '=', 0],
        ],
        orFilters: term.trim()
          ? [
              ['item_code', 'like', like],
              ['item_name', 'like', like],
              ['Item Barcode', 'barcode', 'like', like],
            ]
          : undefined,
        orderBy: 'item_name asc',
        limit: 20,
      }),
    );
    return rows.length
      ? this.stockItems(
          warehouses,
          rows.map((r) => r.name),
          true,
        )
      : [];
  }

  /** One stock item by its exact code, with its balances; null when it isn't a stock item. */
  async item(code: string, warehouses: string[]): Promise<StockItem | null> {
    const [item] = await this.stockItems(warehouses, [code], true);
    return item ?? null;
  }

  async history(item: string, warehouses: string[]): Promise<Movement[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        voucher_type: string;
        voucher_no: string;
        warehouse: string;
        actual_qty: number;
        qty_after_transaction: number;
        posting_date: string;
        posting_time: string;
      }>('Stock Ledger Entry', {
        fields: [
          'voucher_type',
          'voucher_no',
          'warehouse',
          'actual_qty',
          'qty_after_transaction',
          'posting_date',
          'posting_time',
        ],
        filters: [
          ['item_code', '=', item],
          ['warehouse', 'in', warehouses],
          ['is_cancelled', '=', 0],
        ],
        orderBy: 'posting_datetime desc, creation desc',
        limit: HISTORY_LIMIT,
      }),
    );
    const movements: Movement[] = [];
    for (const row of rows) {
      const existing = movements.find((m) => m.voucher === row.voucher_no);
      const line = {
        warehouse: row.warehouse,
        qty: row.actual_qty,
        after: row.qty_after_transaction,
      };
      if (existing) {
        existing.lines.push(line);
      } else {
        movements.push({
          voucherType: row.voucher_type,
          voucher: row.voucher_no,
          postingDate: row.posting_date,
          postingTime: row.posting_time,
          lines: [line],
        });
      }
    }
    // At the limit, the oldest voucher may be cut off (a transfer is two rows); leave it out.
    if (rows.length === HISTORY_LIMIT && movements.length > 1) {
      movements.pop();
    }
    return movements;
  }

  /**
   * Inserts and submits the transfer. A timeout or lost connection throws UnresolvedError: the move may
   * have posted, so callers must look it up with find(), not resubmit.
   */
  async transfer(
    request: TransferRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<TransferResult> {
    const fresh = this.entryDoc(request);
    const current = draft
      ? await reusableDraft(this.erpnext.doc<EntryDoc>('Stock Entry', draft))
      : null;
    if (current?.docstatus === 1) {
      // A slow earlier attempt posted it after all; it's this request's result only if nothing changed since.
      if (!sameTransfer(current, request)) {
        throw new PostedEarlierError(current.name);
      }
      return this.result(current, request);
    }
    let entry: EntryDoc;
    try {
      let doc: EntryDoc;
      if (current) {
        doc = { ...current, ...fresh, name: current.name, modified: current['modified'] };
      } else {
        doc = await confirmRequest(
          this.erpnext.post<EntryDoc>('frappe.client.insert', { doc: fresh }),
        );
        onInserted(doc.name);
      }
      entry = await confirmRequest(this.erpnext.post<EntryDoc>('frappe.client.submit', { doc }));
    } catch (error) {
      throw unresolvedOr(error);
    }
    return this.result(entry, request);
  }

  /** Looks a transfer up by its Madar reference after an unresolved confirmation. */
  async find(request: TransferRequest): Promise<TransferResult | 'not-found' | { draft: string }> {
    const [entry] = await firstValueFrom(
      this.erpnext.list<EntryDoc>('Stock Entry', {
        fields: ['name', 'docstatus', 'posting_date', 'posting_time'],
        filters: [
          ['remarks', 'like', `%${request.reference}%`],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'docstatus desc',
        limit: 1,
      }),
    );
    if (!entry) {
      return 'not-found';
    }
    if (entry.docstatus === 0) {
      return { draft: entry.name };
    }
    return this.result(entry, request);
  }

  /** Deletes a draft a failed confirmation left behind. */
  async discard(draft: string): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.client.delete', { doctype: 'Stock Entry', name: draft }),
    );
  }

  private entryDoc(request: TransferRequest): Record<string, unknown> {
    return {
      doctype: 'Stock Entry',
      stock_entry_type: 'Material Transfer',
      purpose: 'Material Transfer',
      company: request.company,
      // No posting_date: ERPNext uses the site's own "today", not the device's.
      from_warehouse: request.from,
      to_warehouse: request.to,
      remarks: `Madar transfer ${request.reference}`,
      items: [
        {
          item_code: request.item,
          qty: request.qty,
          uom: request.uom,
          stock_uom: request.uom,
          conversion_factor: 1,
          s_warehouse: request.from,
          t_warehouse: request.to,
        },
      ],
    };
  }

  private async result(entry: EntryDoc, request: TransferRequest): Promise<TransferResult> {
    const base = {
      entry: entry.name,
      postingDate: entry.posting_date,
      postingTime: entry.posting_time,
    };
    try {
      // The same locations the move screen totals, so "Company total" reads the same before and after.
      const warehouses = await this.warehouses(request.company);
      const item = await this.item(
        request.item,
        warehouses.map((w) => w.id),
      );
      const stock = item?.stock ?? {};
      return {
        ...base,
        fromQty: stock[request.from] ?? 0,
        toQty: stock[request.to] ?? 0,
        totalQty: Object.values(stock).reduce((sum, qty) => sum + qty, 0),
      };
    } catch {
      // The move is posted; only reading the new balances failed, so don't state wrong figures.
      return { ...base, fromQty: null, toQty: null, totalQty: null };
    }
  }

  /**
   * Balances per item in the warehouses. With `codes`, those items (even without stock, when
   * `includeEmpty`); otherwise every item holding stock there.
   */
  private async stockItems(
    warehouses: string[],
    codes?: string[],
    includeEmpty = false,
  ): Promise<StockItem[]> {
    if (!warehouses.length) {
      return [];
    }
    const bins = await this.erpnext.listAll<{
      item_code: string;
      warehouse: string;
      actual_qty: number;
      stock_uom: string;
    }>('Bin', {
      fields: ['item_code', 'warehouse', 'actual_qty', 'stock_uom'],
      filters: [
        ['warehouse', 'in', warehouses],
        ...(codes ? [['item_code', 'in', codes] as [string, string, unknown]] : []),
      ],
    });
    const itemCodes = codes ?? [
      ...new Set(bins.filter((b) => b.actual_qty !== 0).map((b) => b.item_code)),
    ];
    if (!itemCodes.length) {
      return [];
    }
    const [items, reorder] = await Promise.all([
      Promise.all(
        batches(itemCodes).map((chunk) =>
          firstValueFrom(
            this.erpnext.list<{ name: string; item_name: string; stock_uom: string }>('Item', {
              fields: ['name', 'item_name', 'stock_uom'],
              filters: [
                ['name', 'in', chunk],
                ['is_stock_item', '=', 1],
              ],
              limit: 0,
            }),
          ),
        ),
      ).then((chunks) => chunks.flat()),
      Promise.all(
        batches(itemCodes).map((chunk) =>
          firstValueFrom(
            this.erpnext.list<{
              parent: string;
              warehouse: string;
              warehouse_reorder_level: number;
            }>('Item Reorder', {
              fields: ['parent', 'warehouse', 'warehouse_reorder_level'],
              filters: [['parent', 'in', chunk]],
              parent: 'Item',
              limit: 0,
            }),
          ),
        ),
      )
        .then((chunks) => chunks.flat())
        .catch(() => []),
    ]);
    return items
      .map((item) => {
        const own = bins.filter((b) => b.item_code === item.name);
        const stock = Object.fromEntries(own.map((b) => [b.warehouse, b.actual_qty]));
        return {
          code: item.name,
          name: item.item_name,
          uom: item.stock_uom,
          stock,
          low: reorder.some(
            (r) =>
              r.parent === item.name &&
              warehouses.includes(r.warehouse) &&
              (stock[r.warehouse] ?? 0) <= r.warehouse_reorder_level,
          ),
        };
      })
      .filter((item) => includeEmpty || Object.values(item.stock).some((qty) => qty !== 0))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

function sameTransfer(entry: EntryDoc, request: TransferRequest): boolean {
  const rows = (entry['items'] as Record<string, unknown>[] | undefined) ?? [];
  return (
    rows.length === 1 &&
    rows[0]['item_code'] === request.item &&
    Number(rows[0]['qty']) === request.qty &&
    rows[0]['s_warehouse'] === request.from &&
    rows[0]['t_warehouse'] === request.to
  );
}
