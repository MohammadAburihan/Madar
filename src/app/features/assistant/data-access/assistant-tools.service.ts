import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Capabilities } from '../../../core/auth/capabilities';
import { OWN_SALES_ONLY, Persona } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { CustomerDirectoryService } from '../../../core/customers/customer-directory.service';
import { ErpnextClient, Field, Filter } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { toIsoDate } from '../../../core/format/format';
import { round2, westernDigits } from '../../../core/format/number';
import { WarehouseDirectoryService } from '../../../core/stock/warehouse-directory.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { ChatContext, RecordLink, ToolOutcome } from './assistant.models';
import {
  ToolInput,
  ToolName,
  isToolName,
  toToolContent,
  toolsFor,
  validateInput,
} from './assistant-tools';

interface Scope {
  persona: Persona;
  caps: Capabilities;
  userId: string;
  company: string;
  currency: string;
  today: string;
}

interface Found {
  payload: Record<string, unknown>;
  listKey: string | null;
  records: RecordLink[];
}

const NOT_ALLOWED = 'not allowed for your role';
const FAILED = 'lookup failed';
// A child-table query returns one row per line, so a bounded number of lines is read.
const LINE_ROWS = 50;
const LINES_SHOWN = 20;
const CLOSED_ORDER_STATUSES = ['Closed', 'On Hold', 'Completed'];

const like = (term: string) => `%${term.trim()}%`;
const aggregate = (
  row: Record<string, unknown> | undefined,
  name: 'SUM' | 'COUNT',
  field: string,
) => Number(row?.[`${name}(\`${field}\`)`] ?? 0);

const forbiddenAsNull = (error: unknown): null => {
  if (ErpnextError.from(error).kind === 'forbidden') {
    return null;
  }
  throw error;
};

function paymentStatus(docstatus: number, total: number, outstanding: number): string {
  if (docstatus === 0) {
    return 'draft';
  }
  if (outstanding <= 0.005) {
    return 'paid';
  }
  return outstanding < total - 0.005 ? 'partly paid' : 'unpaid';
}

/** Runs the assistant's read-only tools against ERPNext with the signed-in user's own access. */
@Injectable({ providedIn: 'root' })
export class AssistantToolsService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly customers = inject(CustomerDirectoryService);
  private readonly warehouses = inject(WarehouseDirectoryService);

  /** The tools this user's role may be offered, and what the assistant is told about the business. */
  async prepare(): Promise<{ tools: ToolName[]; context: ChatContext }> {
    const scope = await this.scope();
    return {
      tools: toolsFor(scope.caps),
      context: {
        business: scope.company,
        currency: scope.currency,
        today: scope.today,
        persona: scope.persona,
      },
    };
  }

  async run(name: string, input: unknown): Promise<ToolOutcome> {
    const fail = (content: string, forbidden = false): ToolOutcome => ({
      content,
      isError: true,
      forbidden,
      records: [],
    });
    try {
      const scope = await this.scope();
      if (!isToolName(name) || !toolsFor(scope.caps).includes(name)) {
        return fail(NOT_ALLOWED);
      }
      const checked = validateInput(name, input);
      if (!checked.ok) {
        return fail(checked.error);
      }
      const found = await this.execute(name, checked.input, scope);
      return {
        content: toToolContent(found.payload, found.listKey),
        isError: false,
        forbidden: false,
        records: found.records,
      };
    } catch (error) {
      return ErpnextError.from(error).kind === 'forbidden' ? fail(NOT_ALLOWED, true) : fail(FAILED);
    }
  }

  private async scope(): Promise<Scope> {
    const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
    const user = this.session.user();
    if (!business || !user) {
      throw new Error('No business or user');
    }
    return {
      persona: this.session.persona(),
      caps: this.session.capabilities(),
      userId: user.id,
      company: business.name,
      currency: business.currency,
      today: toIsoDate(this.clock.now()),
    };
  }

  private execute(name: ToolName, input: ToolInput, scope: Scope): Promise<Found> {
    switch (name) {
      case 'get_today_summary':
        return this.todaySummary(scope);
      case 'search_customers':
        return this.searchCustomers(input, scope);
      case 'search_items':
        return this.searchItems(input, scope);
      case 'find_invoices':
        return this.findInvoices(input, scope);
      case 'get_invoice':
        return this.getInvoice(input, scope);
      case 'list_drafts':
        return this.listDrafts(scope);
      case 'find_purchase_orders':
        return this.findPurchaseOrders(input, scope);
    }
  }

  /** Salespeople and store associates see only their own sales documents. */
  private own(scope: Scope): Filter[] {
    return OWN_SALES_ONLY.includes(scope.persona) ? [['owner', '=', scope.userId]] : [];
  }

  private list<T>(doctype: string, fields: Field[], filters: Filter[], extra = {}): Promise<T[]> {
    return firstValueFrom(this.erpnext.list<T>(doctype, { fields, filters, ...extra }));
  }

  private async todaySummary(scope: Scope): Promise<Found> {
    const own = this.own(scope);
    const company: Filter = ['company', '=', scope.company];
    const [[sales], groups] = await Promise.all([
      this.list<Record<string, unknown>>(
        'Sales Invoice',
        [{ SUM: 'base_grand_total' }, { COUNT: 'name' }],
        [
          company,
          ['docstatus', '=', 1],
          ['is_return', '=', 0],
          ['posting_date', '=', scope.today],
          ...own,
        ],
        { limit: 1 },
      ),
      // Each party's balance is in its own currency: grouping by rate converts it exactly.
      this.list<Record<string, unknown>>(
        'Sales Invoice',
        ['party_account_currency', 'conversion_rate', { SUM: 'outstanding_amount' }],
        [company, ['docstatus', '=', 1], ['outstanding_amount', '>', 0], ...own],
        { groupBy: 'party_account_currency, conversion_rate', limit: 0 },
      ),
    ]);
    const due = groups.reduce((total, group) => {
      const rate =
        group['party_account_currency'] === scope.currency
          ? 1
          : Number(group['conversion_rate']) || 1;
      return total + aggregate(group, 'SUM', 'outstanding_amount') * rate;
    }, 0);
    return {
      payload: {
        date: scope.today,
        currency: scope.currency,
        scope: own.length ? 'your own sales' : 'all sales',
        sales_total: round2(aggregate(sales, 'SUM', 'base_grand_total')),
        sales_count: aggregate(sales, 'COUNT', 'name'),
        amount_due: round2(due),
      },
      listKey: null,
      records: [],
    };
  }

  private async searchCustomers(input: ToolInput, scope: Scope): Promise<Found> {
    const limit = Number(input['limit'] ?? 5);
    const rows = await this.customers.search(
      String(input['query']),
      { name: scope.company, currency: scope.currency },
      limit,
    );
    return {
      payload: {
        currency: scope.currency,
        customers: rows.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          outstanding: round2(c.outstanding),
          unpaid_invoices: c.unpaidInvoices,
        })),
      },
      listKey: 'customers',
      records: rows.map((c) => ({
        kind: 'customer',
        id: c.id,
        label: c.name,
        mentions: [c.name, c.id],
      })),
    };
  }

  private async searchItems(input: ToolInput, scope: Scope): Promise<Found> {
    const limit = Number(input['limit'] ?? 5);
    const term = String(input['query']).trim();
    const rows = await this.list<{
      name: string;
      item_name: string;
      stock_uom: string;
      is_stock_item: number;
      valuation_rate?: number;
    }>(
      'Item',
      [
        'name',
        'item_name',
        'stock_uom',
        'is_stock_item',
        ...(scope.caps.seeCosts ? ['valuation_rate'] : []),
      ],
      [
        ['disabled', '=', 0],
        ['has_variants', '=', 0],
      ],
      {
        // Codes are stored in Western digits; names keep the digits typed.
        orFilters: term
          ? ([
              ['item_code', 'like', like(westernDigits(term))],
              ['item_name', 'like', like(term)],
            ] as Filter[])
          : undefined,
        orderBy: 'item_name asc, name asc',
        limit,
      },
    );
    const [stock, prices] = await Promise.all([
      this.stockFor(
        rows.filter((r) => r.is_stock_item).map((r) => r.name),
        scope,
      ),
      this.pricesFor(rows, scope.today),
    ]);
    return {
      payload: {
        currency: scope.currency,
        items: rows.map((r) => ({
          code: r.name,
          name: r.item_name,
          unit: r.stock_uom,
          ...(r.is_stock_item
            ? { stock: stock?.get(r.name) ?? (stock ? [] : null) }
            : { service: true }),
          selling_price: prices?.get(r.name) ?? null,
          ...(scope.caps.seeCosts && r.is_stock_item
            ? { buying_cost: round2(Number(r.valuation_rate ?? 0)) }
            : {}),
        })),
      },
      listKey: 'items',
      records: rows.map((r) => ({
        kind: 'item',
        id: r.name,
        label: r.item_name,
        mentions: [r.name, r.item_name],
      })),
    };
  }

  /** Quantities per location, or null when the role can't read stock. */
  private async stockFor(
    codes: string[],
    scope: Scope,
  ): Promise<Map<string, { warehouse: string; qty: number }[]> | null> {
    if (!codes.length) {
      return new Map();
    }
    const read = await Promise.all([
      this.warehouses.list(scope.company),
      this.erpnext.listAll<{ item_code: string; warehouse: string; actual_qty: number }>('Bin', {
        fields: ['item_code', 'warehouse', 'actual_qty'],
        filters: [['item_code', 'in', codes]],
      }),
    ]).catch(forbiddenAsNull);
    if (!read) {
      return null;
    }
    const [places, bins] = read;
    const names = new Map(places.map((w) => [w.id, w.name]));
    const stock = new Map<string, { warehouse: string; qty: number }[]>();
    for (const bin of bins) {
      const warehouse = names.get(bin.warehouse);
      if (warehouse && Number(bin.actual_qty) !== 0) {
        const rows = stock.get(bin.item_code) ?? [];
        rows.push({ warehouse, qty: Number(bin.actual_qty) });
        stock.set(bin.item_code, rows);
      }
    }
    return stock;
  }

  /** Standard selling prices on `today`; null when the role can't read Item Price (sales roles can't). */
  private async pricesFor(
    items: { name: string; stock_uom: string }[],
    today: string,
  ): Promise<Map<string, number> | null> {
    if (!items.length) {
      return new Map();
    }
    const settings = await firstValueFrom(
      this.erpnext.get<{ selling_price_list?: string }>('frappe.client.get_value', {
        doctype: 'Selling Settings',
        fieldname: 'selling_price_list',
      }),
    ).catch(forbiddenAsNull);
    const list = settings?.selling_price_list;
    if (!list) {
      return null;
    }
    const rows = await this.list<{
      item_code: string;
      price_list_rate: number;
      uom: string | null;
      valid_from: string | null;
      valid_upto: string | null;
    }>(
      'Item Price',
      ['item_code', 'price_list_rate', 'uom', 'valid_from', 'valid_upto'],
      [
        ['price_list', '=', list],
        ['item_code', 'in', items.map((i) => i.name)],
        ['customer', 'is', 'not set'],
        ['batch_no', 'is', 'not set'],
      ],
      { limit: 0 },
    ).catch(forbiddenAsNull);
    if (!rows) {
      return null;
    }
    const prices = new Map<string, number>();
    for (const item of items) {
      const price = rows
        .filter((r) => r.item_code === item.name && (!r.uom || r.uom === item.stock_uom))
        .filter(
          (r) =>
            (!r.valid_from || r.valid_from <= today) && (!r.valid_upto || r.valid_upto >= today),
        )
        .sort((a, b) => (b.valid_from ?? '').localeCompare(a.valid_from ?? ''))[0];
      if (price) {
        prices.set(item.name, round2(price.price_list_rate));
      }
    }
    return prices;
  }

  private async findInvoices(input: ToolInput, scope: Scope): Promise<Found> {
    const limit = Number(input['limit'] ?? 10);
    const unpaid = input['unpaid_only'] === true;
    const filters: Filter[] = [
      ['company', '=', scope.company],
      ['is_return', '=', 0],
      unpaid ? ['docstatus', '=', 1] : ['docstatus', '<', 2],
      ...this.own(scope),
    ];
    if (unpaid) {
      filters.push(['outstanding_amount', '>', 0]);
    }
    if (typeof input['customer'] === 'string' && input['customer'].trim()) {
      filters.push(['customer_name', 'like', like(input['customer'])]);
    }
    if (typeof input['from'] === 'string') {
      filters.push(['posting_date', '>=', input['from']]);
    }
    if (typeof input['to'] === 'string') {
      filters.push(['posting_date', '<=', input['to']]);
    }
    const [rows, total] = await Promise.all([
      this.list<{
        name: string;
        customer_name: string;
        posting_date: string;
        grand_total: number;
        outstanding_amount: number;
        currency: string;
        docstatus: number;
      }>(
        'Sales Invoice',
        [
          'name',
          'customer_name',
          'posting_date',
          'grand_total',
          'outstanding_amount',
          'currency',
          'docstatus',
        ],
        filters,
        { orderBy: 'posting_date desc, creation desc', limit },
      ),
      firstValueFrom(this.erpnext.count('Sales Invoice', filters)),
    ]);
    return {
      payload: {
        total,
        ...(total > rows.length ? { truncated: true } : {}),
        invoices: rows.map((r) => ({
          name: r.name,
          customer: r.customer_name,
          date: r.posting_date,
          total: round2(r.grand_total),
          currency: r.currency,
          ...(r.docstatus === 0 ? { draft: true } : { amount_due: round2(r.outstanding_amount) }),
        })),
      },
      listKey: 'invoices',
      records: rows.map((r) => ({
        kind: r.docstatus === 0 ? 'draft' : 'invoice',
        id: r.name,
        label: r.name,
        mentions: [r.name],
      })),
    };
  }

  private async getInvoice(input: ToolInput, scope: Scope): Promise<Found> {
    const name = String(input['name']).trim();
    const rows = await this.list<{
      name: string;
      customer_name: string;
      posting_date: string;
      due_date: string | null;
      docstatus: number;
      currency: string;
      grand_total: number;
      outstanding_amount: number;
      item_code: string;
      item_name: string;
      qty: number;
      rate: number;
      amount: number;
      idx: number;
    }>(
      'Sales Invoice',
      [
        'name',
        'customer_name',
        'posting_date',
        'due_date',
        'docstatus',
        'currency',
        'grand_total',
        'outstanding_amount',
        'items.item_code as item_code',
        'items.item_name as item_name',
        'items.qty as qty',
        'items.rate as rate',
        'items.amount as amount',
        'items.idx as idx',
      ],
      [
        ['name', '=', name],
        ['company', '=', scope.company],
        ['docstatus', '<', 2],
        ...this.own(scope),
      ],
      { limit: LINE_ROWS },
    );
    const [head] = rows;
    if (!head) {
      return { payload: { found: false, name }, listKey: null, records: [] };
    }
    const lines = rows.sort((a, b) => a.idx - b.idx);
    const draft = head.docstatus === 0;
    return {
      payload: {
        name: head.name,
        customer: head.customer_name,
        date: head.posting_date,
        due_date: head.due_date,
        currency: head.currency,
        total: round2(head.grand_total),
        status: paymentStatus(head.docstatus, head.grand_total, head.outstanding_amount),
        ...(draft
          ? {}
          : {
              paid: round2(head.grand_total - head.outstanding_amount),
              amount_due: round2(head.outstanding_amount),
            }),
        ...(lines.length > LINES_SHOWN ? { truncated: true } : {}),
        lines: lines.slice(0, LINES_SHOWN).map((l) => ({
          code: l.item_code,
          name: l.item_name,
          qty: l.qty,
          rate: round2(l.rate),
          amount: round2(l.amount),
        })),
      },
      listKey: 'lines',
      records: [
        {
          kind: draft ? 'draft' : 'invoice',
          id: head.name,
          label: head.name,
          mentions: [head.name],
        },
      ],
    };
  }

  private async listDrafts(scope: Scope): Promise<Found> {
    interface Draft {
      kind: string;
      name: string;
      party: string;
      total?: number;
      currency?: string;
      updated: string;
    }
    let forbidden = false;
    let succeeded = false;
    const part = async (
      doctype: string,
      kind: string,
      partyField: string,
      filters: Filter[],
      withTotal: boolean,
    ): Promise<{ count: number; drafts: Draft[] }> => {
      const all: Filter[] = [['company', '=', scope.company], ['docstatus', '=', 0], ...filters];
      try {
        const [rows, count] = await Promise.all([
          this.list<Record<string, unknown> & { name: string; modified: string }>(
            doctype,
            ['name', 'modified', partyField, ...(withTotal ? ['grand_total', 'currency'] : [])],
            all,
            { orderBy: 'modified desc', limit: 20 },
          ),
          firstValueFrom(this.erpnext.count(doctype, all)),
        ]);
        succeeded = true;
        return {
          count,
          drafts: rows.map((r) => ({
            kind,
            name: r.name,
            party: String(r[partyField] ?? ''),
            ...(withTotal
              ? { total: round2(Number(r['grand_total'])), currency: String(r['currency'] ?? '') }
              : {}),
            updated: r.modified.slice(0, 16),
          })),
        };
      } catch (error) {
        if (ErpnextError.from(error).kind === 'forbidden') {
          forbidden = true;
          return { count: 0, drafts: [] };
        }
        throw error;
      }
    };
    const own = this.own(scope);
    const sells = scope.caps.sell;
    const parts = await Promise.all([
      sells
        ? part('Sales Invoice', 'sale', 'customer_name', [...own, ['is_return', '=', 0]], true)
        : null,
      sells ? part('Sales Order', 'order', 'customer_name', own, true) : null,
      sells ? part('Quotation', 'quotation', 'customer_name', own, true) : null,
      scope.caps.orderPurchases
        ? part('Purchase Order', 'purchase', 'supplier_name', [], scope.caps.seeCosts)
        : null,
    ]);
    if (forbidden && !succeeded) {
      throw new ErpnextError('forbidden', 'No draft doctypes are readable', 403);
    }
    const found = parts.filter((p) => p !== null);
    const total = found.reduce((sum, p) => sum + p.count, 0);
    const drafts = found
      .flatMap((p) => p.drafts)
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, 20);
    return {
      payload: { total, ...(total > drafts.length ? { truncated: true } : {}), drafts },
      listKey: 'drafts',
      records: drafts.map((d) => ({
        kind: 'draft',
        id: d.name,
        label: d.name,
        mentions: [d.name],
      })),
    };
  }

  private async findPurchaseOrders(input: ToolInput, scope: Scope): Promise<Found> {
    const limit = Number(input['limit'] ?? 10);
    const filters: Filter[] = [
      ['company', '=', scope.company],
      ['docstatus', '=', 1],
    ];
    if (input['open_only'] === true) {
      filters.push(['per_received', '<', 100], ['status', 'not in', CLOSED_ORDER_STATUSES]);
    }
    if (typeof input['supplier'] === 'string' && input['supplier'].trim()) {
      filters.push(['supplier_name', 'like', like(input['supplier'])]);
    }
    const values = scope.caps.seeCosts;
    const [rows, total] = await Promise.all([
      this.list<{
        name: string;
        supplier_name: string;
        transaction_date: string;
        schedule_date: string | null;
        status: string;
        per_received: number;
        grand_total?: number;
        currency?: string;
      }>(
        'Purchase Order',
        [
          'name',
          'supplier_name',
          'transaction_date',
          'schedule_date',
          'status',
          'per_received',
          ...(values ? ['grand_total', 'currency'] : []),
        ],
        filters,
        { orderBy: 'transaction_date desc, creation desc', limit },
      ),
      firstValueFrom(this.erpnext.count('Purchase Order', filters)),
    ]);
    return {
      payload: {
        total,
        ...(total > rows.length ? { truncated: true } : {}),
        orders: rows.map((r) => ({
          name: r.name,
          supplier: r.supplier_name,
          date: r.transaction_date,
          expected: r.schedule_date,
          status: r.status,
          received_percent: Math.round(Number(r.per_received)),
          ...(values ? { total: round2(Number(r.grand_total)), currency: r.currency } : {}),
        })),
      },
      listKey: 'orders',
      records: rows.map((r) => ({
        kind: 'purchaseOrder',
        id: r.name,
        label: r.name,
        mentions: [r.name],
      })),
    };
  }
}
