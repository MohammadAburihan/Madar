import { Injectable, inject } from '@angular/core';
import { referenceIn } from '../../../core/erpnext/draft';
import { ErpnextClient, Field, Filter } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { DraftEntry, DraftKind, DraftsLoadResult, DraftsScope } from './drafts.models';

// Keeps "in [...]" filters, and so the GET URLs, short.
const NAME_BATCH = 100;

interface Row {
  name: string;
  modified: string;
  [key: string]: unknown;
}

/** Every unfinished (draft) document the user's role can read, across sales and purchasing. */
@Injectable({ providedIn: 'root' })
export class DraftsApiService {
  private readonly erpnext = inject(ErpnextClient);

  async load(scope: DraftsScope): Promise<DraftsLoadResult> {
    let forbidden = false;
    let succeeded = false;
    // A doctype the role can't read is left out on its own; any other failure is the page's failure.
    const part = async (load: () => Promise<DraftEntry[]>): Promise<DraftEntry[]> => {
      try {
        const entries = await load();
        succeeded = true;
        return entries;
      } catch (error) {
        if (ErpnextError.from(error).kind === 'forbidden') {
          forbidden = true;
          return [];
        }
        throw error;
      }
    };
    const own: Filter[] = scope.ownSalesOnly ? [['owner', '=', scope.userId]] : [];
    const parts = await Promise.all([
      scope.sell ? part(() => this.invoices(scope.company, own)) : [],
      scope.sell ? part(() => this.orders(scope.company, own)) : [],
      scope.sell ? part(() => this.quotations(scope.company, own)) : [],
      scope.orderPurchases ? part(() => this.purchases(scope.company)) : [],
      scope.paySuppliers ? part(() => this.payments(scope.company)) : [],
    ]);
    return {
      entries: parts.flat().sort((a, b) => b.modified.localeCompare(a.modified)),
      allForbidden: forbidden && !succeeded,
    };
  }

  private async invoices(company: string, own: Filter[]): Promise<DraftEntry[]> {
    const rows = await this.drafts('Sales Invoice', company, own, [
      'customer_name',
      'grand_total',
      'currency',
      'remarks',
      'update_stock',
      'is_return',
    ]);
    const units = await this.quantities('Sales Invoice', rows);
    return rows.map((r) =>
      entry('sale', r, r['customer_name'], r['grand_total'], r['currency'], units.get(r.name), {
        continuable:
          !!r['update_stock'] && !r['is_return'] && referenceIn(r['remarks'], 'SALE') !== null,
      }),
    );
  }

  private async orders(company: string, own: Filter[]): Promise<DraftEntry[]> {
    const rows = await this.drafts('Sales Order', company, own, [
      'customer_name',
      'grand_total',
      'currency',
    ]);
    const units = await this.quantities('Sales Order', rows);
    return rows.map((r) =>
      entry('order', r, r['customer_name'], r['grand_total'], r['currency'], units.get(r.name)),
    );
  }

  private async quotations(company: string, own: Filter[]): Promise<DraftEntry[]> {
    const rows = await this.drafts('Quotation', company, own, [
      'customer_name',
      'grand_total',
      'currency',
      'quotation_to',
      'utm_content',
    ]);
    const units = await this.quantities('Quotation', rows);
    return rows.map((r) =>
      entry(
        'quotation',
        r,
        r['customer_name'],
        r['grand_total'],
        r['currency'],
        units.get(r.name),
        {
          continuable:
            r['quotation_to'] === 'Customer' && referenceIn(r['utm_content'], 'QUO') !== null,
        },
      ),
    );
  }

  private async purchases(company: string): Promise<DraftEntry[]> {
    const rows = await this.drafts(
      'Purchase Order',
      company,
      [],
      ['supplier_name', 'grand_total', 'currency', 'order_confirmation_no'],
    );
    const units = await this.quantities('Purchase Order', rows);
    return rows.map((r) =>
      entry('purchase', r, r['supplier_name'], r['grand_total'], r['currency'], units.get(r.name), {
        continuable: referenceIn(r['order_confirmation_no'], 'PUR') !== null,
      }),
    );
  }

  private async payments(company: string): Promise<DraftEntry[]> {
    const rows = await this.drafts(
      'Payment Entry',
      company,
      [
        ['payment_type', '=', 'Pay'],
        ['party_type', '=', 'Supplier'],
      ],
      ['party_name', 'paid_amount', 'paid_from_account_currency', 'reference_no'],
    );
    const references = await this.references(rows.map((r) => r.name));
    return rows.map((r) => {
      const own = references.filter((ref) => ref.parent === r.name);
      const invoices = [...new Set(own.map((ref) => ref.reference_name))];
      const continuable =
        referenceIn(r['reference_no'], 'PAYS') !== null &&
        invoices.length === 1 &&
        own.every((ref) => ref.reference_doctype === 'Purchase Invoice');
      return entry(
        'payment',
        r,
        r['party_name'],
        r['paid_amount'],
        r['paid_from_account_currency'],
        undefined,
        { continuable, invoice: continuable ? invoices[0] : null },
      );
    });
  }

  /** Every draft of the company, newest change first; `listAll` because every row counts toward the page. */
  private drafts(
    doctype: string,
    company: string,
    extra: Filter[],
    fields: Field[],
  ): Promise<Row[]> {
    return this.erpnext.listAll<Row>(doctype, {
      fields: ['name', 'modified', ...fields],
      filters: [['company', '=', company], ['docstatus', '=', 0], ...extra],
      orderBy: 'modified desc, name asc',
    });
  }

  private async quantities(doctype: string, rows: Row[]): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    const items = await Promise.all(
      batches(rows.map((r) => r.name)).map((names) =>
        this.erpnext.listAll<{ parent: string; qty: number }>(`${doctype} Item`, {
          fields: ['parent', 'qty'],
          filters: [['parent', 'in', names]],
          parent: doctype,
        }),
      ),
    );
    for (const item of items.flat()) {
      totals.set(item.parent, (totals.get(item.parent) ?? 0) + Number(item.qty));
    }
    return totals;
  }

  private async references(payments: string[]) {
    const lists = await Promise.all(
      batches(payments).map((names) =>
        this.erpnext.listAll<{ parent: string; reference_doctype: string; reference_name: string }>(
          'Payment Entry Reference',
          {
            fields: ['parent', 'reference_doctype', 'reference_name'],
            filters: [['parent', 'in', names]],
            parent: 'Payment Entry',
          },
        ),
      ),
    );
    return lists.flat();
  }
}

function entry(
  kind: DraftKind,
  row: Row,
  party: unknown,
  total: unknown,
  currency: unknown,
  units: number | undefined,
  extra: { continuable?: boolean; invoice?: string | null } = {},
): DraftEntry {
  return {
    kind,
    name: row.name,
    party: String(party ?? ''),
    modified: row.modified,
    total: Number(total ?? 0),
    currency: String(currency ?? ''),
    units: kind === 'payment' ? null : (units ?? 0),
    continuable: extra.continuable ?? false,
    invoice: extra.invoice ?? null,
  };
}

function batches(names: string[]): string[][] {
  return Array.from({ length: Math.ceil(names.length / NAME_BATCH) }, (_, i) =>
    names.slice(i * NAME_BATCH, (i + 1) * NAME_BATCH),
  );
}
