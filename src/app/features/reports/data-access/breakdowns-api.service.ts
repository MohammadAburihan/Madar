import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { DateRange } from './report.models';

/** One line of a breakdown: who or what, how much, and how many where it counts units. */
export interface BreakdownRow {
  key: string;
  label: string;
  amount: number;
  qty: number | null;
}

/** A breakdown's lines, largest first, and their total (company currency). */
export interface Breakdown {
  rows: BreakdownRow[];
  total: number;
}

/** Pay and attendance for the period; null where the role can't read them. */
export interface PeopleFigures {
  net: number | null;
  daysPresent: number | null;
}

const round = (value: number) => Math.round(value * 100) / 100;
const sum = (row: Record<string, unknown>, field: string) =>
  Number(row[`SUM(\`${field}\`)`] ?? row[`sum(${field})`] ?? 0);

function breakdown(rows: BreakdownRow[]): Breakdown {
  const sorted = rows
    .map((r) => ({ ...r, amount: round(r.amount) }))
    .filter((r) => r.amount !== 0 || (r.qty ?? 0) !== 0)
    .sort((a, b) => b.amount - a.amount);
  return { rows: sorted, total: round(sorted.reduce((s, r) => s + r.amount, 0)) };
}

/** Null when the role can't read it; other failures stay failures. */
const forbiddenAsNull = (error: unknown): null => {
  if (ErpnextError.from(error).kind === 'forbidden') {
    return null;
  }
  throw error;
};

/** Period breakdowns posted in ERPNext: sales by item and customer, purchases by supplier, stock, pay. */
@Injectable({ providedIn: 'root' })
export class BreakdownsApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Net sales per item in the period, returns taken off. */
  async salesByItem(company: string, range: DateRange): Promise<Breakdown> {
    const lines = await this.erpnext.listAll<{
      item: string;
      item_name: string;
      qty: number;
      amount: number;
    }>('Sales Invoice', {
      fields: [
        'items.item_code as item',
        'items.item_name as item_name',
        'items.stock_qty as qty',
        'items.base_net_amount as amount',
      ],
      filters: [
        ['company', '=', company],
        ['docstatus', '=', 1],
        ['is_opening', '!=', 'Yes'],
        ['posting_date', 'between', [range.from, range.to]],
      ],
      // Paging over invoice lines needs a sort unique per line, not per invoice.
      orderBy: 'name asc, items.idx asc',
    });
    const byItem = new Map<string, BreakdownRow>();
    for (const l of lines) {
      const row = byItem.get(l.item) ?? {
        key: l.item,
        label: l.item_name || l.item,
        amount: 0,
        qty: 0,
      };
      row.amount += Number(l.amount || 0);
      row.qty = (row.qty ?? 0) + Number(l.qty || 0);
      byItem.set(l.item, row);
    }
    return breakdown([...byItem.values()]);
  }

  /** Net sales per customer in the period, returns taken off. */
  async salesByCustomer(company: string, range: DateRange): Promise<Breakdown> {
    const rows = await firstValueFrom(
      this.erpnext.list<Record<string, unknown>>('Sales Invoice', {
        fields: ['customer', 'customer_name', { SUM: 'base_net_total' }],
        filters: [
          ['company', '=', company],
          ['docstatus', '=', 1],
          // Balances brought in with the opening tool aren't the period's sales or purchases.
          ['is_opening', '!=', 'Yes'],
          ['posting_date', 'between', [range.from, range.to]],
        ],
        // By id alone: a customer renamed during the period stays one line.
        groupBy: 'customer',
        limit: 0,
      }),
    );
    return breakdown(
      rows.map((r) => ({
        key: String(r['customer']),
        label: String(r['customer_name'] || r['customer']),
        amount: sum(r, 'base_net_total'),
        qty: null,
      })),
    );
  }

  /** Net purchases per supplier in the period (supplier invoices, returns taken off). */
  async purchasesBySupplier(company: string, range: DateRange): Promise<Breakdown> {
    const rows = await firstValueFrom(
      this.erpnext.list<Record<string, unknown>>('Purchase Invoice', {
        fields: ['supplier', 'supplier_name', { SUM: 'base_net_total' }],
        filters: [
          ['company', '=', company],
          ['docstatus', '=', 1],
          // Balances brought in with the opening tool aren't the period's sales or purchases.
          ['is_opening', '!=', 'Yes'],
          ['posting_date', 'between', [range.from, range.to]],
        ],
        groupBy: 'supplier',
        limit: 0,
      }),
    );
    return breakdown(
      rows.map((r) => ({
        key: String(r['supplier']),
        label: String(r['supplier_name'] || r['supplier']),
        amount: sum(r, 'base_net_total'),
        qty: null,
      })),
    );
  }

  /** Stock value per warehouse today, from ERPNext's bins; null when the role can't read them (accounts-only owner). */
  async stockByWarehouse(company: string): Promise<Breakdown | null> {
    const read = await Promise.all([
      firstValueFrom(
        this.erpnext.list<Record<string, unknown>>('Bin', {
          fields: ['warehouse', { SUM: 'stock_value' }],
          groupBy: 'warehouse',
          limit: 0,
        }),
      ),
      this.erpnext.listAll<{ name: string; warehouse_name: string }>('Warehouse', {
        fields: ['name', 'warehouse_name'],
        filters: [['company', '=', company]],
      }),
    ]).catch(forbiddenAsNull);
    if (!read) {
      return null;
    }
    const [bins, warehouses] = read;
    const names = new Map(warehouses.map((w) => [w.name, w.warehouse_name]));
    return breakdown(
      bins
        .filter((b) => names.has(String(b['warehouse'])))
        .map((b) => ({
          key: String(b['warehouse']),
          label: names.get(String(b['warehouse'])) ?? String(b['warehouse']),
          amount: sum(b, 'stock_value'),
          qty: null,
        })),
    );
  }

  /** Confirmed pay and days present in the period; null when the role can't read them. */
  async people(company: string, range: DateRange): Promise<PeopleFigures | null> {
    const [slips, attendance] = await Promise.all([
      this.erpnext
        .listAll<{ base_net_pay: number }>('Salary Slip', {
          fields: ['base_net_pay'],
          filters: [
            ['company', '=', company],
            ['docstatus', '=', 1],
            ['start_date', 'between', [range.from, range.to]],
          ],
        })
        .catch(forbiddenAsNull),
      this.erpnext
        .listAll<{ status: string }>('Attendance', {
          fields: ['status'],
          filters: [
            ['company', '=', company],
            ['docstatus', '=', 1],
            ['attendance_date', 'between', [range.from, range.to]],
          ],
        })
        .catch(forbiddenAsNull),
    ]);
    if (!slips && !attendance) {
      return null;
    }
    return {
      net: slips ? round(slips.reduce((s, r) => s + Number(r.base_net_pay || 0), 0)) : null,
      daysPresent: attendance
        ? attendance.reduce(
            (s, r) =>
              s +
              (r.status === 'Present' || r.status === 'Work From Home'
                ? 1
                : r.status === 'Half Day'
                  ? 0.5
                  : 0),
            0,
          )
        : null,
    };
  }
}
