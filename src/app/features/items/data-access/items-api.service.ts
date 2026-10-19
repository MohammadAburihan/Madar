import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { round2 } from '../../../core/format/number';
import { WarehouseDirectoryService } from '../../../core/stock/warehouse-directory.service';
import { CatalogItem, ItemDetail, ItemFormValue, ItemKind, ItemOptions } from './items.models';

/** The catalog shows this many; the screen says so when there may be more. */
export const CATALOG_LIMIT = 50;

interface ItemRow {
  name: string;
  item_name: string;
  item_group: string;
  stock_uom: string;
  is_stock_item: number;
}

interface ItemDoc extends ItemRow {
  doctype: string;
  valuation_rate: number;
  barcodes?: { barcode: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

interface PriceRow {
  name: string;
  item_code: string;
  price_list_rate: number;
  uom: string | null;
  valid_from: string | null;
  valid_upto: string | null;
}

/**
 * The item's standard selling price on `today`: no customer or batch (those are filtered out in the query), in its
 * own unit, valid that day; the latest start wins, as ERPNext picks it.
 */
function standardPrice(rows: PriceRow[], uom: string, today: string): PriceRow | null {
  return (
    rows
      .filter((r) => !r.uom || r.uom === uom)
      .filter(
        (r) => (!r.valid_from || r.valid_from <= today) && (!r.valid_upto || r.valid_upto >= today),
      )
      .sort((a, b) => (b.valid_from ?? '').localeCompare(a.valid_from ?? ''))[0] ?? null
  );
}

const forbiddenAsNull = (error: unknown): null => {
  if (ErpnextError.from(error).kind === 'forbidden') {
    return null;
  }
  throw error;
};

/** Items & services (ERPNext Item): the catalog, one item with its stock, and adding or editing one. */
@Injectable({ providedIn: 'root' })
export class ItemsApiService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly warehouses = inject(WarehouseDirectoryService);

  /** Matching items, products and services, by name, code or barcode, with price and stock where readable. */
  async catalog(
    term: string,
    kind: ItemKind | 'all',
    company: string,
    today: string,
  ): Promise<CatalogItem[]> {
    const like = `%${term.trim()}%`;
    const rows = await firstValueFrom(
      this.erpnext.list<ItemRow>('Item', {
        fields: ['name', 'item_name', 'item_group', 'stock_uom', 'is_stock_item'],
        filters: [
          ['disabled', '=', 0],
          ['has_variants', '=', 0],
          ...(kind === 'all' ? [] : [['is_stock_item', '=', kind === 'product' ? 1 : 0] as Filter]),
        ],
        orFilters: term.trim()
          ? [
              ['item_code', 'like', like],
              ['item_name', 'like', like],
              ['Item Barcode', 'barcode', 'like', like],
            ]
          : undefined,
        orderBy: 'item_name asc, name asc',
        limit: CATALOG_LIMIT,
      }),
    );
    const [prices, onHand] = await Promise.all([
      this.prices(rows, today),
      this.onHand(
        rows.filter((r) => r.is_stock_item).map((r) => r.name),
        company,
      ),
    ]);
    return rows.map((r) => ({
      ...item(r),
      price: prices?.get(r.name)?.price_list_rate ?? null,
      onHand: r.is_stock_item && onHand ? (onHand.get(r.name) ?? 0) : null,
    }));
  }

  /** One item by its exact code, with its price, buying cost and stock per location. */
  async detail(code: string, company: string, today: string): Promise<ItemDetail> {
    const doc = await firstValueFrom(this.erpnext.doc<ItemDoc>('Item', code));
    const [prices, stock] = await Promise.all([
      this.prices([doc], today),
      doc.is_stock_item ? this.stockOf(doc.name, company) : Promise.resolve(null),
    ]);
    return {
      ...item(doc),
      price: prices?.get(doc.name)?.price_list_rate ?? null,
      onHand: stock ? stock.reduce((sum, s) => sum + s.qty, 0) : null,
      barcode: doc.barcodes?.[0]?.barcode ?? '',
      cost: Number(doc.valuation_rate || 0),
      stock,
      modified: String(doc['modified'] ?? ''),
    };
  }

  /** The item groups (categories) and units ERPNext offers. */
  async options(): Promise<ItemOptions> {
    const [groups, uoms] = await Promise.all([
      firstValueFrom(
        this.erpnext.list<{ name: string }>('Item Group', {
          fields: ['name'],
          filters: [['is_group', '=', 0]],
          orderBy: 'name asc',
          limit: 0,
        }),
      ),
      firstValueFrom(
        this.erpnext.list<{ name: string }>('UOM', {
          fields: ['name'],
          filters: [['enabled', '=', 1]],
          orderBy: 'name asc',
          limit: 0,
        }),
      ),
    ]);
    return { groups: groups.map((g) => g.name), uoms: uoms.map((u) => u.name) };
  }

  /**
   * Adds the item. Its code is its name in ERPNext, so a lost answer is checked with exists(); a code already
   * taken fails with DuplicateEntryError. The selling price is created by ERPNext with the item, in one step.
   */
  async create(value: ItemFormValue): Promise<string> {
    const product = value.kind === 'product';
    const doc = await confirmRequest(
      this.erpnext.post<{ name: string }>('frappe.client.insert', {
        doc: {
          doctype: 'Item',
          item_code: value.code.trim(),
          item_name: value.name.trim(),
          description: value.name.trim(),
          item_group: value.group,
          stock_uom: value.uom,
          is_stock_item: product ? 1 : 0,
          include_item_in_manufacturing: 0,
          ...(product && value.cost !== null ? { valuation_rate: round2(value.cost) } : {}),
          ...(value.price !== null ? { standard_rate: round2(value.price) } : {}),
          barcodes: value.barcode.trim() ? [{ barcode: value.barcode.trim() }] : [],
        },
      }),
    );
    return doc.name;
  }

  /**
   * Saves changes to an item (its kind, code and unit stay as they are) and, when given, its selling price. Both
   * set values, so saving again after a failure repeats nothing.
   */
  async update(
    code: string,
    value: ItemFormValue,
    setPrice: boolean,
    modified: string,
    today: string,
  ): Promise<void> {
    const doc = await firstValueFrom(this.erpnext.doc<ItemDoc>('Item', code));
    const rows = doc.barcodes ?? [];
    const barcode = value.barcode.trim();
    // Services have no barcode field in Madar: theirs, set in Desk, stay as they are.
    const barcodes = !doc.is_stock_item
      ? rows
      : barcode
        ? rows.some((r) => r.barcode === barcode)
          ? rows
          : [{ ...(rows[0] ?? {}), barcode }, ...rows.slice(1)]
        : rows.slice(1);
    await confirmRequest(
      this.erpnext.post('frappe.client.save', {
        doc: {
          ...doc,
          // As loaded into the form: a change made since makes ERPNext refuse instead of being saved over.
          modified,
          item_name: value.name.trim(),
          item_group: value.group,
          ...(doc.is_stock_item && value.cost !== null
            ? { valuation_rate: round2(value.cost) }
            : {}),
          barcodes,
        },
      }),
    );
    if (setPrice && value.price !== null) {
      await this.setPrice(doc, round2(value.price), today);
    }
  }

  /** Whether an item with this code exists, and its name: after a lost answer, whether the add went through. */
  async exists(code: string): Promise<string | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ item_name: string }>('Item', {
        fields: ['item_name'],
        filters: [['name', '=', code.trim()]],
        limit: 1,
      }),
    );
    return row ? row.item_name : null;
  }

  private async setPrice(item: ItemRow, rate: number, today: string): Promise<void> {
    const list = await this.sellingList();
    if (!list) {
      throw new ErpnextError('server', 'No selling price list', 417, 'NoSellingPriceList');
    }
    const existing = standardPrice(await this.priceRows(list, [item.name]), item.stock_uom, today);
    await confirmRequest(
      existing
        ? this.erpnext.post('frappe.client.set_value', {
            doctype: 'Item Price',
            name: existing.name,
            fieldname: 'price_list_rate',
            value: rate,
          })
        : this.erpnext.post('frappe.client.insert', {
            doc: {
              doctype: 'Item Price',
              item_code: item.name,
              price_list: list,
              uom: item.stock_uom,
              price_list_rate: rate,
            },
          }),
    );
  }

  /** The business's selling price list, as Selling Settings names it (setup names it in the site's language). */
  private async sellingList(): Promise<string | null> {
    const list = await firstValueFrom(
      this.erpnext.get<{ selling_price_list?: string }>('frappe.client.get_value', {
        doctype: 'Selling Settings',
        fieldname: 'selling_price_list',
      }),
    ).catch(forbiddenAsNull);
    return list?.selling_price_list || null;
  }

  /** Selling prices by item; null when the role can't read prices (sales roles can't read Item Price). */
  private async prices(items: ItemRow[], today: string): Promise<Map<string, PriceRow> | null> {
    if (!items.length) {
      return new Map();
    }
    const list = await this.sellingList();
    if (!list) {
      return null;
    }
    const rows = await this.priceRows(
      list,
      items.map((i) => i.name),
    ).catch(forbiddenAsNull);
    if (!rows) {
      return null;
    }
    const prices = new Map<string, PriceRow>();
    for (const item of items) {
      const price = standardPrice(
        rows.filter((r) => r.item_code === item.name),
        item.stock_uom,
        today,
      );
      if (price) {
        prices.set(item.name, price);
      }
    }
    return prices;
  }

  /** The list's general prices for the items: not a customer's own, nor a batch's. */
  private priceRows(list: string, codes: string[]): Promise<PriceRow[]> {
    return firstValueFrom(
      this.erpnext.list<PriceRow>('Item Price', {
        fields: ['name', 'item_code', 'price_list_rate', 'uom', 'valid_from', 'valid_upto'],
        filters: [
          ['price_list', '=', list],
          ['item_code', 'in', codes],
          ['customer', 'is', 'not set'],
          ['batch_no', 'is', 'not set'],
        ],
        limit: 0,
      }),
    );
  }

  /** On hand per item across the business's locations; null when the role can't read stock. */
  private async onHand(codes: string[], company: string): Promise<Map<string, number> | null> {
    if (!codes.length) {
      return new Map();
    }
    const read = await Promise.all([
      this.warehouses.list(company),
      this.erpnext.listAll<{ item_code: string; warehouse: string; actual_qty: number }>('Bin', {
        fields: ['item_code', 'warehouse', 'actual_qty'],
        filters: [['item_code', 'in', codes]],
      }),
    ]).catch(forbiddenAsNull);
    if (!read) {
      return null;
    }
    const [places, bins] = read;
    const ids = new Set(places.map((w) => w.id));
    const totals = new Map<string, number>();
    for (const bin of bins.filter((b) => ids.has(b.warehouse))) {
      totals.set(bin.item_code, (totals.get(bin.item_code) ?? 0) + Number(bin.actual_qty));
    }
    return totals;
  }

  private async stockOf(
    code: string,
    company: string,
  ): Promise<{ warehouse: string; qty: number }[] | null> {
    const read = await Promise.all([
      this.warehouses.list(company),
      this.erpnext.listAll<{ warehouse: string; actual_qty: number }>('Bin', {
        fields: ['warehouse', 'actual_qty'],
        filters: [['item_code', '=', code]],
      }),
    ]).catch(forbiddenAsNull);
    if (!read) {
      return null;
    }
    const [places, bins] = read;
    return places.map((w) => ({
      warehouse: w.name,
      qty: bins
        .filter((b) => b.warehouse === w.id)
        .reduce((sum, b) => sum + Number(b.actual_qty), 0),
    }));
  }
}

function item(row: ItemRow): Pick<CatalogItem, 'code' | 'name' | 'group' | 'uom' | 'kind'> {
  return {
    code: row.name,
    name: row.item_name || row.name,
    group: row.item_group,
    uom: row.stock_uom,
    kind: row.is_stock_item ? 'product' : 'service',
  };
}
