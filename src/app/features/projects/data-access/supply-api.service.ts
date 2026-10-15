import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PostedEarlierError,
  confirmRequest,
  reusableDraft,
  unresolvedOr,
} from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { SupplyPlan, SupplyRequest } from './project.models';
import { ProjectsApiService, SITE_WAREHOUSE_NAME } from './projects-api.service';

interface EntryDoc {
  name: string;
  docstatus: number;
  items: {
    item_code: string;
    qty: number;
    s_warehouse: string | null;
    t_warehouse: string | null;
  }[];
  [key: string]: unknown;
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Supplying a project: what an item still needs, where stock is, and the transfer that moves it to the site. */
@Injectable({ providedIn: 'root' })
export class SupplyApiService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly projects = inject(ProjectsApiService);

  /** The supply plan for one item of a project: open requests, stock per warehouse, site stock and open orders. */
  async plan(project: string, item: string, company: string): Promise<SupplyPlan> {
    const site = await this.projects.siteWarehouse(company);
    const [requests, details, bins, warehouses, siteLedger, orders] = await Promise.all([
      firstValueFrom(
        this.erpnext.list<{
          parent: string;
          row: string;
          project: string | null;
          stock_qty: number;
          ordered_qty: number;
        }>('Material Request', {
          fields: [
            'name as parent',
            'items.name as row',
            'items.project as project',
            'items.stock_qty as stock_qty',
            'items.ordered_qty as ordered_qty',
          ],
          filters: [
            ['Material Request Item', 'project', '=', project],
            ['Material Request Item', 'item_code', '=', item],
            ['docstatus', '=', 1],
            ['status', '!=', 'Stopped'],
            ['material_request_type', '=', 'Material Transfer'],
          ],
          orderBy: 'transaction_date asc, creation asc',
          limit: 0,
        }),
      ),
      firstValueFrom(
        this.erpnext.list<{ name: string; item_name: string; stock_uom: string }>('Item', {
          fields: ['name', 'item_name', 'stock_uom'],
          filters: [['name', '=', item]],
          limit: 1,
        }),
      ),
      firstValueFrom(
        this.erpnext.list<{ warehouse: string; actual_qty: number }>('Bin', {
          fields: ['warehouse', 'actual_qty'],
          filters: [['item_code', '=', item]],
          limit: 0,
        }),
      ),
      firstValueFrom(
        this.erpnext.list<{ name: string; warehouse_name: string }>('Warehouse', {
          fields: ['name', 'warehouse_name'],
          filters: [
            ['company', '=', company],
            ['is_group', '=', 0],
            ['disabled', '=', 0],
            ['warehouse_type', '!=', 'Transit'],
            ['warehouse_name', '!=', SITE_WAREHOUSE_NAME],
          ],
          limit: 0,
        }),
      ),
      // The project's share of the shared site warehouse: the ledger rows booked to it.
      firstValueFrom(
        this.erpnext.list<Record<string, number>>('Stock Ledger Entry', {
          fields: [{ SUM: 'actual_qty' }],
          filters: [
            ['warehouse', '=', site],
            ['item_code', '=', item],
            ['project', '=', project],
            ['is_cancelled', '=', 0],
          ],
          limit: 1,
        }),
      ),
      firstValueFrom(
        this.erpnext.list<{
          parent: string;
          stock_qty: number;
          received_qty: number;
          conversion_factor: number;
        }>('Purchase Order Item', {
          fields: ['parent', 'stock_qty', 'received_qty', 'conversion_factor'],
          filters: [
            ['project', '=', project],
            ['item_code', '=', item],
            ['docstatus', '=', 1],
          ],
          parent: 'Purchase Order',
          limit: 0,
        }),
      ).catch(() => []),
    ]);
    const rows = requests
      .filter((r) => r.project === project)
      .map((r) => ({
        request: r.parent,
        row: r.row,
        open: round(Math.max(r.stock_qty - (r.ordered_qty || 0), 0)),
      }))
      .filter((r) => r.open > 0);
    const names = new Map(warehouses.map((w) => [w.name, w.warehouse_name]));
    const pending = new Map<string, number>();
    for (const o of orders) {
      // Received quantities are in the order row's unit; stock_qty is in the stock unit.
      const open = o.stock_qty - (o.received_qty || 0) * (o.conversion_factor || 1);
      if (open > 0) {
        pending.set(o.parent, round((pending.get(o.parent) ?? 0) + open));
      }
    }
    return {
      item,
      itemName: details[0]?.item_name ?? item,
      uom: details[0]?.stock_uom ?? '',
      site,
      need: round(rows.reduce((sum, r) => sum + r.open, 0)),
      requestRows: rows,
      atSite: round(Number(siteLedger[0]?.['SUM(`actual_qty`)'] ?? 0)),
      sources: bins
        .filter((b) => names.has(b.warehouse) && b.actual_qty > 0)
        .map((b) => ({
          warehouse: b.warehouse,
          name: names.get(b.warehouse)!,
          qty: round(b.actual_qty),
        }))
        .sort((a, b) => b.qty - a.qty),
      pendingOrders: [...pending.entries()].map(([name, qty]) => ({ name, qty })),
    };
  }

  /**
   * Posts the delivery: a Material Transfer from the source warehouse to the project sites, booked to the project
   * and linked to its open requests so ERPNext counts them as delivered. A timeout throws UnresolvedError; callers
   * look it up with find() instead of posting again.
   */
  async deliver(
    request: SupplyRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<string> {
    const fresh = this.entryDoc(request);
    const current = draft
      ? await reusableDraft(this.erpnext.doc<EntryDoc>('Stock Entry', draft))
      : null;
    if (current?.docstatus === 1) {
      // A slow earlier attempt posted it; that is this request's result only if nothing changed.
      if (!sameDelivery(current, request)) {
        throw new PostedEarlierError(current.name);
      }
      return current.name;
    }
    try {
      let doc: Record<string, unknown>;
      if (current) {
        // Keep the draft's identity; the fresh rows replace its items.
        doc = {
          ...current,
          ...fresh,
          name: current.name,
          modified: current['modified'],
          docstatus: 0,
        };
      } else {
        doc = await confirmRequest(
          this.erpnext.post<EntryDoc>('frappe.client.insert', { doc: fresh }),
        );
        onInserted((doc as EntryDoc).name);
      }
      const entry = await confirmRequest(
        this.erpnext.post<EntryDoc>('frappe.client.submit', { doc }),
      );
      return entry.name;
    } catch (error) {
      throw unresolvedOr(error);
    }
  }

  /** Looks a delivery up by its Madar reference after an unresolved confirmation. */
  async find(reference: string): Promise<{ entry: string } | 'not-found' | { draft: string }> {
    const [entry] = await firstValueFrom(
      this.erpnext.list<{ name: string; docstatus: number }>('Stock Entry', {
        fields: ['name', 'docstatus'],
        filters: [
          ['remarks', 'like', `%${reference}%`],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'docstatus desc',
        limit: 1,
      }),
    );
    if (!entry) {
      return 'not-found';
    }
    return entry.docstatus === 0 ? { draft: entry.name } : { entry: entry.name };
  }

  /** Deletes a draft a failed confirmation left behind. */
  async discard(draft: string): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.client.delete', { doctype: 'Stock Entry', name: draft }),
    );
  }

  private entryDoc(request: SupplyRequest): Record<string, unknown> {
    // One row per open request row, oldest first, so ERPNext marks each request delivered as far as it goes.
    let left = request.qty;
    const rows: Record<string, unknown>[] = [];
    for (const row of request.requestRows) {
      if (left <= 0) {
        break;
      }
      const qty = round(Math.min(left, row.open));
      rows.push({ qty, material_request: row.request, material_request_item: row.row });
      left = round(left - qty);
    }
    if (left > 0) {
      // More than the requests ask for: the rest goes to the site unlinked.
      rows.push({ qty: left });
    }
    return {
      doctype: 'Stock Entry',
      stock_entry_type: 'Material Transfer',
      purpose: 'Material Transfer',
      company: request.company,
      project: request.project,
      from_warehouse: request.from,
      to_warehouse: request.site,
      // No posting_date: ERPNext uses the site's own "today", not the device's.
      remarks: `Madar supply ${request.reference}`,
      items: rows.map((row) => ({
        item_code: request.item,
        uom: request.uom,
        stock_uom: request.uom,
        conversion_factor: 1,
        s_warehouse: request.from,
        t_warehouse: request.site,
        project: request.project,
        ...row,
      })),
    };
  }
}

function sameDelivery(entry: EntryDoc, request: SupplyRequest): boolean {
  const total = entry.items
    .filter((i) => i.item_code === request.item)
    .reduce((sum, i) => sum + Number(i.qty), 0);
  return (
    entry.items.every(
      (i) =>
        i.item_code === request.item &&
        i.s_warehouse === request.from &&
        i.t_warehouse === request.site,
    ) && Math.abs(total - request.qty) <= 0.0005 + 1e-9
  );
}
