import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Persona } from '../../../core/auth/persona';
import { ErpnextClient, Field, Filter } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { toIsoDate } from '../../../core/format/format';
import { Delivery, Draft, Drafts, HomeData, InvoiceDue, LowStock, SupplyNeed } from './home.models';

export interface HomeScope {
  persona: Persona;
  company: string;
  companyAbbr: string;
  companyCurrency: string;
  userId: string;
  /** Wall-clock time at the ERPNext site. */
  today: Date;
}

export interface HomeLoadResult {
  data: HomeData;
  /** Every query was refused, which is what an expired session looks like. */
  allForbidden: boolean;
}

interface LoadContext extends HomeScope {
  forbidden: boolean;
  succeeded: boolean;
  warehouses?: Promise<string[]>;
}

const DRAFT_DOCTYPES: Draft['doctype'][] = ['Sales Invoice', 'Sales Order', 'Quotation'];
const ATTENTION_LIMIT = 5;
// Child-table queries return one row per item, so fetch enough rows to cover a few documents.
const CHILD_ROW_LIMIT = 50;
// Keep "in [...]" filters, and so the GET URLs, short.
const ITEM_BATCH = 100;
const WAREHOUSE_BATCH = 50;

@Injectable({ providedIn: 'root' })
export class HomeApiService {
  private readonly erpnext = inject(ErpnextClient);

  async load(scope: HomeScope): Promise<HomeLoadResult> {
    const ctx: LoadContext = { ...scope, forbidden: false, succeeded: false };
    const { persona } = ctx;
    const sells = persona !== 'warehouse';
    const stocks = persona !== 'salesperson';
    const [todaySales, receivables, invoicesDue, drafts, deliveries, supply, lowStock] =
      await Promise.all([
        sells ? this.optional(ctx, () => this.todaySales(ctx)) : undefined,
        persona === 'owner' ? this.optional(ctx, () => this.receivables(ctx)) : undefined,
        sells ? this.optional(ctx, () => this.invoicesDue(ctx)) : undefined,
        sells ? this.optional(ctx, () => this.drafts(ctx)) : undefined,
        stocks ? this.optional(ctx, () => this.deliveries(ctx)) : undefined,
        stocks ? this.optional(ctx, () => this.supply(ctx)) : undefined,
        stocks ? this.optional(ctx, () => this.lowStock(ctx)) : undefined,
      ]);
    return {
      data: { todaySales, receivables, invoicesDue, drafts, deliveries, supply, lowStock },
      allForbidden: ctx.forbidden && !ctx.succeeded,
    };
  }

  private todaySales(ctx: LoadContext): Promise<number> {
    const filters: Filter[] = [
      ['company', '=', ctx.company],
      ['docstatus', '=', 1],
      ['is_return', '=', 0],
      ['posting_date', '=', toIsoDate(ctx.today)],
    ];
    if (ctx.persona === 'salesperson') {
      filters.push(['owner', '=', ctx.userId]);
    }
    // base_grand_total is in company currency, so mixed-currency invoices add up correctly.
    return this.sum('Sales Invoice', 'base_grand_total', filters);
  }

  /**
   * Outstanding amounts are in each party's account currency. Grouping by currency and rate keeps the
   * conversion to company currency exact while returning only a handful of rows.
   */
  private async receivables(ctx: LoadContext): Promise<number> {
    const groups = await this.list<Record<string, number | string>>(
      'Sales Invoice',
      ['party_account_currency', 'conversion_rate', { SUM: 'outstanding_amount' }],
      [
        ['company', '=', ctx.company],
        ['docstatus', '=', 1],
        ['outstanding_amount', '>', 0],
      ],
      { groupBy: 'party_account_currency, conversion_rate', limit: 0 },
    );
    return groups.reduce((total, group) => {
      const outstanding = Number(group['SUM(`outstanding_amount`)'] ?? 0);
      const rate =
        group['party_account_currency'] === ctx.companyCurrency
          ? 1
          : Number(group['conversion_rate']) || 1;
      return total + outstanding * rate;
    }, 0);
  }

  private async invoicesDue(ctx: LoadContext): Promise<InvoiceDue[]> {
    const filters: Filter[] = [
      ['company', '=', ctx.company],
      ['docstatus', '=', 1],
      ['outstanding_amount', '>', 0],
      ['due_date', '<=', toIsoDate(addDays(ctx.today, 1))],
    ];
    if (ctx.persona === 'salesperson') {
      filters.push(['owner', '=', ctx.userId]);
    }
    const rows = await this.list<{
      name: string;
      customer_name: string;
      due_date: string;
      outstanding_amount: number;
    }>('Sales Invoice', ['name', 'customer_name', 'due_date', 'outstanding_amount'], filters, {
      orderBy: 'due_date asc',
      limit: ATTENTION_LIMIT,
    });
    return rows.map((r) => ({
      name: r.name,
      customer: r.customer_name,
      dueDate: r.due_date,
      outstanding: r.outstanding_amount,
    }));
  }

  private async drafts(ctx: LoadContext): Promise<Drafts> {
    const perDoctype = await Promise.all(
      DRAFT_DOCTYPES.map((doctype) =>
        this.optional(ctx, async () => {
          const filters: Filter[] = [
            ['company', '=', ctx.company],
            ['docstatus', '=', 0],
          ];
          if (ctx.persona === 'salesperson') {
            filters.push(['owner', '=', ctx.userId]);
          }
          const [count, [latest]] = await Promise.all([
            firstValueFrom(this.erpnext.count(doctype, filters)),
            this.list<{
              name: string;
              customer_name: string;
              modified: string;
              grand_total: number;
              currency: string;
            }>(doctype, ['name', 'customer_name', 'modified', 'grand_total', 'currency'], filters, {
              orderBy: 'modified desc',
              limit: 1,
            }),
          ]);
          const recent: Draft[] = latest
            ? [
                {
                  doctype,
                  name: latest.name,
                  party: latest.customer_name,
                  modified: latest.modified,
                  total: latest.grand_total,
                  currency: latest.currency,
                },
              ]
            : [];
          return { count, recent };
        }),
      ),
    );
    const readable = perDoctype.filter((d): d is Drafts => d !== undefined);
    if (!readable.length) {
      throw new ErpnextError('forbidden', 'No draft doctypes are readable', 403);
    }
    return {
      count: readable.reduce((total, d) => total + d.count, 0),
      recent: readable
        .flatMap((d) => d.recent)
        .sort((a, b) => b.modified.localeCompare(a.modified)),
    };
  }

  private async deliveries(ctx: LoadContext): Promise<Delivery[]> {
    const rows = await this.list<{
      name: string;
      supplier_name: string;
      schedule_date: string;
      item_name: string;
      qty: number;
      received_qty: number;
    }>(
      'Purchase Order',
      [
        'name',
        'supplier_name',
        'schedule_date',
        'items.item_name as item_name',
        'items.qty as qty',
        'items.received_qty as received_qty',
      ],
      [
        ['company', '=', ctx.company],
        ['docstatus', '=', 1],
        ['per_received', '<', 100],
        ['status', 'not in', ['Closed', 'On Hold', 'Completed']],
        ['schedule_date', '<=', toIsoDate(addDays(ctx.today, 1))],
      ],
      { orderBy: 'schedule_date asc', limit: CHILD_ROW_LIMIT },
    );
    // Show the first line still to arrive, and only the part of it not yet received.
    return firstPerName(rows.filter((r) => r.qty > r.received_qty))
      .slice(0, ATTENTION_LIMIT)
      .map((r) => ({
        name: r.name,
        supplier: r.supplier_name,
        scheduleDate: r.schedule_date,
        itemName: r.item_name,
        qty: r.qty - r.received_qty,
      }));
  }

  private async supply(ctx: LoadContext): Promise<SupplyNeed[]> {
    const rows = await this.list<{
      name: string;
      schedule_date: string;
      project: string | null;
      item_code: string;
      item_name: string;
      stock_qty: number;
      ordered_qty: number;
      material_request_type: string;
      from_warehouse: string | null;
      warehouse: string | null;
    }>(
      'Material Request',
      [
        'name',
        'schedule_date',
        'material_request_type',
        'items.ordered_qty as ordered_qty',
        'items.warehouse as warehouse',
        'items.project as project',
        'items.item_code as item_code',
        'items.item_name as item_name',
        'items.stock_qty as stock_qty',
        'items.from_warehouse as from_warehouse',
      ],
      [
        ['company', '=', ctx.company],
        ['docstatus', '=', 1],
        ['material_request_type', 'in', ['Material Transfer', 'Material Issue']],
        ['status', 'in', ['Pending', 'Partially Ordered']],
      ],
      { orderBy: 'schedule_date asc', limit: CHILD_ROW_LIMIT },
    );
    // ordered_qty (already transferred or issued) is in stock units, like stock_qty and Bin quantities.
    const needs = firstPerName(rows.filter((r) => r.project && r.stock_qty > r.ordered_qty)).slice(
      0,
      ATTENTION_LIMIT,
    );
    if (!needs.length) {
      return [];
    }
    const [projects, warehouses] = await Promise.all([
      this.optional(ctx, () =>
        this.list<{ name: string; project_name: string }>(
          'Project',
          ['name', 'project_name'],
          [['name', 'in', needs.map((n) => n.project)]],
        ),
      ),
      this.companyWarehouses(ctx),
    ]);
    const bins = await this.optional(ctx, () =>
      this.stockFor(
        needs.map((n) => n.item_code),
        warehouses,
      ),
    );
    return needs.map((n) => {
      // A Material Issue takes stock out of its item warehouse; a transfer moves it out of from_warehouse.
      const source =
        n.from_warehouse ?? (n.material_request_type === 'Material Issue' ? n.warehouse : null);
      return {
        name: n.name,
        projectName: projects?.find((p) => p.name === n.project)?.project_name ?? n.project ?? '',
        scheduleDate: n.schedule_date,
        itemName: n.item_name,
        qty: n.stock_qty - n.ordered_qty,
        available: (bins ?? [])
          .filter((b) => b.item_code === n.item_code && (!source || b.warehouse === source))
          .reduce((total, b) => total + b.actual_qty, 0),
      };
    });
  }

  private async lowStock(ctx: LoadContext): Promise<LowStock> {
    const warehouses = await this.companyWarehouses(ctx);
    if (!warehouses.length) {
      return { count: 0, warehouse: null };
    }
    const [levelBatches, disabled] = await Promise.all([
      Promise.all(
        batch(warehouses, WAREHOUSE_BATCH).map((group) =>
          this.erpnext.listAll<{
            parent: string;
            warehouse: string;
            warehouse_reorder_level: number;
          }>('Item Reorder', {
            fields: ['parent', 'warehouse', 'warehouse_reorder_level'],
            filters: [
              ['warehouse', 'in', group],
              ['warehouse_reorder_level', '>', 0],
            ],
            parent: 'Item',
          }),
        ),
      ),
      // ERPNext's own reorder job skips disabled items, so Home does too.
      this.erpnext.listAll<{ name: string }>('Item', {
        fields: ['name'],
        filters: [['disabled', '=', 1]],
      }),
    ]);
    const disabledItems = new Set(disabled.map((d) => d.name));
    const levels = levelBatches.flat().filter((l) => !disabledItems.has(l.parent));
    const bins = await this.stockFor(
      levels.map((l) => l.parent),
      warehouses,
    );
    const stock = new Map(bins.map((b) => [`${b.item_code}\u0000${b.warehouse}`, b.actual_qty]));
    const byWarehouse = new Map<string, number>();
    let count = 0;
    for (const level of levels) {
      if (
        (stock.get(`${level.parent}\u0000${level.warehouse}`) ?? 0) < level.warehouse_reorder_level
      ) {
        count++;
        byWarehouse.set(level.warehouse, (byWarehouse.get(level.warehouse) ?? 0) + 1);
      }
    }
    const [busiest] = [...byWarehouse.entries()].sort((a, b) => b[1] - a[1]);
    return { count, warehouse: busiest ? stripAbbr(busiest[0], ctx.companyAbbr) : null };
  }

  private async stockFor(itemCodes: string[], warehouses: string[]) {
    const unique = [...new Set(itemCodes)];
    if (!unique.length || !warehouses.length) {
      return [];
    }
    const queries = batch(unique, ITEM_BATCH).flatMap((items) =>
      batch(warehouses, WAREHOUSE_BATCH).map((group) => ({ items, group })),
    );
    const results = await Promise.all(
      queries.map(({ items, group }) =>
        this.erpnext.listAll<{ item_code: string; warehouse: string; actual_qty: number }>('Bin', {
          fields: ['item_code', 'warehouse', 'actual_qty'],
          filters: [
            ['item_code', 'in', items],
            ['warehouse', 'in', group],
          ],
        }),
      ),
    );
    return results.flat();
  }

  private companyWarehouses(ctx: LoadContext): Promise<string[]> {
    ctx.warehouses ??= this.erpnext
      .listAll<{ name: string }>('Warehouse', {
        fields: ['name'],
        filters: [
          ['company', '=', ctx.company],
          ['is_group', '=', 0],
        ],
      })
      .then((rows) => rows.map((r) => r.name));
    return ctx.warehouses;
  }

  private async sum(doctype: string, field: string, filters: Filter[]): Promise<number> {
    const [row] = await this.list<Record<string, number | null>>(
      doctype,
      [{ SUM: field }],
      filters,
      { limit: 1 },
    );
    return Number(Object.values(row ?? {})[0] ?? 0);
  }

  private list<T>(
    doctype: string,
    fields: Field[],
    filters: Filter[],
    options: { orderBy?: string; groupBy?: string; limit?: number; parent?: string } = {},
  ): Promise<T[]> {
    return firstValueFrom(this.erpnext.list<T>(doctype, { fields, filters, ...options }));
  }

  private async optional<T>(ctx: LoadContext, load: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await load();
      ctx.succeeded = true;
      return result;
    } catch (error) {
      if (ErpnextError.from(error).kind === 'forbidden') {
        ctx.forbidden = true;
        return undefined;
      }
      throw error;
    }
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Child-table fields return one row per item; keep the first item of each document. */
function firstPerName<T extends { name: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.name) && seen.add(r.name));
}

function stripAbbr(warehouse: string, abbr: string): string {
  const suffix = ` - ${abbr}`;
  return warehouse.endsWith(suffix) ? warehouse.slice(0, -suffix.length) : warehouse;
}

function batch<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, i) =>
    values.slice(i * size, (i + 1) * size),
  );
}
