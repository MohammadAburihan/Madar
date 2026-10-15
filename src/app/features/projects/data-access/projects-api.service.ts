import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PostedEarlierError,
  confirmRequest,
  reusableDraft,
  unresolvedOr,
} from '../../../core/erpnext/confirmation';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { invoiceTotal } from '../../../core/erpnext/invoice-total';
import {
  Attachment,
  LinkedRecord,
  ProjectDetail,
  ProjectKind,
  ProjectRequest,
  ProjectStatus,
  ProjectSummary,
  ProjectTask,
  Requirement,
  RequirementRequest,
} from './project.models';

interface RequestDoc {
  name: string;
  docstatus: number;
  items?: { item_code: string; qty: number; uom: string; project?: string | null }[];
}

interface ProjectDoc {
  name: string;
  project_name: string;
  project_type: string | null;
  customer: string | null;
  status: string;
  estimated_costing: number;
  expected_start_date: string | null;
  company: string;
  [key: string]: unknown;
}

/** The shared warehouse that holds every project's site stock; each project's share comes from the ledger. */
export const SITE_WAREHOUSE_NAME = 'Project sites';

/** The project sites warehouse doesn't exist yet, and this role can't create it (Item Manager can). */
export class SiteWarehouseMissingError extends Error {
  constructor() {
    super('The project sites warehouse is missing and this role cannot create it');
  }
}

// Account names are long; batches keep each GET URL well under the request-line limit.
const BATCH = 30;
const TASK_LIMIT = 5;
const LINK_LIMIT = 5;

function batches<T>(values: readonly T[], size = BATCH): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

/** A customer project has a customer, or is typed External in ERPNext; anything else is internal. */
const kindOf = (type: string | null, customer: string | null): ProjectKind =>
  type === 'External' || (type !== 'Internal' && !!customer) ? 'customer' : 'internal';
const statusOf = (status: string): ProjectStatus =>
  status === 'Completed' ? 'completed' : status === 'Cancelled' ? 'cancelled' : 'open';

/** Projects: the list, one project's overview, creating and editing it, and its material requirements. */
@Injectable({ providedIn: 'root' })
export class ProjectsApiService {
  private readonly erpnext = inject(ErpnextClient);

  async list(company: string): Promise<ProjectSummary[]> {
    const rows = await this.erpnext.listAll<ProjectDoc & { customer_name?: string }>('Project', {
      fields: ['name', 'project_name', 'project_type', 'customer', 'status'],
      filters: [['company', '=', company]],
      orderBy: 'modified desc, name desc',
    });
    const names = await this.customerNames(rows.map((r) => r.customer).filter(Boolean) as string[]);
    return rows.map((r) => summary(r, names));
  }

  async project(name: string): Promise<ProjectDetail> {
    const doc = await firstValueFrom(this.erpnext.doc<ProjectDoc>('Project', name));
    const [names, tasks, requirements, attachments, linked, actual] = await Promise.all([
      this.customerNames(doc.customer ? [doc.customer] : []),
      this.tasks(name).catch(() => []),
      this.requirements(name, doc.company).catch(() => []),
      this.attachments(name).catch(() => []),
      this.linked(name).catch(() => []),
      this.actualCost(name, doc.company).catch(() => null),
    ]);
    return {
      ...summary(doc, names),
      budget: doc.estimated_costing ?? 0,
      actual,
      plannedDate: doc.expected_start_date,
      tasks,
      requirements,
      attachments,
      linked,
    };
  }

  /**
   * Creates the project, or saves the changes over an existing one. A customer project is ERPNext's "External"
   * type with its customer; an internal one has none.
   */
  async save(company: string, request: ProjectRequest, existing: string | null): Promise<string> {
    const fields = {
      project_name: request.title.trim(),
      project_type: request.kind === 'internal' ? 'Internal' : 'External',
      customer: request.kind === 'internal' ? null : request.customer,
      estimated_costing: request.budget ?? 0,
      expected_start_date: request.plannedDate,
    };
    if (existing) {
      const current = await firstValueFrom(this.erpnext.doc<ProjectDoc>('Project', existing));
      const saved = await firstValueFrom(
        this.erpnext.post<ProjectDoc>('frappe.client.save', { doc: { ...current, ...fields } }),
      );
      return saved.name;
    }
    const inserted = await firstValueFrom(
      this.erpnext.post<ProjectDoc>('frappe.client.insert', {
        doc: { doctype: 'Project', company, status: 'Open', ...fields },
      }),
    );
    return inserted.name;
  }

  /** The shared site warehouse, created under the company's warehouse root the first time it is needed. */
  async siteWarehouse(company: string): Promise<string> {
    const [found] = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Warehouse', {
        fields: ['name'],
        filters: [
          ['company', '=', company],
          ['warehouse_name', '=', SITE_WAREHOUSE_NAME],
          ['is_group', '=', 0],
        ],
        limit: 1,
      }),
    );
    if (found) {
      return found.name;
    }
    const [root] = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Warehouse', {
        fields: ['name'],
        filters: [
          ['company', '=', company],
          ['is_group', '=', 1],
          ['parent_warehouse', 'in', ['', null]],
        ],
        limit: 1,
      }),
    );
    try {
      const created = await firstValueFrom(
        this.erpnext.post<{ name: string }>('frappe.client.insert', {
          doc: {
            doctype: 'Warehouse',
            warehouse_name: SITE_WAREHOUSE_NAME,
            company,
            parent_warehouse: root?.name ?? null,
          },
        }),
      );
      return created.name;
    } catch (error) {
      throw ErpnextError.from(error).kind === 'forbidden' ? new SiteWarehouseMissingError() : error;
    }
  }

  /**
   * Adds a material requirement: a submitted Material Request (transfer to the project sites) for the project.
   * A timeout throws UnresolvedError; callers look it up with findRequirement() before asking again.
   */
  async addRequirement(
    company: string,
    request: RequirementRequest,
    today: string,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<string> {
    const remembered = draft
      ? await reusableDraft(this.erpnext.doc<RequestDoc>('Material Request', draft))
      : null;
    if (remembered?.docstatus === 1) {
      // A slow earlier attempt submitted it; that is this request's result only if nothing changed.
      if (!sameRequirement(remembered, request)) {
        throw new PostedEarlierError(remembered.name);
      }
      return remembered.name;
    }
    let current = remembered;
    if (current && !sameRequirement(current, request)) {
      // The user changed the item or quantity since the draft was inserted: replace it, never submit it stale.
      await firstValueFrom(
        this.erpnext.post('frappe.client.delete', {
          doctype: 'Material Request',
          name: current.name,
        }),
      );
      current = null;
    }
    const warehouse = await this.siteWarehouse(company);
    try {
      const doc = current
        ? current
        : await confirmRequest(
            this.erpnext.post<RequestDoc>('frappe.client.insert', {
              doc: {
                doctype: 'Material Request',
                material_request_type: 'Material Transfer',
                company,
                transaction_date: today,
                schedule_date: today,
                set_warehouse: warehouse,
                // Material Request has no remarks field; the title carries the Madar reference.
                title: `Madar requirement ${request.reference}`,
                items: [
                  {
                    item_code: request.item,
                    qty: request.qty,
                    uom: request.uom,
                    schedule_date: today,
                    warehouse,
                    project: request.project,
                  },
                ],
              },
            }),
          );
      if (!current) {
        onInserted(doc.name);
      }
      const submitted = await confirmRequest(
        this.erpnext.post<{ name: string }>('frappe.client.submit', {
          doc: await firstValueFrom(this.erpnext.doc('Material Request', doc.name)),
        }),
      );
      return submitted.name;
    } catch (error) {
      throw unresolvedOr(error);
    }
  }

  /** Stock items whose code, name or barcode matches, for a material requirement. */
  async searchItems(term: string): Promise<{ code: string; name: string; uom: string }[]> {
    const like = `%${term.trim()}%`;
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string; item_name: string; stock_uom: string }>('Item', {
        fields: ['name', 'item_name', 'stock_uom'],
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
        limit: 10,
      }),
    );
    return rows.map((r) => ({ code: r.name, name: r.item_name, uom: r.stock_uom }));
  }

  /** Looks a requirement up by its Madar reference after an unresolved confirmation. */
  async findRequirement(
    reference: string,
  ): Promise<{ requirement: string } | 'not-found' | { draft: string }> {
    const [found] = await firstValueFrom(
      this.erpnext.list<{ name: string; docstatus: number }>('Material Request', {
        fields: ['name', 'docstatus'],
        filters: [
          ['title', '=', `Madar requirement ${reference}`],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'docstatus desc',
        limit: 1,
      }),
    );
    if (!found) {
      return 'not-found';
    }
    return found.docstatus === 0 ? { draft: found.name } : { requirement: found.name };
  }

  private async tasks(project: string): Promise<ProjectTask[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        subject: string;
        exp_end_date: string | null;
        status: string;
        _assign: string | null;
      }>('Task', {
        fields: ['subject', 'exp_end_date', 'status', '_assign'],
        filters: [
          ['project', '=', project],
          ['status', 'not in', ['Completed', 'Cancelled', 'Template']],
        ],
        orderBy: 'exp_end_date asc, creation asc',
        // MariaDB sorts undated tasks first; fetch more and put them last before keeping the next few.
        limit: TASK_LIMIT * 4,
      }),
    ).then((all) =>
      [...all.filter((r) => r.exp_end_date), ...all.filter((r) => !r.exp_end_date)].slice(
        0,
        TASK_LIMIT,
      ),
    );
    const users = [...new Set(rows.flatMap((r) => assignees(r._assign)))];
    const names = users.length
      ? await firstValueFrom(
          this.erpnext.list<{ name: string; full_name: string }>('User', {
            fields: ['name', 'full_name'],
            filters: [['name', 'in', users]],
            limit: 0,
          }),
        ).catch(() => [])
      : [];
    return rows.map((r) => ({
      subject: r.subject,
      due: r.exp_end_date,
      owners: assignees(r._assign).map((u) => names.find((n) => n.name === u)?.full_name || u),
      status: r.status,
    }));
  }

  /** What the project's material requests ask for, item by item, with the stock outside the project sites. */
  private async requirements(project: string, company: string): Promise<Requirement[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        item_code: string;
        item_name: string;
        stock_uom: string;
        stock_qty: number;
      }>('Material Request Item', {
        // In the stock unit, as Bin quantities are: a request in boxes of 12 counts 12 per box.
        fields: ['item_code', 'item_name', 'stock_uom', 'stock_qty'],
        filters: [
          ['project', '=', project],
          ['docstatus', '=', 1],
        ],
        parent: 'Material Request',
        limit: 0,
      }),
    );
    const byItem = new Map<string, Requirement>();
    for (const row of rows) {
      const seen = byItem.get(row.item_code);
      byItem.set(row.item_code, {
        item: row.item_code,
        itemName: row.item_name,
        uom: row.stock_uom,
        required: (seen?.required ?? 0) + row.stock_qty,
        available: 0,
      });
    }
    const items = [...byItem.keys()];
    if (!items.length) {
      return [];
    }
    const bins = await firstValueFrom(
      this.erpnext.list<{ item_code: string; warehouse: string; actual_qty: number }>('Bin', {
        fields: ['item_code', 'warehouse', 'actual_qty'],
        filters: [['item_code', 'in', items]],
        limit: 0,
      }),
    ).catch(() => []);
    const warehouses = await this.ownWarehouses(company);
    for (const bin of bins) {
      const requirement = byItem.get(bin.item_code);
      if (requirement && warehouses.has(bin.warehouse)) {
        requirement.available += bin.actual_qty;
      }
    }
    return [...byItem.values()];
  }

  /** The company's stock warehouses that can supply a project: not groups, transit, or the project sites. */
  private async ownWarehouses(company: string): Promise<Set<string>> {
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Warehouse', {
        fields: ['name'],
        filters: [
          ['company', '=', company],
          ['is_group', '=', 0],
          ['disabled', '=', 0],
          ['warehouse_type', '!=', 'Transit'],
          ['warehouse_name', '!=', SITE_WAREHOUSE_NAME],
        ],
        limit: 0,
      }),
    );
    return new Set(rows.map((r) => r.name));
  }

  private async attachments(project: string): Promise<Attachment[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{ file_name: string; file_size: number | null; creation: string }>('File', {
        fields: ['file_name', 'file_size', 'creation'],
        filters: [
          ['attached_to_doctype', '=', 'Project'],
          ['attached_to_name', '=', project],
        ],
        orderBy: 'creation desc',
        limit: LINK_LIMIT,
      }),
    );
    return rows.map((r) => ({
      name: r.file_name,
      size: r.file_size,
      date: r.creation.slice(0, 10),
    }));
  }

  /** The project's sales, sales orders, purchase orders and expenses, newest first, a few of each. */
  private async linked(project: string): Promise<LinkedRecord[]> {
    const money = (doctype: string, kind: LinkedRecord['kind']) =>
      firstValueFrom(
        this.erpnext.list<{
          name: string;
          base_grand_total: number;
          base_rounded_total: number;
          status: string;
        }>(doctype, {
          // Company-currency totals: the overview labels every amount with the company currency.
          fields: ['name', 'base_grand_total', 'base_rounded_total', 'status'],
          filters: [
            ['project', '=', project],
            ['docstatus', '<', 2],
          ],
          orderBy: 'creation desc',
          limit: LINK_LIMIT,
        }),
      )
        .then((rows) =>
          rows.map((r): LinkedRecord => ({
            kind,
            name: r.name,
            detail: r.status,
            amount: invoiceTotal({
              grand_total: r.base_grand_total,
              rounded_total: r.base_rounded_total,
            }),
          })),
        )
        .catch(() => [] as LinkedRecord[]);
    // The rows booked to this project only: an entry can split its amount across several projects.
    const expenses = firstValueFrom(
      this.erpnext.list<{ parent: string; debit: number; credit: number }>(
        'Journal Entry Account',
        {
          fields: ['parent', 'debit', 'credit'],
          filters: [
            ['project', '=', project],
            ['docstatus', '=', 1],
          ],
          parent: 'Journal Entry',
          orderBy: 'creation desc',
          limit: 0,
        },
      ),
    )
      .then((rows) => {
        const totals = new Map<string, number>();
        for (const row of rows) {
          totals.set(row.parent, (totals.get(row.parent) ?? 0) + row.debit - row.credit);
        }
        return [...totals.entries()]
          .filter(([, amount]) => amount > 0)
          .slice(0, LINK_LIMIT)
          .map(([name, amount]): LinkedRecord => ({ kind: 'expense', name, detail: '', amount }));
      })
      .catch(() => [] as LinkedRecord[]);
    const groups = await Promise.all([
      money('Sales Invoice', 'sale'),
      money('Sales Order', 'order'),
      money('Purchase Order', 'purchase'),
      expenses,
    ]);
    return groups.flat();
  }

  /** The project's postings to expense accounts: expenses, consumed stock and supplier invoices booked to it. */
  private async actualCost(project: string, company: string): Promise<number> {
    const accounts = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Account', {
        fields: ['name'],
        filters: [
          ['company', '=', company],
          ['root_type', '=', 'Expense'],
          ['is_group', '=', 0],
        ],
        limit: 0,
      }),
    );
    const sums = await Promise.all(
      batches(accounts.map((a) => a.name)).map((group) =>
        firstValueFrom(
          this.erpnext.list<Record<string, number>>('GL Entry', {
            fields: [{ SUM: 'debit' }, { SUM: 'credit' }],
            filters: [
              ['project', '=', project],
              ['is_cancelled', '=', 0],
              ['account', 'in', group] as Filter,
            ],
            limit: 1,
          }),
        ),
      ),
    );
    return sums.reduce((total, [row]) => {
      const debit = Number(row?.['SUM(`debit`)'] ?? 0);
      const credit = Number(row?.['SUM(`credit`)'] ?? 0);
      return total + debit - credit;
    }, 0);
  }

  private async customerNames(customers: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(customers)];
    if (!unique.length) {
      return new Map();
    }
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string; customer_name: string }>('Customer', {
        fields: ['name', 'customer_name'],
        filters: [['name', 'in', unique]],
        limit: 0,
      }),
    ).catch(() => []);
    return new Map(rows.map((r) => [r.name, r.customer_name]));
  }
}

function sameRequirement(doc: RequestDoc, request: RequirementRequest): boolean {
  const rows = doc.items ?? [];
  return (
    rows.length === 1 &&
    rows[0].item_code === request.item &&
    rows[0].uom === request.uom &&
    rows[0].project === request.project &&
    Math.abs(Number(rows[0].qty) - request.qty) < 1e-6
  );
}

function summary(doc: ProjectDoc, names: Map<string, string>): ProjectSummary {
  const kind = kindOf(doc.project_type, doc.customer);
  return {
    name: doc.name,
    title: doc.project_name,
    kind,
    customer: kind === 'customer' ? doc.customer : null,
    customerName:
      kind === 'customer' && doc.customer ? (names.get(doc.customer) ?? doc.customer) : null,
    status: statusOf(doc.status),
  };
}

/** Frappe keeps a task's assignees as a JSON list of user ids. */
function assignees(value: string | null): string[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
