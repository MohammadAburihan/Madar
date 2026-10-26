import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { vi } from 'vitest';
import { fakeErpnext, Lister } from '../../../../testing/fake-erpnext';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { CustomerDirectoryService } from '../../../core/customers/customer-directory.service';
import { PartyBalancesService } from '../../../core/customers/party-balances.service';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { ListQuery } from '../../../core/erpnext/erpnext-client';
import { BuyingPricesService } from '../../../core/pricing/buying-prices.service';
import { SellingPricesService } from '../../../core/pricing/selling-prices.service';
import { WarehouseDirectoryService } from '../../../core/stock/warehouse-directory.service';
import { SupplierDirectoryService } from '../../../core/suppliers/supplier-directory.service';
import { ToolFailure, ToolScope } from './assistant.models';
import { AssistantProposalsService } from './assistant-proposals.service';
import { ToolInput, ToolName } from './assistant-tools';

interface ItemRow {
  name: string;
  item_name: string;
  stock_uom: string;
  is_stock_item: number;
  disabled: number;
  is_sales_item: number;
  is_purchase_item: number;
  has_variants: number;
}

const item = (name: string, item_name: string, over: Partial<ItemRow> = {}): ItemRow => ({
  name,
  item_name,
  stock_uom: 'Unit',
  is_stock_item: 1,
  disabled: 0,
  is_sales_item: 1,
  is_purchase_item: 1,
  has_variants: 0,
  ...over,
});

const ITEMS = [
  item('OLV-20', 'Olive tree · 20 L'),
  item('OLV-40', 'Olive tree · 40 L'),
  item('POT-30', 'Ceramic planter'),
  item('POT-31', 'Ceramic planter'),
  item('SRV-GARDEN', 'Garden consultation', { is_stock_item: 0, is_purchase_item: 0 }),
  item('OLD-1', 'Retired pot', { disabled: 1 }),
  item('RAW-1', 'Raw clay', { is_sales_item: 0 }),
];

/** A tiny ERPNext: matches `name = x`, `like %x%`, and the item filters the tool uses. */
const itemList: Lister = (query: ListQuery) => {
  const filters = (query.filters ?? []) as [string, string, unknown][];
  const ors = (query.orFilters ?? []) as [string, string, string][];
  const ok = ITEMS.filter((row) => {
    const record = row as unknown as Record<string, unknown>;
    if (!filters.every(([field, op, value]) => op !== '=' || record[field] === value)) {
      return false;
    }
    return (
      !ors.length ||
      ors.some(([field, op, value]) => {
        const actual = String(record[field === 'item_code' ? 'name' : field] ?? '');
        return op === '='
          ? actual === value
          : actual.toLowerCase().includes(value.replaceAll('%', '').toLowerCase());
      })
    );
  });
  return ok.slice(0, query.limit ?? 20);
};

const LINA = { id: 'Lina Haddad', name: 'Lina Haddad', phone: null, city: null };
const SCOPE = (persona: Persona = 'owner'): ToolScope => ({
  persona,
  caps: capabilitiesFor(persona),
  userId: 'rehan@rehan.example',
  company: 'Rehan Nursery',
  currency: 'ILS',
  today: '2026-10-25',
});

function setup(lists: Record<string, Lister> = {}) {
  TestBed.resetTestingModule();
  const erpnext = fakeErpnext({ Item: itemList, ...lists });
  const customers = {
    exact: vi.fn().mockResolvedValue([{ ...LINA, disabled: false }]),
    find: vi.fn().mockResolvedValue([]),
    candidates: vi.fn().mockResolvedValue([]),
  };
  const suppliers = {
    exact: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([
      { id: 'SUP-1', name: 'Green Clay', city: null },
      { id: 'SUP-2', name: 'Olive Co', city: null },
    ]),
  };
  const balances = { outstanding: vi.fn().mockResolvedValue(new Map([['Lina Haddad', 460]])) };
  const selling = {
    prices: vi.fn().mockResolvedValue(
      new Map([
        ['OLV-20', 85],
        ['OLV-40', 120],
        ['POT-30', 45],
      ]),
    ),
  };
  const buying = {
    priceList: vi.fn().mockResolvedValue('Standard Buying'),
    rate: vi.fn(async (code: string) => (code === 'POT-30' ? 20 : 0)),
  };
  const warehouses = {
    list: vi.fn().mockResolvedValue([
      { id: 'Main - RN', name: 'Main warehouse' },
      { id: 'Garden - RN', name: 'Garden shop' },
    ]),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: CustomerDirectoryService, useValue: customers },
      { provide: SupplierDirectoryService, useValue: suppliers },
      { provide: PartyBalancesService, useValue: balances },
      { provide: SellingPricesService, useValue: selling },
      { provide: BuyingPricesService, useValue: buying },
      { provide: WarehouseDirectoryService, useValue: warehouses },
    ],
  });
  const service = TestBed.inject(AssistantProposalsService);
  const run = (name: ToolName, input: ToolInput, scope = SCOPE()) =>
    service.run(name, input, scope);
  return { ...erpnext, customers, suppliers, balances, selling, buying, warehouses, run };
}

const sale = (over: ToolInput = {}): ToolInput => ({
  customer: 'Lina Haddad',
  items: [{ item: 'OLV-20', qty: 2 }],
  ...over,
});

describe('AssistantProposalsService', () => {
  describe('propose_quick_sale', () => {
    it('proposes the sale with real prices and hands the task resolved ids', async () => {
      const { run, selling } = setup();
      const found = await run('propose_quick_sale', sale());
      const [proposal] = found.proposals!;
      expect(proposal).toMatchObject({
        kind: 'quick_sale',
        party: 'Lina Haddad',
        lines: [{ name: 'Olive tree · 20 L', qty: 2, amount: 170 }],
        total: 170,
        request: {
          kind: 'quick_sale',
          payload: { customer: 'Lina Haddad', lines: [{ item_code: 'OLV-20', qty: 2 }] },
        },
      });
      expect(proposal.id).toMatch(/^PRP-/);
      expect(found.payload).toEqual({
        proposal_id: proposal.id,
        summary: 'Sale to Lina Haddad: 2 × Olive tree · 20 L (ILS 170.00). Total ILS 170.00.',
      });
      expect(selling.prices).toHaveBeenCalledWith(
        [{ name: 'OLV-20', stock_uom: 'Unit' }],
        'Rehan Nursery',
        '2026-10-25',
      );
      expect(found.records).toEqual([]);
      expect(found.choices).toBeUndefined();
    });

    it('finds the customer by exact name first and searches only when there is none', async () => {
      const { run, customers } = setup();
      await run('propose_quick_sale', sale());
      expect(customers.exact).toHaveBeenCalledWith('Lina Haddad');
      expect(customers.find).not.toHaveBeenCalled();
      customers.exact.mockResolvedValue([]);
      customers.find.mockResolvedValue([LINA]);
      const found = await run('propose_quick_sale', sale({ customer: 'lina' }));
      expect(customers.find).toHaveBeenCalledWith('lina', 6);
      expect(found.proposals![0].party).toBe('Lina Haddad');
    });

    it('finds the item by exact code or name first, then by a limited search', async () => {
      const { run, listCalls } = setup();
      await run('propose_quick_sale', sale());
      const exact = listCalls.filter((c) => c.doctype === 'Item');
      expect(exact).toHaveLength(1);
      expect(exact[0].query.orFilters).toEqual([
        ['name', '=', 'OLV-20'],
        ['item_name', '=', 'OLV-20'],
      ]);
      const fuzzy = await run(
        'propose_quick_sale',
        sale({ items: [{ item: 'Ceramic pl', qty: 1 }] }),
      );
      expect(fuzzy.choices).toHaveLength(2);
      const search = listCalls.filter((c) => c.doctype === 'Item').at(-1)!.query;
      expect(search.limit).toBe(6);
      expect(search.filters).toEqual(
        expect.arrayContaining([
          ['disabled', '=', 0],
          ['is_sales_item', '=', 1],
        ]),
      );
    });

    it('finds a single fuzzy match', async () => {
      const { run } = setup();
      const found = await run('propose_quick_sale', sale({ items: [{ item: 'garden', qty: 1 }] }));
      expect(found.proposals![0].lines).toEqual([
        { name: 'Garden consultation', qty: 1, amount: null },
      ]);
      expect(found.payload['notes']).toEqual(['Garden consultation: no selling price is set.']);
    });

    it('reads codes typed with Arabic digits', async () => {
      const { run, listCalls } = setup();
      await run('propose_quick_sale', sale({ items: [{ item: 'OLV-٢٠', qty: 1 }] }));
      expect(listCalls.find((c) => c.doctype === 'Item')!.query.orFilters).toContainEqual([
        'name',
        '=',
        'OLV-20',
      ]);
    });

    it('asks which customer when a name fits several, with at most five options', async () => {
      const { run, customers } = setup();
      customers.exact.mockResolvedValue([]);
      customers.find.mockResolvedValue(
        ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => ({
          id: `C-${n}`,
          name: `Lina ${n}`,
          phone: null,
          city: null,
        })),
      );
      const found = await run('propose_quick_sale', sale({ customer: 'Lina' }));
      expect(found.proposals).toBeUndefined();
      expect(found.payload).toMatchObject({ needs_choice: true, field: 'customer', query: 'Lina' });
      expect(found.choices).toHaveLength(5);
      expect(found.choices![0]).toEqual({ id: 'C-A', label: 'Lina A' });
      expect(found.payload['options']).toEqual(found.choices);
    });

    it('tells apart two customers with the same name by their ids', async () => {
      const { run, customers } = setup();
      customers.exact.mockResolvedValue([
        { ...LINA, id: 'C-1', disabled: false },
        { ...LINA, id: 'C-2', disabled: false },
      ]);
      const found = await run('propose_quick_sale', sale());
      expect(found.choices).toEqual([
        { id: 'C-1', label: 'Lina Haddad (C-1)' },
        { id: 'C-2', label: 'Lina Haddad (C-2)' },
      ]);
    });

    it('resolves a picked label to the customer it was made from', async () => {
      const { run, customers } = setup();
      customers.exact.mockImplementation(async (term: string) =>
        term === 'C-2' ? [{ ...LINA, id: 'C-2', disabled: false }] : [],
      );
      const found = await run('propose_quick_sale', sale({ customer: 'Lina Haddad (C-2)' }));
      expect(found.proposals![0].request).toMatchObject({ payload: { customer: 'C-2' } });
      expect(customers.exact).toHaveBeenCalledWith('C-2');
    });

    it('ignores a customer label whose name is not the record’s name', async () => {
      const { run, customers } = setup();
      customers.exact.mockImplementation(async (term: string) =>
        term === 'C-2' ? [{ ...LINA, id: 'C-2', name: 'Someone Else', disabled: false }] : [],
      );
      customers.find.mockResolvedValue([]);
      await expect(
        run('propose_quick_sale', sale({ customer: 'Lina Haddad (C-2)' })),
      ).rejects.toThrow('not found: customer "Lina Haddad (C-2)"');
    });

    it('resolves a picked label to the item it was made from', async () => {
      const { run } = setup();
      const found = await run(
        'propose_quick_sale',
        sale({ items: [{ item: 'Ceramic planter (POT-31)', qty: 1 }] }),
      );
      expect(found.proposals![0].request).toMatchObject({
        payload: { lines: [{ item_code: 'POT-31', qty: 1 }] },
      });
    });

    it('falls back to normal resolution when an item label names another item', async () => {
      const { run } = setup();
      const found = await run(
        'propose_quick_sale',
        sale({ items: [{ item: 'Olive tree · 20 L (POT-31)', qty: 1 }] }),
      );
      expect(found.proposals).toBeUndefined();
      expect(found.payload).toMatchObject({ needs_choice: true, did_you_mean: true });
    });

    it('resolves a picked label to the warehouse it was made from', async () => {
      const { run, warehouses } = setup();
      warehouses.list.mockResolvedValue([
        { id: 'Main - RN', name: 'Shop' },
        { id: 'Garden - RN', name: 'Shop' },
      ]);
      const found = await run('propose_quick_sale', sale({ warehouse: 'Shop (Garden - RN)' }));
      expect(found.proposals![0].request).toMatchObject({ payload: { warehouse: 'Garden - RN' } });
    });

    it('resolves a picked label to the supplier it was made from', async () => {
      const { run, suppliers } = setup();
      suppliers.exact.mockImplementation(async (term: string) =>
        term === 'SUP-2' ? [{ id: 'SUP-2', name: 'Green Clay', city: null, disabled: false }] : [],
      );
      const found = await run('propose_purchase_order', {
        supplier: 'Green Clay (SUP-2)',
        items: [{ item: 'POT-30', qty: 1 }],
      });
      expect(found.proposals![0].request).toMatchObject({ payload: { supplier: 'SUP-2' } });
    });

    it('asks which item when a name fits several', async () => {
      const { run } = setup();
      const found = await run('propose_quick_sale', sale({ items: [{ item: 'olive', qty: 1 }] }));
      expect(found.payload).toMatchObject({ needs_choice: true, field: 'item', query: 'olive' });
      expect(found.choices).toEqual([
        { id: 'OLV-20', label: 'Olive tree · 20 L' },
        { id: 'OLV-40', label: 'Olive tree · 40 L' },
      ]);
    });

    it('takes the id the user picked as an exact match', async () => {
      const { run } = setup();
      const found = await run('propose_quick_sale', sale({ items: [{ item: 'OLV-40', qty: 1 }] }));
      expect(found.proposals![0].lines[0]).toMatchObject({
        name: 'Olive tree · 40 L',
        amount: 120,
      });
    });

    it('asks which item when two have the same name', async () => {
      const { run } = setup();
      const found = await run(
        'propose_quick_sale',
        sale({ items: [{ item: 'Ceramic planter', qty: 1 }] }),
      );
      expect(found.choices).toEqual([
        { id: 'POT-30', label: 'Ceramic planter (POT-30)' },
        { id: 'POT-31', label: 'Ceramic planter (POT-31)' },
      ]);
    });

    it('fails with "not found" for a customer, an item and a warehouse that match nothing', async () => {
      const { run, customers } = setup();
      customers.exact.mockResolvedValue([]);
      await expect(run('propose_quick_sale', sale({ customer: 'Zed' }))).rejects.toThrow(
        'not found: customer "Zed"',
      );
      customers.exact.mockResolvedValue([{ ...LINA, disabled: false }]);
      await expect(
        run('propose_quick_sale', sale({ items: [{ item: 'zzz', qty: 1 }] })),
      ).rejects.toThrow('not found: item "zzz"');
      await expect(run('propose_quick_sale', sale({ warehouse: 'Mars' }))).rejects.toThrow(
        'not found: warehouse "Mars"',
      );
    });

    it('rejects a disabled customer with the reason', async () => {
      const { run, customers } = setup();
      customers.exact.mockResolvedValue([{ ...LINA, disabled: true }]);
      await expect(run('propose_quick_sale', sale())).rejects.toThrow(
        new ToolFailure('customer is disabled: Lina Haddad'),
      );
      expect(customers.find).not.toHaveBeenCalled();
    });

    it('rejects a disabled item and an item that is not for sale, with the reason', async () => {
      const { run } = setup();
      await expect(
        run('propose_quick_sale', sale({ items: [{ item: 'Retired pot', qty: 1 }] })),
      ).rejects.toThrow('item is disabled: Retired pot');
      await expect(
        run('propose_quick_sale', sale({ items: [{ item: 'Raw clay', qty: 1 }] })),
      ).rejects.toThrow("item can't be sold: Raw clay");
    });

    it('resolves a warehouse by exact name or id, and a part of a name', async () => {
      const { run } = setup();
      const named = await run('propose_quick_sale', sale({ warehouse: 'garden shop' }));
      expect(named.proposals![0].request).toMatchObject({
        payload: { warehouse: 'Garden - RN' },
      });
      const part = await run('propose_quick_sale', sale({ warehouse: 'Main' }));
      expect(part.proposals![0].request).toMatchObject({ payload: { warehouse: 'Main - RN' } });
    });

    it('proposes a walk-in sale only for a role that may', async () => {
      const { run, customers } = setup();
      const found = await run('propose_quick_sale', sale({ customer: 'Walk-in' }));
      expect(customers.exact).not.toHaveBeenCalled();
      expect(found.proposals![0]).toMatchObject({
        party: null,
        request: { payload: { walkIn: true, lines: [{ item_code: 'OLV-20', qty: 2 }] } },
      });
      expect(found.payload['summary']).toMatch(/^Sale to a walk-in customer/);
      const caps = { ...capabilitiesFor('salesperson'), sellToWalkIn: false };
      await expect(
        run('propose_quick_sale', sale({ customer: 'walk in' }), { ...SCOPE('salesperson'), caps }),
      ).rejects.toThrow('walk-in sales are not allowed for your role');
    });

    it('adds up an item named twice into one line', async () => {
      const { run } = setup();
      const found = await run(
        'propose_quick_sale',
        sale({
          items: [
            { item: 'OLV-20', qty: 1 },
            { item: 'Olive tree · 20 L', qty: 2 },
          ],
        }),
      );
      expect(found.proposals![0].lines).toEqual([
        { name: 'Olive tree · 20 L', qty: 3, amount: 255 },
      ]);
    });

    it('keeps a proposed price for the owner and totals it', async () => {
      const { run } = setup();
      const found = await run(
        'propose_quick_sale',
        sale({ items: [{ item: 'OLV-20', qty: 2, rate: 80 }] }),
      );
      expect(found.proposals![0].total).toBe(160);
      expect(found.proposals![0].request).toMatchObject({
        payload: { lines: [{ item_code: 'OLV-20', qty: 2, rate: 80 }] },
      });
    });

    it('ignores a proposed price for a role that may not set prices, and says so', async () => {
      const { run } = setup();
      const found = await run(
        'propose_quick_sale',
        sale({ items: [{ item: 'OLV-20', qty: 2, rate: 10 }] }),
        SCOPE('salesperson'),
      );
      expect(found.proposals![0].total).toBe(170);
      expect(found.proposals![0].request).toMatchObject({
        payload: { lines: [{ item_code: 'OLV-20', qty: 2 }] },
      });
      expect(found.payload['notes']).toEqual([
        "Olive tree · 20 L: the proposed price was ignored; your role can't set prices.",
      ]);
    });

    it('shows no amounts when the role can not read prices', async () => {
      const { run, selling } = setup();
      selling.prices.mockRejectedValue(new ErpnextError('forbidden', 'No permission', 403));
      const found = await run('propose_quick_sale', sale(), SCOPE('salesperson'));
      expect(found.proposals![0].lines[0].amount).toBeNull();
      expect(found.proposals![0].total).toBeNull();
      expect(found.payload['notes']).toEqual([
        "Olive tree · 20 L: prices aren't available for your role.",
      ]);
    });

    it('fails the call when reading a price breaks for another reason', async () => {
      const { run, selling } = setup();
      selling.prices.mockRejectedValue(new ErpnextError('server', 'Boom', 500));
      await expect(run('propose_quick_sale', sale())).rejects.toBeInstanceOf(ErpnextError);
    });
  });

  describe('propose_quotation', () => {
    it('proposes a quotation for a named customer with real prices', async () => {
      const { run } = setup();
      const found = await run('propose_quotation', sale({ items: [{ item: 'POT-30', qty: 4 }] }));
      expect(found.proposals![0]).toMatchObject({
        kind: 'quotation',
        party: 'Lina Haddad',
        total: 180,
        request: {
          kind: 'quotation',
          payload: { customer: 'Lina Haddad', lines: [{ item_code: 'POT-30', qty: 4 }] },
        },
      });
    });

    it('refuses a walk-in: a quotation needs a named customer', async () => {
      const { run } = setup();
      await expect(run('propose_quotation', sale({ customer: 'walk-in' }))).rejects.toThrow(
        'a quotation needs a named customer, not a walk-in',
      );
    });
  });

  describe('propose_purchase_order', () => {
    const order = (over: ToolInput = {}): ToolInput => ({
      supplier: 'Green Clay',
      items: [{ item: 'POT-30', qty: 10 }],
      ...over,
    });

    it('proposes an order from the supplier at the supplier’s buying price', async () => {
      const { run, buying } = setup();
      const found = await run('propose_purchase_order', order());
      expect(found.proposals![0]).toMatchObject({
        kind: 'purchase_order',
        party: 'Green Clay',
        lines: [{ name: 'Ceramic planter', qty: 10, amount: 200 }],
        total: 200,
        request: {
          kind: 'purchase_order',
          payload: { supplier: 'SUP-1', lines: [{ item_code: 'POT-30', qty: 10 }] },
        },
      });
      expect(buying.rate).toHaveBeenCalledWith('POT-30', 'Standard Buying', {
        company: 'Rehan Nursery',
        supplier: 'SUP-1',
        currency: 'ILS',
        date: '2026-10-25',
      });
    });

    it('looks only at items that can be bought', async () => {
      const { run } = setup();
      await expect(
        run('propose_purchase_order', order({ items: [{ item: 'Garden consultation', qty: 1 }] })),
      ).rejects.toThrow("item can't be bought: Garden consultation");
    });

    it('says when no buying price is set, leaving the amount to the form', async () => {
      const { run } = setup();
      const found = await run(
        'propose_purchase_order',
        order({ items: [{ item: 'OLV-20', qty: 1 }] }),
      );
      expect(found.proposals![0].lines[0].amount).toBeNull();
      expect(found.proposals![0].total).toBeNull();
      expect(found.payload['notes']).toEqual([
        'Olive tree · 20 L: no buying price is set; the order form will ask for it.',
      ]);
    });

    it('keeps a proposed price for a role that sees costs', async () => {
      const { run } = setup();
      const found = await run(
        'propose_purchase_order',
        order({ items: [{ item: 'POT-30', qty: 10, rate: 18 }] }),
      );
      expect(found.proposals![0].total).toBe(180);
      expect(found.proposals![0].request).toMatchObject({
        payload: { lines: [{ item_code: 'POT-30', qty: 10, rate: 18 }] },
      });
    });

    it('ignores a proposed price for a role that may not see costs', async () => {
      const { run } = setup();
      const caps = { ...capabilitiesFor('owner'), seeCosts: false };
      const found = await run(
        'propose_purchase_order',
        order({ items: [{ item: 'POT-30', qty: 10, rate: 18 }] }),
        { ...SCOPE(), caps },
      );
      expect(found.proposals![0].total).toBe(200);
      expect(found.payload['notes']).toEqual([
        "Ceramic planter: the proposed price was ignored; your role can't set prices.",
      ]);
    });

    it('finds the supplier by exact name first, then a part of a name', async () => {
      const { run, suppliers } = setup();
      suppliers.exact.mockResolvedValue([
        { id: 'SUP-2', name: 'Olive Co', city: null, disabled: false },
      ]);
      const exact = await run('propose_purchase_order', order({ supplier: 'Olive Co' }));
      expect(exact.proposals![0].request).toMatchObject({ payload: { supplier: 'SUP-2' } });
      suppliers.exact.mockResolvedValue([]);
      const part = await run('propose_purchase_order', order({ supplier: 'green' }));
      expect(part.proposals![0].party).toBe('Green Clay');
    });

    it('asks which supplier when a name fits several, and fails when none', async () => {
      const { run, suppliers } = setup();
      const found = await run('propose_purchase_order', order({ supplier: 'l' }));
      expect(found.payload).toMatchObject({ needs_choice: true, field: 'supplier' });
      expect(found.choices).toEqual([
        { id: 'SUP-1', label: 'Green Clay' },
        { id: 'SUP-2', label: 'Olive Co' },
      ]);
      suppliers.list.mockResolvedValue([]);
      await expect(run('propose_purchase_order', order({ supplier: 'zz' }))).rejects.toThrow(
        'not found: supplier "zz"',
      );
    });

    it('rejects a disabled supplier with the reason', async () => {
      const { run, suppliers } = setup();
      suppliers.exact.mockResolvedValue([
        { id: 'SUP-1', name: 'Green Clay', city: null, disabled: true },
      ]);
      await expect(run('propose_purchase_order', order())).rejects.toThrow(
        'supplier is disabled: Green Clay',
      );
    });
  });

  describe('propose_collect_payment', () => {
    it('proposes collecting what the customer owes, or the amount asked', async () => {
      const { run, balances } = setup();
      const all = await run('propose_collect_payment', { customer: 'Lina Haddad' });
      expect(all.proposals![0]).toMatchObject({
        kind: 'collect_payment',
        party: 'Lina Haddad',
        amount: null,
        due: 460,
        request: { kind: 'collect_payment', payload: { customer: 'Lina Haddad' } },
      });
      expect(all.payload['summary']).toBe(
        'Payment from Lina Haddad (ILS 460.00 outstanding): the full amount due.',
      );
      const some = await run('propose_collect_payment', { customer: 'Lina Haddad', amount: 100 });
      expect(some.proposals![0].request).toMatchObject({
        payload: { customer: 'Lina Haddad', amount: 100 },
      });
      expect(balances.outstanding).toHaveBeenCalledWith(
        'Sales Invoice',
        'customer',
        ['Lina Haddad'],
        { name: 'Rehan Nursery', currency: 'ILS' },
        null,
      );
    });

    it('counts only their own invoices for a role that sees only its own sales', async () => {
      const { run, balances } = setup();
      await run('propose_collect_payment', { customer: 'Lina Haddad' }, SCOPE('salesperson'));
      expect(balances.outstanding.mock.calls[0][4]).toBe('rehan@rehan.example');
    });

    it('refuses when nothing is owed, or more than is owed', async () => {
      const { run, balances } = setup();
      await expect(
        run('propose_collect_payment', { customer: 'Lina Haddad', amount: 500 }),
      ).rejects.toThrow('the amount is more than Lina Haddad owes: ILS 460.00 outstanding');
      balances.outstanding.mockResolvedValue(new Map());
      await expect(run('propose_collect_payment', { customer: 'Lina Haddad' })).rejects.toThrow(
        'nothing to collect: Lina Haddad has no unpaid invoices',
      );
    });

    it('does not guess what is owed when the role can not read balances', async () => {
      const { run, balances } = setup();
      balances.outstanding.mockRejectedValue(new ErpnextError('forbidden', 'No permission', 403));
      const found = await run('propose_collect_payment', { customer: 'Lina Haddad', amount: 90 });
      expect(found.proposals![0]).toMatchObject({ amount: 90, due: null });
    });

    it('refuses a walk-in and a disabled customer', async () => {
      const { run, customers } = setup();
      await expect(run('propose_collect_payment', { customer: 'walk-in' })).rejects.toThrow(
        'walk-in sales have nothing to collect later',
      );
      customers.exact.mockResolvedValue([{ ...LINA, disabled: true }]);
      await expect(run('propose_collect_payment', { customer: 'Lina Haddad' })).rejects.toThrow(
        'customer is disabled: Lina Haddad',
      );
    });
  });

  describe('propose_stock_move', () => {
    const bins: Record<string, Lister> = {
      Bin: () => [{ warehouse: 'Main - RN', actual_qty: 24 }],
    };

    it('proposes moving a stock item between two named locations', async () => {
      const { run } = setup(bins);
      const found = await run('propose_stock_move', {
        item: 'OLV-20',
        qty: 5,
        from: 'Main warehouse',
        to: 'garden',
      });
      expect(found.proposals![0]).toMatchObject({
        kind: 'stock_move',
        item: 'Olive tree · 20 L',
        from: 'Main warehouse',
        to: 'Garden shop',
        lines: [{ name: 'Olive tree · 20 L', qty: 5, amount: null }],
        request: {
          kind: 'stock_move',
          payload: {
            item_code: 'OLV-20',
            qty: 5,
            from_warehouse: 'Main - RN',
            to_warehouse: 'Garden - RN',
          },
        },
      });
      expect(found.payload['summary']).toBe(
        'Stock move of 5 × Olive tree · 20 L: Main warehouse to Garden shop.',
      );
      expect(found.payload['notes']).toBeUndefined();
    });

    it('leaves out the locations that were not named', async () => {
      const { run } = setup(bins);
      const found = await run('propose_stock_move', { item: 'OLV-20', qty: 1 });
      expect(found.proposals![0].request).toEqual({
        kind: 'stock_move',
        payload: { item_code: 'OLV-20', qty: 1 },
      });
    });

    it('says when the source holds less than asked, and still proposes', async () => {
      const { run } = setup(bins);
      const found = await run('propose_stock_move', { item: 'OLV-20', qty: 30, from: 'Main' });
      expect(found.payload['notes']).toEqual([
        'Main warehouse holds only 24; the form will ask for a smaller quantity.',
      ]);
    });

    it('proposes anyway when the role can not read stock', async () => {
      const { run } = setup({
        Bin: () => throwError(() => new ErpnextError('forbidden', 'No permission', 403)),
      });
      const found = await run('propose_stock_move', { item: 'OLV-20', qty: 30, from: 'Main' });
      expect(found.proposals).toHaveLength(1);
    });

    it('refuses a fractional quantity, the same location twice, and an item that is not stock', async () => {
      const { run } = setup(bins);
      await expect(run('propose_stock_move', { item: 'OLV-20', qty: 1.5 })).rejects.toThrow(
        'qty must be a whole number: stock moves whole units',
      );
      await expect(
        run('propose_stock_move', { item: 'OLV-20', qty: 1, from: 'Main', to: 'main warehouse' }),
      ).rejects.toThrow('from and to are the same location');
      await expect(
        run('propose_stock_move', { item: 'Garden consultation', qty: 1 }),
      ).rejects.toThrow("item isn't a stock item: Garden consultation");
    });

    it('asks which location when a name fits several', async () => {
      const { run, warehouses } = setup(bins);
      warehouses.list.mockResolvedValue([
        { id: 'Shop A - RN', name: 'Shop A' },
        { id: 'Shop B - RN', name: 'Shop B' },
      ]);
      const found = await run('propose_stock_move', { item: 'OLV-20', qty: 1, to: 'shop' });
      expect(found.payload).toMatchObject({ needs_choice: true, field: 'to' });
      expect(found.choices).toEqual([
        { id: 'Shop A - RN', label: 'Shop A' },
        { id: 'Shop B - RN', label: 'Shop B' },
      ]);
    });
  });

  describe('open_record', () => {
    const doc =
      (rows: { name: string; docstatus: number }[]): Lister =>
      (query) => {
        const name = (query.filters as [string, string, unknown][]).find(([f]) => f === 'name')![2];
        return rows.filter((r) => r.name === name);
      };

    it('opens a confirmed record and says it can not be cancelled or amended yet', async () => {
      const { run, listCalls } = setup({ 'Sales Invoice': doc([{ name: 'SI-1', docstatus: 1 }]) });
      const found = await run('open_record', { kind: 'invoice', name: 'SI-1' });
      expect(found.proposals![0]).toMatchObject({
        kind: 'open_record',
        record: { kind: 'invoice', id: 'SI-1', label: 'SI-1', draft: false },
        request: null,
      });
      expect(found.payload['summary']).toContain(
        "cancelling or amending isn't available in Madar yet",
      );
      const query = listCalls.find((c) => c.doctype === 'Sales Invoice')!.query;
      expect(query.filters).toEqual([
        ['name', '=', 'SI-1'],
        ['company', '=', 'Rehan Nursery'],
        ['docstatus', 'in', [0, 1]],
      ]);
    });

    it('points a draft at its own page, where Continue and Delete live', async () => {
      const { run } = setup({ Quotation: doc([{ name: 'QN-7', docstatus: 0 }]) });
      const found = await run('open_record', { kind: 'quotation', name: 'QN-7' });
      expect(found.proposals![0].record).toEqual({
        kind: 'quotation',
        id: 'QN-7',
        label: 'QN-7',
        draft: true,
      });
      expect(found.payload['summary']).toContain('Continue and Delete');
    });

    it('finds a draft of any kind by its name, only among drafts', async () => {
      const { run, listCalls } = setup({
        'Sales Invoice': doc([]),
        Quotation: doc([]),
        'Sales Order': doc([{ name: 'SO-3', docstatus: 0 }]),
      });
      const found = await run('open_record', { kind: 'draft', name: 'SO-3' });
      expect(found.proposals![0].record).toEqual({
        kind: 'salesOrder',
        id: 'SO-3',
        label: 'SO-3',
        draft: true,
      });
      expect(
        listCalls.every((c) => JSON.stringify(c.query.filters).includes('["docstatus","in",[0]]')),
      ).toBe(true);
    });

    it('does not look for drafts of purchase orders for a role that may not order purchases', async () => {
      const { run, listCalls } = setup({
        'Sales Invoice': doc([]),
        Quotation: doc([]),
        'Sales Order': doc([]),
      });
      await expect(
        run('open_record', { kind: 'draft', name: 'PO-1' }, SCOPE('salesperson')),
      ).rejects.toThrow('not found: draft "PO-1"');
      expect(listCalls.map((c) => c.doctype)).not.toContain('Purchase Order');
    });

    it('limits a salesperson to their own sales documents', async () => {
      const { run, listCalls } = setup({ 'Sales Invoice': doc([]) });
      await expect(
        run('open_record', { kind: 'invoice', name: 'SI-1' }, SCOPE('salesperson')),
      ).rejects.toThrow('not found: invoice "SI-1"');
      expect(listCalls[0].query.filters).toContainEqual(['owner', '=', 'rehan@rehan.example']);
    });

    it('does not limit purchase orders by owner', async () => {
      const { run, listCalls } = setup({ 'Purchase Order': doc([{ name: 'PO-1', docstatus: 1 }]) });
      await run('open_record', { kind: 'purchase_order', name: 'PO-1' }, SCOPE('purchasing'));
      expect(JSON.stringify(listCalls[0].query.filters)).not.toContain('owner');
    });

    it('opens a customer, a supplier and an item by name, disabled ones too', async () => {
      const { run, customers, suppliers } = setup();
      customers.exact.mockResolvedValue([{ ...LINA, disabled: true }]);
      suppliers.exact.mockResolvedValue([
        { id: 'SUP-1', name: 'Green Clay', city: null, disabled: true },
      ]);
      const customer = await run('open_record', { kind: 'customer', name: 'Lina Haddad' });
      expect(customer.proposals![0].record).toEqual({
        kind: 'customer',
        id: 'Lina Haddad',
        label: 'Lina Haddad',
        draft: false,
      });
      const supplier = await run('open_record', { kind: 'supplier', name: 'Green Clay' });
      expect(supplier.proposals![0].record).toMatchObject({ kind: 'supplier', id: 'SUP-1' });
      const itemFound = await run('open_record', { kind: 'item', name: 'Retired pot' });
      expect(itemFound.proposals![0].record).toMatchObject({ kind: 'item', id: 'OLD-1' });
    });

    it('asks which one when a name fits several records', async () => {
      const { run } = setup();
      const found = await run('open_record', { kind: 'item', name: 'olive' });
      expect(found.payload).toMatchObject({ needs_choice: true, field: 'item' });
    });

    it('refuses a kind of record the role may not read, without asking ERPNext', async () => {
      const { run, listCalls } = setup();
      await expect(
        run('open_record', { kind: 'purchase_order', name: 'PO-1' }, SCOPE('salesperson')),
      ).rejects.toThrow('not allowed for your role');
      await expect(
        run('open_record', { kind: 'invoice', name: 'SI-1' }, SCOPE('warehouse')),
      ).rejects.toThrow('not allowed for your role');
      expect(listCalls).toEqual([]);
    });

    it('fails with "not found" for a record that is not this business’s', async () => {
      const { run } = setup({ 'Sales Order': doc([]) });
      await expect(run('open_record', { kind: 'sales_order', name: 'SO-9' })).rejects.toThrow(
        'not found: sales order "SO-9"',
      );
    });
  });

  describe('did you mean and add as new', () => {
    const SAMER = { id: 'C-9', name: 'Samer Odeh', phone: null, city: null };
    const noExact = (customers: { exact: { mockResolvedValue: (v: unknown) => void } }) =>
      customers.exact.mockResolvedValue([]);

    it('suggests close customers when exact and the limited search find nothing', async () => {
      const { run, customers } = setup();
      noExact(customers);
      customers.candidates.mockResolvedValue([
        { id: 'C-1', name: 'Lina Haddad', phone: null, city: null },
        SAMER,
      ]);
      const found = await run('propose_collect_payment', { customer: 'Leena' });
      expect(customers.find).toHaveBeenCalledWith('Leena', 6);
      expect(customers.candidates).toHaveBeenCalledWith('Leena', 50);
      expect(found.payload).toEqual({
        needs_choice: true,
        did_you_mean: true,
        field: 'customer',
        query: 'Leena',
        options: [{ id: 'C-1', label: 'Lina Haddad' }],
      });
      expect(found.choices).toEqual([{ id: 'C-1', label: 'Lina Haddad', suggested: true }]);
      expect(found.proposals).toBeUndefined();
    });

    it('labels suggestions with the id only when their names collide', async () => {
      const { run, customers } = setup();
      noExact(customers);
      customers.candidates.mockResolvedValue([
        { id: 'C-1', name: 'Lina Haddad', phone: null, city: null },
        { id: 'C-2', name: 'Lina Haddad', phone: null, city: null },
        { id: 'C-3', name: 'Lena Haddad', phone: null, city: null },
      ]);
      const found = await run('open_record', { kind: 'customer', name: 'Leena Haddad' });
      expect(found.payload['options']).toEqual([
        { id: 'C-3', label: 'Lena Haddad' },
        { id: 'C-1', label: 'Lina Haddad (C-1)' },
        { id: 'C-2', label: 'Lina Haddad (C-2)' },
      ]);
    });

    it('offers an Arabic spelling variant and keeps at most five suggestions', async () => {
      const { run, customers } = setup();
      noExact(customers);
      customers.candidates.mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => ({
          id: `C-${i}`,
          name: i === 0 ? 'مدرسة النور' : `مدرسة النور ${i}`,
          phone: null,
          city: null,
        })),
      );
      const found = await run('propose_collect_payment', { customer: 'مدرسه النور' });
      expect(found.payload).toMatchObject({ did_you_mean: true });
      expect((found.payload['options'] as unknown[]).length).toBe(5);
      expect((found.payload['options'] as { id: string }[])[0].id).toBe('C-0');
    });

    it('does not run the broader search when the limited one finds a record', async () => {
      const { run, customers } = setup();
      noExact(customers);
      customers.find.mockResolvedValue([LINA]);
      await run('propose_collect_payment', { customer: 'lina' });
      expect(customers.candidates).not.toHaveBeenCalled();
    });

    it('suggests suppliers and warehouses from the lists it already has', async () => {
      const { run, warehouses } = setup();
      const supplier = await run('propose_purchase_order', {
        supplier: 'Grean Clay',
        items: [{ item: 'POT-30', qty: 1 }],
      });
      expect(supplier.payload).toMatchObject({
        did_you_mean: true,
        field: 'supplier',
        options: [{ id: 'SUP-1', label: 'Green Clay' }],
      });
      const warehouse = await run('propose_quick_sale', sale({ warehouse: 'Garden shp' }));
      expect(warehouse.payload).toMatchObject({
        did_you_mean: true,
        field: 'warehouse',
        options: [{ id: 'Garden - RN', label: 'Garden shop' }],
      });
      expect(warehouses.list).toHaveBeenCalled();
    });

    it('suggests items with a capped, enabled-only candidate search ranked by name', async () => {
      const { run, listCalls } = setup({
        Item: (query) =>
          query.limit === 50
            ? [
                item('FIG-1', 'Fig tree'),
                item('RAW-9', 'Raw clay', { is_sales_item: 1 }),
                item('FIG-2', 'Fig trees'),
              ]
            : [],
      });
      const found = await run('propose_quick_sale', sale({ items: [{ item: 'Fig tre', qty: 1 }] }));
      expect(found.payload).toMatchObject({ did_you_mean: true, field: 'item' });
      const search = listCalls.filter((c) => c.doctype === 'Item').at(-1)!.query;
      expect(search.limit).toBe(50);
      expect(search.filters).toEqual(
        expect.arrayContaining([
          ['disabled', '=', 0],
          ['is_sales_item', '=', 1],
        ]),
      );
    });

    it('says can_create for a customer, a supplier and an item only where the role may add one', async () => {
      const lookups = async (persona: Persona) => {
        const { run, customers, suppliers } = setup({ Item: () => [] });
        noExact(customers);
        suppliers.list.mockResolvedValue([]);
        const scope = SCOPE(persona);
        const flag = async (name: ToolName, input: ToolInput) => {
          try {
            await run(name, input, scope);
          } catch (error) {
            return (error as { payload?: Record<string, unknown> }).payload?.['can_create'];
          }
          return 'resolved';
        };
        return {
          customer: await flag('open_record', { kind: 'customer', name: 'Zed Quartz' }),
          supplier: await flag('open_record', { kind: 'supplier', name: 'Zed Quartz' }),
          item: await flag('open_record', { kind: 'item', name: 'Zed Quartz' }),
        };
      };
      expect(await lookups('owner')).toEqual({ customer: true, supplier: true, item: true });
      expect(await lookups('salesperson')).toMatchObject({ customer: true, item: false });
      expect(await lookups('storeAssociate')).toMatchObject({ customer: true, item: false });
      expect(await lookups('projectManager')).toMatchObject({ customer: true, item: false });
      expect(await lookups('purchasing')).toMatchObject({ supplier: true, item: true });
    });

    it('has no can_create for a warehouse, and never offers a disabled record as a suggestion', async () => {
      const { run, customers, listCalls } = setup();
      const failure = run('propose_quick_sale', sale({ warehouse: 'Mars' }));
      await expect(failure).rejects.toThrow('not found: warehouse "Mars"');
      await expect(failure).rejects.not.toHaveProperty('payload');
      noExact(customers);
      await run('propose_collect_payment', { customer: 'zzzz' }).catch(() => undefined);
      expect(customers.candidates).toHaveBeenCalled();
      customers.exact.mockResolvedValue([{ ...LINA, disabled: false }]);
      await run('propose_quick_sale', sale({ items: [{ item: 'Retired pt', qty: 1 }] })).catch(
        () => undefined,
      );
      const search = listCalls.filter((c) => c.doctype === 'Item').at(-1)!.query;
      expect(search.filters).toContainEqual(['disabled', '=', 0]);
    });

    describe('propose_new_customer', () => {
      it('prepares the card and a prefill request with what the user gave', async () => {
        const { run, customers } = setup();
        noExact(customers);
        const found = await run('propose_new_customer', {
          name: ' Samer Odeh ',
          phone: '0599 123 456',
          email: 'samer@example.com',
          address: 'Nablus',
        });
        expect(found.proposals![0]).toMatchObject({
          kind: 'new_customer',
          party: 'Samer Odeh',
          request: {
            kind: 'new_customer',
            payload: {
              name: 'Samer Odeh',
              phone: '0599 123 456',
              email: 'samer@example.com',
              address: 'Nablus',
            },
          },
        });
        expect(found.payload['summary']).toContain('New customer: Samer Odeh');
      });

      it('leaves out what was not given', async () => {
        const { run, customers } = setup();
        noExact(customers);
        const found = await run('propose_new_customer', { name: 'Samer Odeh' });
        expect(found.proposals![0].request).toEqual({
          kind: 'new_customer',
          payload: { name: 'Samer Odeh' },
        });
      });

      it('refuses roles that may not add customers and bad emails', async () => {
        const { run, customers } = setup();
        noExact(customers);
        await expect(
          run('propose_new_customer', { name: 'Samer' }, SCOPE('warehouse')),
        ).rejects.toThrow('not allowed for your role');
        await expect(
          run('propose_new_customer', { name: 'Samer' }, SCOPE('purchasing')),
        ).rejects.toThrow('not allowed for your role');
        await expect(run('propose_new_customer', { name: 'Samer', email: 'nope' })).rejects.toThrow(
          "the email address isn't valid",
        );
        for (const persona of ['salesperson', 'storeAssociate', 'projectManager'] as Persona[]) {
          const found = await run('propose_new_customer', { name: 'Samer' }, SCOPE(persona));
          expect(found.proposals, persona).toHaveLength(1);
        }
      });

      it('asks instead when a customer with that exact name exists', async () => {
        const { run, customers } = setup();
        customers.exact.mockResolvedValue([{ ...SAMER, disabled: false }]);
        const found = await run('propose_new_customer', { name: 'samer odeh' });
        expect(found.proposals).toBeUndefined();
        expect(found.payload).toEqual({
          needs_choice: true,
          already_exists: true,
          field: 'customer',
          query: 'samer odeh',
          options: [{ id: 'C-9', label: 'Samer Odeh' }],
        });
        expect(found.choices).toEqual([{ id: 'C-9', label: 'Samer Odeh' }]);
      });

      it('treats Arabic letter variants and spacing as the same name', async () => {
        const { run, customers } = setup();
        noExact(customers);
        customers.candidates.mockResolvedValue([
          { id: 'C-5', name: 'مدرسة النور', phone: null, city: null },
        ]);
        const found = await run('propose_new_customer', { name: 'مدرسه  النور' });
        expect(found.payload).toMatchObject({ needs_choice: true, already_exists: true });
        expect(found.proposals).toBeUndefined();
      });

      it('says a disabled customer with that name is disabled, and refuses the walk-in name', async () => {
        const { run, customers } = setup();
        customers.exact.mockResolvedValue([{ ...SAMER, disabled: true }]);
        await expect(run('propose_new_customer', { name: 'Samer Odeh' })).rejects.toThrow(
          'customer is disabled: Samer Odeh',
        );
        await expect(run('propose_new_customer', { name: 'Walk-in Customer' })).rejects.toThrow(
          'Walk-in Customer already exists',
        );
      });
    });

    describe('propose_new_supplier', () => {
      it('prepares the card for a role that may add suppliers', async () => {
        const { run } = setup();
        const found = await run(
          'propose_new_supplier',
          { name: 'Clay Works', phone: '02 555 1234' },
          SCOPE('purchasing'),
        );
        expect(found.proposals![0]).toMatchObject({
          kind: 'new_supplier',
          party: 'Clay Works',
          request: { kind: 'new_supplier', payload: { name: 'Clay Works', phone: '02 555 1234' } },
        });
      });

      it('refuses roles that may not add suppliers', async () => {
        const { run } = setup();
        for (const persona of ['salesperson', 'storeAssociate', 'projectManager'] as Persona[]) {
          await expect(
            run('propose_new_supplier', { name: 'Clay Works' }, SCOPE(persona)),
          ).rejects.toThrow('not allowed for your role');
        }
      });

      it('asks instead for an existing supplier, however it is spelt', async () => {
        const { run } = setup();
        const found = await run('propose_new_supplier', { name: 'green  CLAY' });
        expect(found.payload).toMatchObject({
          needs_choice: true,
          already_exists: true,
          options: [{ id: 'SUP-1', label: 'Green Clay' }],
        });
      });
    });

    describe('propose_new_item', () => {
      it('prepares the card; the owner’s selling price goes with it', async () => {
        const { run } = setup({ Item: () => [] });
        const found = await run('propose_new_item', {
          name: 'Fig tree',
          kind: 'product',
          selling_price: 45,
        });
        expect(found.proposals![0]).toMatchObject({
          kind: 'new_item',
          party: 'Fig tree',
          request: {
            kind: 'new_item',
            payload: { name: 'Fig tree', kind: 'product', price: 45 },
          },
        });
        expect(found.payload['notes']).toBeUndefined();
      });

      it('drops the selling price for a role that may not set prices, and says so', async () => {
        const { run } = setup({ Item: () => [] });
        const found = await run(
          'propose_new_item',
          { name: 'Fig tree', kind: 'service', selling_price: 45 },
          SCOPE('purchasing'),
        );
        expect(found.proposals![0].request).toEqual({
          kind: 'new_item',
          payload: { name: 'Fig tree', kind: 'service' },
        });
        expect(found.payload['notes']).toEqual([
          "The selling price was ignored; your role can't set prices.",
        ]);
      });

      it('refuses roles that may not add items', async () => {
        const { run } = setup({ Item: () => [] });
        for (const persona of [
          'salesperson',
          'storeAssociate',
          'warehouse',
          'projectManager',
        ] as Persona[]) {
          await expect(
            run('propose_new_item', { name: 'Fig tree', kind: 'product' }, SCOPE(persona)),
          ).rejects.toThrow('not allowed for your role');
        }
      });

      it('asks instead when an item has that name, and reports a disabled one', async () => {
        const { run } = setup();
        const found = await run('propose_new_item', { name: 'raw CLAY', kind: 'product' });
        expect(found.payload).toMatchObject({
          needs_choice: true,
          already_exists: true,
          options: [{ id: 'RAW-1', label: 'Raw clay' }],
        });
        await expect(
          run('propose_new_item', { name: 'Retired pot', kind: 'product' }),
        ).rejects.toThrow('item is disabled: Retired pot');
      });
    });
  });

  it('refuses a name that is not a proposal tool', async () => {
    const { run } = setup();
    await expect(run('get_invoice', { name: 'SI-1' })).rejects.toThrow('not allowed for your role');
  });
});
