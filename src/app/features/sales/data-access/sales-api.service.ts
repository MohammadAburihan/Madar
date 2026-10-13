import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { toIsoDate } from '../../../core/format/format';
import { shareInFlight } from '../../../core/util/share-in-flight';
import {
  CatalogItem,
  CustomerOption,
  NewCustomer,
  PaymentAccount,
  SaleRequest,
  SaleResult,
  WarehouseOption,
  round2,
  unitRate,
} from './sale.models';

export type CatalogFilter = 'all' | 'products' | 'services';

/** Thrown when a confirmation may or may not have reached ERPNext (timeout or lost connection). */
export class SaleUnresolvedError extends Error {
  constructor() {
    super('The sale confirmation did not get a definite answer');
  }
}

export const WALK_IN_CUSTOMER = 'Walk-in Customer';

const SEARCH_LIMIT = 20;
// Long enough for a busy ERPNext, short enough that the user isn't left wondering.
const CONFIRM_TIMEOUT_MS = 30_000;

interface InvoiceDoc {
  name: string;
  docstatus: number;
  posting_date: string;
  grand_total: number;
  outstanding_amount: number;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class SalesApiService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly priceList = shareInFlight(() => this.loadSellingPriceList());
  private sellingPriceList: string | null = null;

  async searchCustomers(term: string): Promise<CustomerOption[]> {
    const like = `%${term.trim()}%`;
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        customer_name: string;
        mobile_no: string | null;
        primary_address: string | null;
      }>('Customer', {
        fields: ['name', 'customer_name', 'mobile_no', 'primary_address'],
        filters: [
          ['disabled', '=', 0],
          ['name', '!=', WALK_IN_CUSTOMER],
        ],
        orFilters: term.trim()
          ? [
              ['customer_name', 'like', like],
              ['mobile_no', 'like', like],
              ['name', 'like', like],
            ]
          : undefined,
        orderBy: 'modified desc',
        limit: 5,
      }),
    );
    const outstanding = await this.outstandingFor(rows.map((r) => r.name)).catch(
      () => new Map<string, number>(),
    );
    return rows.map((r) => ({
      id: r.name,
      name: r.customer_name,
      phone: r.mobile_no,
      city: firstAddressLine(r.primary_address),
      outstanding: outstanding.get(r.name) ?? 0,
    }));
  }

  async createCustomer(customer: NewCustomer, country: string): Promise<CustomerOption> {
    // ERPNext creates the primary contact and address from these quick-entry fields.
    const doc = await firstValueFrom(
      this.erpnext.post<{ name: string; customer_name: string; mobile_no: string | null }>(
        'frappe.client.insert',
        {
          doc: {
            doctype: 'Customer',
            customer_name: customer.name.trim(),
            customer_type: 'Individual',
            ...(customer.phone.trim() ? { mobile_no: customer.phone.trim() } : {}),
            ...(customer.email.trim() ? { email_id: customer.email.trim() } : {}),
            ...(customer.address.trim()
              ? { address_line1: customer.address.trim(), city: customer.address.trim(), country }
              : {}),
          },
        },
      ),
    );
    return {
      id: doc.name,
      name: doc.customer_name,
      phone: doc.mobile_no,
      city: customer.address.trim() || null,
      outstanding: 0,
    };
  }

  async searchItems(
    term: string,
    filter: CatalogFilter,
    company: string,
    warehouses: string[],
  ): Promise<CatalogItem[]> {
    const like = `%${term.trim()}%`;
    const filters: Filter[] = [
      ['disabled', '=', 0],
      ['is_sales_item', '=', 1],
      ['has_variants', '=', 0],
    ];
    if (filter !== 'all') {
      filters.push(['is_stock_item', '=', filter === 'products' ? 1 : 0]);
    }
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        item_name: string;
        stock_uom: string;
        is_stock_item: number;
      }>('Item', {
        fields: ['name', 'item_name', 'stock_uom', 'is_stock_item'],
        filters,
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
    if (!rows.length) {
      return [];
    }
    const [prices, bins] = await Promise.all([
      this.prices(rows, company),
      warehouses.length
        ? firstValueFrom(
            this.erpnext.list<{ item_code: string; warehouse: string; actual_qty: number }>('Bin', {
              fields: ['item_code', 'warehouse', 'actual_qty'],
              filters: [
                ['item_code', 'in', rows.map((r) => r.name)],
                ['warehouse', 'in', warehouses],
              ],
              limit: 0,
            }),
          )
        : Promise.resolve([]),
    ]);
    return rows.map((r) => ({
      code: r.name,
      name: r.item_name,
      uom: r.stock_uom,
      isStock: !!r.is_stock_item,
      price: prices.get(r.name) ?? 0,
      stock: r.is_stock_item
        ? Object.fromEntries(
            bins.filter((b) => b.item_code === r.name).map((b) => [b.warehouse, b.actual_qty]),
          )
        : {},
    }));
  }

  async warehouses(company: string): Promise<WarehouseOption[]> {
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

  /** Enabled payment modes with an account for this company, limited to the ones the role may use. */
  async paymentAccounts(
    company: string,
    allowed: 'all' | readonly string[],
  ): Promise<PaymentAccount[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        type: string;
        account: string | null;
        company: string | null;
      }>('Mode of Payment', {
        fields: [
          'name',
          'type',
          'accounts.default_account as account',
          'accounts.company as company',
        ],
        filters: [['enabled', '=', 1]],
        limit: 0,
      }),
    );
    const usable = rows.filter(
      (r) => r.company === company && r.account && (allowed === 'all' || allowed.includes(r.name)),
    );
    if (!usable.length) {
      return [];
    }
    const accounts = await firstValueFrom(
      this.erpnext.list<{ name: string; account_name: string }>('Account', {
        fields: ['name', 'account_name'],
        filters: [['name', 'in', usable.map((r) => r.account!)]],
        limit: 0,
      }),
    ).catch(() => []);
    return usable.map((r) => ({
      mode: r.name,
      account: r.account!,
      label: accounts.find((a) => a.name === r.account)?.account_name ?? r.name,
      isBank: r.type === 'Bank',
    }));
  }

  /** Saves the sale as a draft invoice (no stock or payment effects yet). Updates the draft if it exists. */
  async saveDraft(sale: SaleRequest, existing: string | null): Promise<string> {
    const doc = this.invoiceDoc(sale);
    if (existing) {
      const current = await firstValueFrom(this.erpnext.doc<InvoiceDoc>('Sales Invoice', existing));
      const saved = await firstValueFrom(
        this.erpnext.post<InvoiceDoc>('frappe.client.save', {
          doc: { ...current, ...doc, items: doc.items },
        }),
      );
      return saved.name;
    }
    const inserted = await firstValueFrom(
      this.erpnext.post<InvoiceDoc>('frappe.client.insert', { doc }),
    );
    return inserted.name;
  }

  /**
   * Submits the invoice (delivering stock from the sale's warehouse), then records the payment.
   * A timeout or lost connection throws SaleUnresolvedError: the sale may exist, so callers must check, not retry.
   */
  async confirm(
    sale: SaleRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<SaleResult> {
    let invoice: InvoiceDoc;
    try {
      let doc: InvoiceDoc;
      if (draft) {
        doc = {
          ...(await this.withTimeout(this.erpnext.doc<InvoiceDoc>('Sales Invoice', draft))),
          ...this.invoiceDoc(sale),
        };
      } else {
        doc = await this.withTimeout(
          this.erpnext.post<InvoiceDoc>('frappe.client.insert', { doc: this.invoiceDoc(sale) }),
        );
        // A retry after a rejected submit must reuse this draft, not insert another.
        onInserted(doc.name);
      }
      invoice = await this.withTimeout(
        this.erpnext.post<InvoiceDoc>('frappe.client.submit', { doc }),
      );
    } catch (error) {
      throw unresolvedOr(error);
    }
    return this.recordPayment(sale, invoice);
  }

  /** Looks up a sale by its Madar reference after an unresolved confirmation. */
  async find(sale: SaleRequest): Promise<SaleResult | 'not-found' | { draft: string }> {
    const [invoice] = await firstValueFrom(
      this.erpnext.list<InvoiceDoc>('Sales Invoice', {
        fields: ['name', 'docstatus', 'posting_date', 'grand_total', 'outstanding_amount'],
        filters: [
          ['remarks', 'like', `%${sale.reference}%`],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'docstatus desc',
        limit: 1,
      }),
    );
    if (!invoice) {
      return 'not-found';
    }
    if (invoice.docstatus === 0) {
      return { draft: invoice.name };
    }
    const [payment] = await firstValueFrom(
      this.erpnext.list<{ name: string; paid_amount: number }>('Payment Entry', {
        fields: ['name', 'paid_amount'],
        filters: [
          ['reference_no', '=', sale.reference],
          ['docstatus', '=', 1],
        ],
        limit: 1,
      }),
    );
    if (!payment && sale.amountPaid > 0) {
      return this.recordPayment(sale, invoice);
    }
    return {
      invoice: invoice.name,
      postingDate: invoice.posting_date,
      total: invoice.grand_total,
      paid: payment?.paid_amount ?? 0,
      outstanding: round2(invoice.grand_total - (payment?.paid_amount ?? 0)),
      payment: payment?.name ?? null,
      paymentFailed: false,
    };
  }

  private async recordPayment(sale: SaleRequest, invoice: InvoiceDoc): Promise<SaleResult> {
    const base: SaleResult = {
      invoice: invoice.name,
      postingDate: invoice.posting_date,
      total: invoice.grand_total,
      paid: 0,
      outstanding: invoice.outstanding_amount,
      payment: null,
      paymentFailed: false,
    };
    if (sale.amountPaid <= 0 || !sale.account) {
      return base;
    }
    try {
      const payment = await firstValueFrom(
        this.erpnext.post<Record<string, unknown> & { references: Record<string, unknown>[] }>(
          'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry',
          { dt: 'Sales Invoice', dn: invoice.name },
        ),
      );
      const amount = round2(Math.min(sale.amountPaid, invoice.outstanding_amount));
      Object.assign(payment, {
        mode_of_payment: sale.account.mode,
        paid_to: sale.account.account,
        paid_amount: amount,
        received_amount: amount,
        // Bank modes require a reference; it also lets "Check result" find this payment.
        reference_no: sale.reference,
        reference_date: invoice.posting_date,
        remarks: `Madar quick sale ${sale.reference}`,
      });
      payment.references[0]['allocated_amount'] = amount;
      const inserted = await firstValueFrom(
        this.erpnext.post<Record<string, unknown>>('frappe.client.insert', { doc: payment }),
      );
      const submitted = await firstValueFrom(
        this.erpnext.post<{ name: string; paid_amount: number }>('frappe.client.submit', {
          doc: inserted,
        }),
      );
      return {
        ...base,
        paid: submitted.paid_amount,
        outstanding: round2(invoice.outstanding_amount - submitted.paid_amount),
        payment: submitted.name,
      };
    } catch {
      return { ...base, paymentFailed: true };
    }
  }

  private invoiceDoc(sale: SaleRequest) {
    return {
      doctype: 'Sales Invoice',
      company: sale.company,
      customer: sale.customer,
      // No posting_date: ERPNext uses the site's own "today", not the device's.
      update_stock: 1,
      set_warehouse: sale.warehouse,
      // The rate Madar shows is what gets invoiced; no pricing rules re-apply behind the user's back.
      ignore_pricing_rule: 1,
      // Madar shows exact totals; a rounded total would make "Paid" leave a few agorot owing.
      disable_rounded_total: 1,
      remarks: `Madar quick sale ${sale.reference}`,
      taxes_and_charges: '',
      taxes: [],
      items: sale.lines.map((line) => ({
        item_code: line.item.code,
        qty: line.qty,
        uom: line.item.uom,
        price_list_rate: line.rate,
        discount_percentage: line.discount,
        rate: unitRate(line),
        ...(line.item.isStock ? { warehouse: sale.warehouse } : {}),
      })),
    };
  }

  private async prices(
    rows: { name: string; stock_uom: string }[],
    company: string,
  ): Promise<Map<string, number>> {
    const priceList = this.sellingPriceList ?? (await this.priceList());
    if (!priceList) {
      return new Map();
    }
    // Sales roles can't read Item Price directly; this is the pricing call ERPNext's own sales forms use.
    const result = await firstValueFrom(
      this.erpnext.post<{ children: { name: string; price_list_rate: number | null }[] }>(
        'erpnext.stock.get_item_details.apply_price_list',
        {
          ctx: {
            company,
            doctype: 'Sales Invoice',
            price_list: priceList,
            transaction_date: toIsoDate(new Date()),
            conversion_rate: 1,
            plc_conversion_rate: 1,
            items: rows.map((r) => ({
              doctype: 'Sales Invoice Item',
              // Without it ERPNext reads the child doctype's meta, finds no currency field, and skips the price lookup.
              parenttype: 'Sales Invoice',
              name: r.name,
              child_docname: r.name,
              item_code: r.name,
              qty: 1,
              uom: r.stock_uom,
              stock_uom: r.stock_uom,
              conversion_factor: 1,
            })),
          },
        },
      ),
    );
    return new Map(result.children.map((c) => [c.name, c.price_list_rate ?? 0]));
  }

  private async loadSellingPriceList(): Promise<string | null> {
    // Selling Settings isn't readable by sales roles; enabled selling price lists are.
    const lists = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Price List', {
        fields: ['name'],
        filters: [
          ['selling', '=', 1],
          ['enabled', '=', 1],
        ],
        limit: 0,
      }),
    );
    this.sellingPriceList =
      lists.find((l) => l.name === 'Standard Selling')?.name ?? lists[0]?.name ?? null;
    return this.sellingPriceList;
  }

  private async outstandingFor(customers: string[]): Promise<Map<string, number>> {
    if (!customers.length) {
      return new Map();
    }
    const rows = await firstValueFrom(
      this.erpnext.list<Record<string, number | string>>('Sales Invoice', {
        fields: ['customer', { SUM: 'outstanding_amount' }],
        filters: [
          ['customer', 'in', customers],
          ['docstatus', '=', 1],
          ['outstanding_amount', '>', 0],
        ],
        groupBy: 'customer',
        limit: 0,
      }),
    );
    return new Map(
      rows.map((r) => [String(r['customer']), Number(r['SUM(`outstanding_amount`)'] ?? 0)]),
    );
  }

  private withTimeout<T>(request: import('rxjs').Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(timeout(CONFIRM_TIMEOUT_MS)));
  }
}

function unresolvedOr(error: unknown): Error {
  if ((error as Error)?.name === 'TimeoutError') {
    return new SaleUnresolvedError();
  }
  const erpnextError = ErpnextError.from(error);
  // A gateway timeout or dropped connection means the server may still have saved the sale.
  return erpnextError.kind === 'offline' || erpnextError.status === 504
    ? new SaleUnresolvedError()
    : erpnextError;
}

/** ERPNext's primary_address is HTML-ish text; its first line is the street or city. */
function firstAddressLine(address: string | null): string | null {
  const line = address?.split(/<br\s*\/?>/i)[0]?.trim();
  return line || null;
}
