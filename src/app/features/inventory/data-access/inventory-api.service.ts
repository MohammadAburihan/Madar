import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { confirmRequest, unresolvedOr } from '../../../core/erpnext/confirmation';
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

  async history(item: string, warehouses: string[]): Promise<Movement[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        voucher_type: string;
        voucher_no: string;
        warehouse: string;
        actual_qty: number;
        posting_date: string;
        posting_time: string;
      }>('Stock Ledger Entry', {
        fields: [
          'voucher_type',
          'voucher_no',
          'warehouse',
          'actual_qty',
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
      const line = { warehouse: row.warehouse, qty: row.actual_qty };
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
    // Reading the draft writes nothing, so its errors are definite failures.
    const current = draft
      ? await firstValueFrom(this.erpnext.doc<EntryDoc>('Stock Entry', draft))
      : null;
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
    const [item] = await this.stockItems([request.from, request.to], [request.item], true).catch(
      () => [],
    );
    const all = await this.allStock(request.item).catch(() => null);
    return {
      entry: entry.name,
      postingDate: entry.posting_date,
      postingTime: entry.posting_time,
      fromQty: item?.stock[request.from] ?? 0,
      toQty: item?.stock[request.to] ?? 0,
      totalQty: all ?? (item?.stock[request.from] ?? 0) + (item?.stock[request.to] ?? 0),
    };
  }

  private async allStock(item: string): Promise<number> {
    const rows = await firstValueFrom(
      this.erpnext.list<{ actual_qty: number }>('Bin', {
        fields: ['actual_qty'],
        filters: [['item_code', '=', item]],
        limit: 0,
      }),
    );
    return rows.reduce((sum, r) => sum + r.actual_qty, 0);
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
      firstValueFrom(
        this.erpnext.list<{ name: string; item_name: string; stock_uom: string }>('Item', {
          fields: ['name', 'item_name', 'stock_uom'],
          filters: [['name', 'in', itemCodes]],
          limit: 0,
        }),
      ),
      firstValueFrom(
        this.erpnext.list<{ parent: string; warehouse: string; warehouse_reorder_level: number }>(
          'Item Reorder',
          {
            fields: ['parent', 'warehouse', 'warehouse_reorder_level'],
            filters: [['parent', 'in', itemCodes]],
            parent: 'Item',
            limit: 0,
          },
        ),
      ).catch(() => []),
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
