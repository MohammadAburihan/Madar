import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PostedEarlierError,
  confirmRequest,
  reusableDraft,
  unresolvedOr,
} from '../../../core/erpnext/confirmation';
import { CustomerDirectoryService } from '../../../core/customers/customer-directory.service';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { PaymentAccountsService } from '../../../core/money/payment-accounts.service';
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

export { WALK_IN_CUSTOMER } from '../../../core/customers/customer-directory.service';

const SEARCH_LIMIT = 20;

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
  private readonly customers = inject(CustomerDirectoryService);
  private readonly accounts = inject(PaymentAccountsService);
  private readonly priceList = shareInFlight(() => this.loadSellingPriceList());
  private sellingPriceList: string | null = null;

  searchCustomers(
    term: string,
    company?: { name: string; currency: string },
  ): Promise<CustomerOption[]> {
    return this.customers.search(term, company);
  }

  createCustomer(customer: NewCustomer, country: string): Promise<CustomerOption> {
    return this.customers.create(customer, country);
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

  paymentAccounts(company: string, allowed: 'all' | readonly string[]): Promise<PaymentAccount[]> {
    return this.accounts.list(company, allowed);
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
   * A timeout or lost connection throws UnresolvedError: the sale may exist, so callers must check, not retry.
   */
  async confirm(
    sale: SaleRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<SaleResult> {
    const current = draft
      ? await reusableDraft(this.erpnext.doc<InvoiceDoc>('Sales Invoice', draft))
      : null;
    if (current?.docstatus === 1) {
      // A slow earlier attempt confirmed it after all; it's this sale's result only if nothing changed since.
      if (!sameSale(current, sale)) {
        throw new PostedEarlierError(current.name);
      }
      // find() records the payment only if it's missing.
      const found = await this.find(sale);
      if (found !== 'not-found' && !('draft' in found)) {
        return found;
      }
    }
    let invoice: InvoiceDoc;
    try {
      let doc: InvoiceDoc;
      if (current) {
        doc = { ...current, ...this.invoiceDoc(sale) };
      } else {
        doc = await confirmRequest(
          this.erpnext.post<InvoiceDoc>('frappe.client.insert', { doc: this.invoiceDoc(sale) }),
        );
        // A retry after a rejected submit must reuse this draft, not insert another.
        onInserted(doc.name);
      }
      invoice = await confirmRequest(
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
          // bank_account makes ERPNext fill paid_to's currency and type from the chosen account.
          { dt: 'Sales Invoice', dn: invoice.name, bank_account: sale.account.account },
        ),
      );
      const amount = round2(Math.min(sale.amountPaid, invoice.outstanding_amount));
      Object.assign(payment, {
        deductions: [],
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
}

function sameSale(invoice: InvoiceDoc, sale: SaleRequest): boolean {
  const rows = (invoice['items'] as Record<string, unknown>[] | undefined) ?? [];
  return (
    invoice['customer'] === sale.customer &&
    invoice['set_warehouse'] === sale.warehouse &&
    rows.length === sale.lines.length &&
    sale.lines.every((line, i) => {
      const row = rows[i];
      return (
        row['item_code'] === line.item.code &&
        Number(row['qty']) === line.qty &&
        round2(Number(row['rate'])) === unitRate(line) &&
        (!line.item.isStock || row['warehouse'] === sale.warehouse)
      );
    })
  );
}
