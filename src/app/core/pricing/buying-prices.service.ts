import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';
import { shareInFlight } from '../util/share-in-flight';

/** The buying price list and a supplier's price on it, as ERPNext's own purchase forms look them up. */
@Injectable({ providedIn: 'root' })
export class BuyingPricesService {
  private readonly erpnext = inject(ErpnextClient);

  /** Buying Settings' price list; purchase roles can read it but not Item Price itself. */
  readonly priceList = shareInFlight(async () => {
    const settings = await firstValueFrom(
      this.erpnext.post<{ buying_price_list: string | null }>('frappe.client.get_value', {
        doctype: 'Buying Settings',
        fieldname: 'buying_price_list',
      }),
    );
    return settings?.buying_price_list ?? null;
  });

  async rate(
    item: string,
    priceList: string | null,
    ctx: { company: string; supplier: string; currency: string; date: string },
  ): Promise<number> {
    const details = await firstValueFrom(
      this.erpnext.post<{ price_list_rate: number; last_purchase_rate: number }>(
        'erpnext.stock.get_item_details.get_item_details',
        {
          ctx: {
            item_code: item,
            company: ctx.company,
            doctype: 'Purchase Order',
            supplier: ctx.supplier,
            currency: ctx.currency,
            conversion_rate: 1,
            qty: 1,
            transaction_date: ctx.date,
            // Without the price list ERPNext returns no list price, only the last purchase rate.
            ...(priceList
              ? {
                  buying_price_list: priceList,
                  price_list_currency: ctx.currency,
                  plc_conversion_rate: 1,
                }
              : {}),
          },
        },
      ),
    );
    return details.price_list_rate || details.last_purchase_rate || 0;
  }
}
