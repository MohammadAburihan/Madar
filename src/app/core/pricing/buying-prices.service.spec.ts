import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../testing/fake-erpnext';
import { BuyingPricesService } from './buying-prices.service';

const CTX = {
  company: 'Rehan Nursery',
  supplier: 'Green Clay',
  currency: 'ILS',
  date: '2026-10-25',
};

describe('BuyingPricesService', () => {
  it('reads the buying price list from Buying Settings', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.get_value': () => ({ buying_price_list: 'Standard Buying' }) },
    );
    expect(await TestBed.inject(BuyingPricesService).priceList()).toBe('Standard Buying');
    expect(postCalls[0].body).toEqual({
      doctype: 'Buying Settings',
      fieldname: 'buying_price_list',
    });
  });

  it('asks ERPNext for the supplier’s price on that list, and falls back to the last purchase rate', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'erpnext.stock.get_item_details.get_item_details': () => ({
          price_list_rate: 0,
          last_purchase_rate: 18,
        }),
      },
    );
    const service = TestBed.inject(BuyingPricesService);
    expect(await service.rate('POT-30', 'Standard Buying', CTX)).toBe(18);
    expect(postCalls[0].body['ctx']).toMatchObject({
      item_code: 'POT-30',
      doctype: 'Purchase Order',
      supplier: 'Green Clay',
      buying_price_list: 'Standard Buying',
      price_list_currency: 'ILS',
    });
  });

  it('sends no price list when there is none', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'erpnext.stock.get_item_details.get_item_details': () => ({
          price_list_rate: 20,
          last_purchase_rate: 18,
        }),
      },
    );
    expect(await TestBed.inject(BuyingPricesService).rate('POT-30', null, CTX)).toBe(20);
    expect(postCalls[0].body['ctx']).not.toHaveProperty('buying_price_list');
  });
});
