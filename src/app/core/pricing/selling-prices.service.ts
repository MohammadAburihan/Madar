import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';
import { toIsoDate } from '../format/format';
import { shareInFlight } from '../util/share-in-flight';

/** The selling price list and the prices on it, as ERPNext's own sales forms look them up. */
@Injectable({ providedIn: 'root' })
export class SellingPricesService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly priceList = shareInFlight(() => this.loadSellingPriceList());
  private sellingPriceList: string | null = null;

  /** Price per item code; 0 when the list has no price. Sales roles can't read Item Price, so this goes through ERPNext's pricing call. */
  async prices(
    rows: { name: string; stock_uom: string }[],
    company: string,
    date = toIsoDate(new Date()),
  ): Promise<Map<string, number>> {
    const priceList = this.sellingPriceList ?? (await this.priceList());
    if (!priceList) {
      return new Map();
    }
    const result = await firstValueFrom(
      this.erpnext.post<{ children: { name: string; price_list_rate: number | null }[] }>(
        'erpnext.stock.get_item_details.apply_price_list',
        {
          ctx: {
            company,
            doctype: 'Sales Invoice',
            price_list: priceList,
            transaction_date: date,
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
