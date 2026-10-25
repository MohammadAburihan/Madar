import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { vi } from 'vitest';
import { fakeErpnext, Lister } from '../../../../testing/fake-erpnext';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { CustomerDirectoryService } from '../../../core/customers/customer-directory.service';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { ListQuery } from '../../../core/erpnext/erpnext-client';
import { WarehouseDirectoryService } from '../../../core/stock/warehouse-directory.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { AssistantToolsService } from './assistant-tools.service';

const refused = () => throwError(() => new ErpnextError('forbidden', 'No permission', 403));
const broken = () => throwError(() => new ErpnextError('server', 'Boom', 500));

interface Options {
  persona?: Persona;
  lists?: Record<string, Lister>;
  posts?: Record<string, (body: Record<string, unknown>) => unknown>;
  counts?: Record<string, number>;
}

function setup({ persona = 'owner', lists = {}, posts = {}, counts = {} }: Options = {}) {
  TestBed.resetTestingModule();
  const erpnext = fakeErpnext(lists, posts, {}, counts);
  const directory = { find: vi.fn().mockResolvedValue([]) };
  const warehouses = {
    list: vi.fn().mockResolvedValue([{ id: 'Main - RN', name: 'Main warehouse' }]),
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SessionService,
        useValue: {
          user: () => ({ id: 'lina@rehan.example' }),
          persona: () => persona,
          capabilities: () => capabilitiesFor(persona),
        },
      },
      {
        provide: BusinessService,
        useValue: { ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS' }) },
      },
      {
        provide: SiteClockService,
        useValue: { ensure: () => Promise.resolve(), now: () => new Date(2026, 9, 25, 10) },
      },
      { provide: CustomerDirectoryService, useValue: directory },
      { provide: WarehouseDirectoryService, useValue: warehouses },
    ],
  });
  const tools = TestBed.inject(AssistantToolsService);
  const run = async (name: string, input: unknown = {}) => {
    const outcome = await tools.run(name, input);
    return { ...outcome, json: outcome.isError ? null : JSON.parse(outcome.content) };
  };
  return { ...erpnext, directory, warehouses, tools, run };
}

const filtersOf = (query: ListQuery) => JSON.stringify(query.filters);

describe('AssistantToolsService', () => {
  describe('every call', () => {
    it('prepares the role-allowed tool names and the context to send', async () => {
      const { tools } = setup({ persona: 'salesperson' });
      const { tools: names, context } = await tools.prepare();
      expect(names).not.toContain('find_purchase_orders');
      expect(context).toEqual({
        business: 'Rehan Nursery',
        currency: 'ILS',
        today: '2026-10-25',
        persona: 'salesperson',
      });
    });

    it('refuses a tool the role is not offered without asking ERPNext', async () => {
      const { run, listCalls, countCalls } = setup({ persona: 'salesperson' });
      const outcome = await run('find_purchase_orders');
      expect(outcome).toMatchObject({ isError: true, content: 'not allowed for your role' });
      expect((await run('delete_everything')).content).toBe('not allowed for your role');
      expect(listCalls).toEqual([]);
      expect(countCalls).toEqual([]);
    });

    it('refuses invalid input with the reason, without asking ERPNext', async () => {
      const { run, listCalls } = setup();
      const outcome = await run('search_items', { query: 'a', limit: 99 });
      expect(outcome).toMatchObject({ isError: true });
      expect(outcome.content).toContain('limit');
      expect(listCalls).toEqual([]);
    });

    it('says "not allowed for your role" when ERPNext refuses the read, and flags it', async () => {
      const { run } = setup({ lists: { 'Sales Invoice': refused } });
      expect(await run('find_invoices')).toMatchObject({
        isError: true,
        forbidden: true,
        content: 'not allowed for your role',
      });
    });

    it('says "lookup failed" for any other failure', async () => {
      const { run } = setup({ lists: { 'Sales Invoice': broken } });
      expect(await run('find_invoices')).toMatchObject({
        isError: true,
        forbidden: false,
        content: 'lookup failed',
      });
    });
  });

  describe('get_today_summary', () => {
    const lists = (): Record<string, Lister> => ({
      'Sales Invoice': (query) =>
        query.groupBy
          ? [
              {
                party_account_currency: 'ILS',
                conversion_rate: 1,
                'SUM(`outstanding_amount`)': 100,
              },
              {
                party_account_currency: 'USD',
                conversion_rate: 3.5,
                'SUM(`outstanding_amount`)': 10,
              },
            ]
          : [{ 'SUM(`base_grand_total`)': 1250.456, 'COUNT(`name`)': 4 }],
    });

    it('sums confirmed sales for the site date and converts what is due to company currency', async () => {
      const { run, listCalls } = setup({ lists: lists() });
      const { json } = await run('get_today_summary');
      expect(json).toEqual({
        date: '2026-10-25',
        currency: 'ILS',
        scope: 'all sales',
        sales_total: 1250.46,
        sales_count: 4,
        amount_due: 135,
      });
      const [sales, due] = listCalls.map((c) => c.query);
      expect(sales.filters).toEqual([
        ['company', '=', 'Rehan Nursery'],
        ['docstatus', '=', 1],
        ['is_return', '=', 0],
        ['posting_date', '=', '2026-10-25'],
      ]);
      expect(due.filters).toEqual([
        ['company', '=', 'Rehan Nursery'],
        ['docstatus', '=', 1],
        ['outstanding_amount', '>', 0],
      ]);
    });

    it('limits a salesperson to their own sales, in both figures', async () => {
      const { run, listCalls } = setup({ persona: 'salesperson', lists: lists() });
      expect((await run('get_today_summary')).json.scope).toBe('your own sales');
      for (const { query } of listCalls) {
        expect(query.filters).toContainEqual(['owner', '=', 'lina@rehan.example']);
      }
    });

    it('reports zeros on a day without sales', async () => {
      const { run } = setup({ lists: { 'Sales Invoice': () => [] } });
      expect((await run('get_today_summary')).json).toMatchObject({
        sales_total: 0,
        sales_count: 0,
        amount_due: 0,
      });
    });
  });

  describe('search_customers', () => {
    const lina = { id: 'Lina Haddad', name: 'Lina Haddad', phone: '0599', city: null };
    const balances = (over: Record<string, Lister> = {}): Record<string, Lister> => ({
      'Sales Invoice': () => [
        {
          customer: 'Lina Haddad',
          party_account_currency: 'ILS',
          conversion_rate: 1,
          'SUM(`outstanding_amount`)': 100.1,
        },
        {
          customer: 'Lina Haddad',
          party_account_currency: 'USD',
          conversion_rate: 3.5,
          'SUM(`outstanding_amount`)': 50,
        },
      ],
      ...over,
    });

    it('finds customers and offers each to open, with the balance in company currency', async () => {
      const { run, directory, listCalls } = setup({ lists: balances() });
      directory.find.mockResolvedValue([lina]);
      const outcome = await run('search_customers', { query: 'lina', limit: 3 });
      expect(directory.find).toHaveBeenCalledWith('lina', 3);
      expect(outcome.json).toEqual({
        currency: 'ILS',
        customers: [{ id: 'Lina Haddad', name: 'Lina Haddad', phone: '0599', outstanding: 275.1 }],
      });
      expect(outcome.records).toEqual([
        {
          kind: 'customer',
          id: 'Lina Haddad',
          label: 'Lina Haddad',
          mentions: ['Lina Haddad', 'Lina Haddad'],
        },
      ]);
      const query = listCalls.find((c) => c.doctype === 'Sales Invoice')!.query;
      expect(filtersOf(query)).toContain('["company","=","Rehan Nursery"]');
      expect(filtersOf(query)).not.toContain('"owner"');
    });

    it.each<Persona>(['salesperson', 'storeAssociate'])(
      "counts only a %s's own invoices",
      async (persona) => {
        const { run, directory, listCalls } = setup({ persona, lists: balances() });
        directory.find.mockResolvedValue([lina]);
        await run('search_customers', { query: 'lina' });
        expect(listCalls.find((c) => c.doctype === 'Sales Invoice')!.query.filters).toContainEqual([
          'owner',
          '=',
          'lina@rehan.example',
        ]);
      },
    );

    it('shows no balance, with a note, when the role cannot read invoices', async () => {
      const { run, directory } = setup({ lists: balances({ 'Sales Invoice': refused }) });
      directory.find.mockResolvedValue([lina]);
      const { json } = await run('search_customers', { query: 'lina' });
      expect(json.customers[0].outstanding).toBeNull();
      expect(json.balance_note).toBe('not available for your role');
    });

    it('fails the lookup, never answers 0, when the balance read breaks', async () => {
      const { run, directory } = setup({ lists: balances({ 'Sales Invoice': broken }) });
      directory.find.mockResolvedValue([lina]);
      expect(await run('search_customers', { query: 'lina' })).toMatchObject({
        isError: true,
        content: 'lookup failed',
      });
    });

    it('defaults to five customers', async () => {
      const { run, directory } = setup();
      await run('search_customers', { query: '' });
      expect(directory.find).toHaveBeenCalledWith('', 5);
    });

    it('is not offered to a warehouse worker', async () => {
      const { run, directory } = setup({ persona: 'warehouse' });
      expect((await run('search_customers', { query: 'a' })).isError).toBe(true);
      expect(directory.find).not.toHaveBeenCalled();
    });
  });

  describe('search_items', () => {
    const item = {
      name: 'POT-30',
      item_name: 'Ceramic planter',
      stock_uom: 'Nos',
      is_stock_item: 1,
      valuation_rate: 40,
    };
    const service = {
      name: 'DESIGN',
      item_name: 'Garden design',
      stock_uom: 'Nos',
      is_stock_item: 0,
    };
    const lists = (over: Record<string, Lister> = {}): Record<string, Lister> => ({
      Item: () => [item, service],
      Bin: () => [
        { item_code: 'POT-30', warehouse: 'Main - RN', actual_qty: 12 },
        { item_code: 'POT-30', warehouse: 'Other - RN', actual_qty: 5 },
        { item_code: 'POT-30', warehouse: 'Main - RN', actual_qty: 0 },
      ],
      ...over,
    });
    const posts = {
      'erpnext.stock.get_item_details.apply_price_list': () => ({
        children: [
          { name: 'POT-30', price_list_rate: 79.999 },
          { name: 'DESIGN', price_list_rate: 0 },
        ],
      }),
    };
    const priceLists = { 'Price List': () => [{ name: 'Standard Selling' }] };

    it("returns stock per company warehouse, today's standard price, and the cost for roles that see costs", async () => {
      const { run, listCalls } = setup({ lists: lists(priceLists), posts });
      const { json, records } = await run('search_items', { query: 'pot', limit: 2 });
      expect(json.items).toEqual([
        {
          code: 'POT-30',
          name: 'Ceramic planter',
          unit: 'Nos',
          stock: [{ warehouse: 'Main warehouse', qty: 12 }],
          selling_price: 80,
          buying_cost: 40,
        },
        {
          code: 'DESIGN',
          name: 'Garden design',
          unit: 'Nos',
          service: true,
          selling_price: null,
          price_note: 'no price set',
        },
      ]);
      expect(records.map((r) => r.id)).toEqual(['POT-30', 'DESIGN']);
      const items = listCalls.find((c) => c.doctype === 'Item')!.query;
      expect(items.limit).toBe(2);
      expect(items.fields).toContain('valuation_rate');
    });

    it('never asks for or shows buying cost to a role that does not see costs', async () => {
      const { run, listCalls } = setup({
        persona: 'storeAssociate',
        lists: lists({ ...priceLists, Item: () => [{ ...item }] }),
        posts,
      });
      const { json } = await run('search_items', { query: 'pot' });
      expect(JSON.stringify(json)).not.toContain('buying_cost');
      expect(listCalls.find((c) => c.doctype === 'Item')!.query.fields).not.toContain(
        'valuation_rate',
      );
    });

    it('reads prices through the quick sale pricing call with the item context', async () => {
      const { run, postCalls } = setup({ lists: lists(priceLists), posts });
      await run('search_items', { query: 'pot' });
      const ctx = postCalls[0].body['ctx'] as Record<string, unknown>;
      expect(ctx).toMatchObject({
        company: 'Rehan Nursery',
        price_list: 'Standard Selling',
        transaction_date: '2026-10-25',
      });
      expect((ctx['items'] as unknown[])[0]).toMatchObject({
        parenttype: 'Sales Invoice',
        uom: 'Nos',
        stock_uom: 'Nos',
        conversion_factor: 1,
      });
    });

    it('says the price is not available, rather than none set, when the role is refused', async () => {
      const { run } = setup({
        persona: 'salesperson',
        lists: lists(priceLists),
        posts: { 'erpnext.stock.get_item_details.apply_price_list': refused },
      });
      const { json } = await run('search_items', { query: 'pot' });
      expect(json.items[0].selling_price).toBeNull();
      expect(json.items[0].price_note).toBe('not available for your role');
      expect(json.items[0].stock).toEqual([{ warehouse: 'Main warehouse', qty: 12 }]);
    });

    it('shows no stock when the role cannot read it, but still answers', async () => {
      const { run } = setup({ lists: lists({ ...priceLists, Bin: refused }), posts });
      const { json } = await run('search_items', { query: 'pot' });
      expect(json.items[0].stock).toBeNull();
      expect(json.items[0].selling_price).toBe(80);
    });

    it('does not hide a failed read as an empty answer', async () => {
      const { run } = setup({ lists: lists({ ...priceLists, Bin: broken }), posts });
      expect(await run('search_items', { query: 'pot' })).toMatchObject({
        content: 'lookup failed',
      });
    });

    it('matches codes typed in Arabic digits and names as typed', async () => {
      const { run, listCalls } = setup({ lists: lists(priceLists), posts });
      await run('search_items', { query: 'نبتة ٣٠' });
      expect(listCalls[0].query.orFilters).toEqual([
        ['item_code', 'like', '%نبتة 30%'],
        ['item_name', 'like', '%نبتة ٣٠%'],
      ]);
    });
  });

  describe('find_invoices', () => {
    const row = {
      name: 'SI-1042',
      customer_name: 'Lina Haddad',
      posting_date: '2026-10-20',
      grand_total: 320,
      outstanding_amount: 120.5,
      currency: 'ILS',
      docstatus: 1,
    };
    const lists = { 'Sales Invoice': () => [row, { ...row, name: 'SI-1043', docstatus: 0 }] };

    it('lists invoices and drafts with a count query for the total, flagging drafts', async () => {
      const { run, listCalls, countCalls } = setup({ lists, counts: { 'Sales Invoice': 25 } });
      const { json, records } = await run('find_invoices', { customer: 'Lina', limit: 2 });
      expect(json).toEqual({
        total: 25,
        truncated: true,
        invoices: [
          {
            name: 'SI-1042',
            customer: 'Lina Haddad',
            date: '2026-10-20',
            total: 320,
            currency: 'ILS',
            amount_due: 120.5,
          },
          {
            name: 'SI-1043',
            customer: 'Lina Haddad',
            date: '2026-10-20',
            total: 320,
            currency: 'ILS',
            draft: true,
          },
        ],
      });
      expect(records).toEqual([
        { kind: 'invoice', id: 'SI-1042', label: 'SI-1042', mentions: ['SI-1042'] },
        { kind: 'draft', id: 'SI-1043', label: 'SI-1043', mentions: ['SI-1043'] },
      ]);
      const { query } = listCalls[0];
      expect(query.limit).toBe(2);
      expect(query.filters).toEqual([
        ['company', '=', 'Rehan Nursery'],
        ['is_return', '=', 0],
        ['docstatus', '<', 2],
        ['customer_name', 'like', '%Lina%'],
      ]);
      expect(countCalls[0].filters).toEqual(query.filters);
    });

    it('does not say truncated when everything was returned', async () => {
      const { run } = setup({ lists, counts: { 'Sales Invoice': 2 } });
      expect((await run('find_invoices')).json.truncated).toBeUndefined();
    });

    it('asks only for confirmed invoices with an amount due, in the date range', async () => {
      const { run, listCalls } = setup({ lists });
      await run('find_invoices', { unpaid_only: true, from: '2026-10-01', to: '2026-10-31' });
      expect(listCalls[0].query.filters).toEqual([
        ['company', '=', 'Rehan Nursery'],
        ['is_return', '=', 0],
        ['docstatus', '=', 1],
        ['outstanding_amount', '>', 0],
        ['posting_date', '>=', '2026-10-01'],
        ['posting_date', '<=', '2026-10-31'],
      ]);
    });

    it('limits salespeople and store associates to their own invoices, in the list and the count', async () => {
      for (const persona of ['salesperson', 'storeAssociate'] as const) {
        const { run, listCalls, countCalls } = setup({ persona, lists });
        await run('find_invoices');
        expect(listCalls[0].query.filters).toContainEqual(['owner', '=', 'lina@rehan.example']);
        expect(countCalls[0].filters).toContainEqual(['owner', '=', 'lina@rehan.example']);
      }
    });

    it('does not limit the owner to their own', async () => {
      const { run, listCalls } = setup({ lists });
      await run('find_invoices');
      expect(filtersOf(listCalls[0].query)).not.toContain('owner');
    });

    it('is not offered to the purchasing officer', async () => {
      const { run, listCalls } = setup({ persona: 'purchasing', lists });
      expect((await run('find_invoices')).isError).toBe(true);
      expect(listCalls).toEqual([]);
    });

    it('keeps a long result within 4 KB and says it was truncated', async () => {
      const many = Array.from({ length: 20 }, (_, i) => ({
        ...row,
        name: `SI-${2000 + i}`,
        customer_name: 'A very long customer name '.repeat(5),
      }));
      const { run } = setup({
        lists: { 'Sales Invoice': () => many },
        counts: { 'Sales Invoice': 20 },
      });
      const outcome = await run('find_invoices', { limit: 20 });
      expect(new TextEncoder().encode(outcome.content).length).toBeLessThanOrEqual(4096);
      expect(outcome.json.truncated).toBe(true);
      expect(outcome.json.invoices.length).toBeLessThan(20);
    });
  });

  describe('get_invoice', () => {
    const line = (idx: number, code: string) => ({
      name: 'SI-1042',
      customer_name: 'Lina Haddad',
      posting_date: '2026-10-20',
      due_date: '2026-11-19',
      docstatus: 1,
      currency: 'ILS',
      grand_total: 320,
      outstanding_amount: 120,
      item_code: code,
      item_name: `Item ${code}`,
      qty: idx,
      rate: 40,
      amount: 40 * idx,
    });

    it('looks the invoice up by exact name in the company and returns its lines and payment status', async () => {
      const { run, listCalls } = setup({
        lists: { 'Sales Invoice': () => [line(1, 'A'), line(2, 'B')] },
      });
      const { json, records } = await run('get_invoice', { name: ' SI-1042 ' });
      expect(json).toMatchObject({
        name: 'SI-1042',
        customer: 'Lina Haddad',
        total: 320,
        status: 'partly paid',
        paid: 200,
        amount_due: 120,
      });
      expect(json.lines.map((l: { code: string }) => l.code)).toEqual(['A', 'B']);
      expect(records).toEqual([
        { kind: 'invoice', id: 'SI-1042', label: 'SI-1042', mentions: ['SI-1042'] },
      ]);
      expect(listCalls[0].query.orderBy).toBe('items.idx asc');
      expect(listCalls[0].query.filters).toEqual([
        ['name', '=', 'SI-1042'],
        ['company', '=', 'Rehan Nursery'],
        ['docstatus', '<', 2],
      ]);
    });

    it('states paid, unpaid and draft', async () => {
      const status = async (over: object) => {
        const { run } = setup({ lists: { 'Sales Invoice': () => [{ ...line(1, 'A'), ...over }] } });
        return (await run('get_invoice', { name: 'SI-1042' })).json;
      };
      expect(await status({ outstanding_amount: 0 })).toMatchObject({ status: 'paid', paid: 320 });
      expect(await status({ outstanding_amount: 320 })).toMatchObject({ status: 'unpaid' });
      const draft = await status({ docstatus: 0 });
      expect(draft).toMatchObject({ status: 'draft' });
      expect(draft.amount_due).toBeUndefined();
    });

    it('reports a name that is not there as not found, not as an error', async () => {
      const { run } = setup({ lists: { 'Sales Invoice': () => [] } });
      expect(await run('get_invoice', { name: 'SI-9' })).toMatchObject({
        isError: false,
        json: { found: false, name: 'SI-9' },
        records: [],
      });
    });

    it('keeps a salesperson to their own invoices', async () => {
      const { run, listCalls } = setup({
        persona: 'salesperson',
        lists: { 'Sales Invoice': () => [] },
      });
      await run('get_invoice', { name: 'SI-1' });
      expect(listCalls[0].query.filters).toContainEqual(['owner', '=', 'lina@rehan.example']);
    });

    it('shows at most 20 lines and says so', async () => {
      const rows = Array.from({ length: 30 }, (_, i) => line(i + 1, `C${i}`));
      const { run } = setup({ lists: { 'Sales Invoice': () => rows } });
      const { json } = await run('get_invoice', { name: 'SI-1042' });
      expect(json.lines.length).toBe(20);
      expect(json.line_count).toBe(30);
      expect(json.truncated).toBe(true);
    });
  });

  describe('list_drafts', () => {
    const draft = (name: string, modified: string, extra = {}) => ({
      name,
      modified,
      customer_name: 'Lina Haddad',
      grand_total: 100,
      currency: 'ILS',
      ...extra,
    });
    const lists: Record<string, Lister> = {
      'Sales Invoice': () => [draft('SI-D1', '2026-10-24 09:00:00.1')],
      'Sales Order': () => [draft('SO-D1', '2026-10-25 08:30:00.1')],
      Quotation: () => [],
      'Purchase Order': () => [
        {
          name: 'PO-D1',
          modified: '2026-10-23 12:00:00.1',
          supplier_name: 'Green Clay',
          grand_total: 900,
          currency: 'ILS',
        },
      ],
    };

    it('lists every kind the owner can continue, newest first, with their count', async () => {
      const { run } = setup({
        lists,
        counts: { 'Sales Invoice': 1, 'Sales Order': 1, 'Purchase Order': 1 },
      });
      const { json, records } = await run('list_drafts');
      expect(json.total).toBe(3);
      expect(json.drafts.map((d: { name: string }) => d.name)).toEqual(['SO-D1', 'SI-D1', 'PO-D1']);
      expect(json.drafts[0]).toEqual({
        kind: 'order',
        name: 'SO-D1',
        party: 'Lina Haddad',
        total: 100,
        currency: 'ILS',
        updated: '2026-10-25 08:30',
      });
      expect(records.map((r) => r.kind)).toEqual(['draft', 'draft', 'draft']);
    });

    it('limits a salesperson to their own sales drafts and no purchases', async () => {
      const { run, listCalls } = setup({ persona: 'salesperson', lists });
      await run('list_drafts');
      expect(listCalls.map((c) => c.doctype).sort()).toEqual([
        'Quotation',
        'Sales Invoice',
        'Sales Order',
      ]);
      for (const { query } of listCalls) {
        expect(query.filters).toContainEqual(['owner', '=', 'lina@rehan.example']);
        expect(query.filters).toContainEqual(['company', '=', 'Rehan Nursery']);
        expect(query.filters).toContainEqual(['docstatus', '=', 0]);
      }
    });

    it('shows a purchasing officer purchase drafts with their values', async () => {
      const { run, listCalls } = setup({ persona: 'purchasing', lists });
      const { json } = await run('list_drafts');
      expect(listCalls.map((c) => c.doctype)).toEqual(['Purchase Order']);
      expect(json.drafts).toEqual([
        expect.objectContaining({ kind: 'purchase', party: 'Green Clay', total: 900 }),
      ]);
    });

    it('leaves out a kind the role cannot read, and refuses when none can be read', async () => {
      const partial = setup({ lists: { ...lists, Quotation: refused } });
      expect((await partial.run('list_drafts')).isError).toBe(false);
      const none = setup({
        lists: {
          'Sales Invoice': refused,
          'Sales Order': refused,
          Quotation: refused,
          'Purchase Order': refused,
        },
      });
      expect(await none.run('list_drafts')).toMatchObject({ isError: true, forbidden: true });
    });
  });

  describe('find_purchase_orders', () => {
    const order = {
      name: 'PO-2048',
      supplier_name: 'Green Clay',
      transaction_date: '2026-10-18',
      schedule_date: '2026-10-28',
      status: 'To Receive and Bill',
      per_received: 40.4,
      grand_total: 900,
      currency: 'ILS',
    };

    it('lists open orders for a role that sees costs, with values', async () => {
      const { run, listCalls, countCalls } = setup({
        persona: 'purchasing',
        lists: { 'Purchase Order': () => [order] },
        counts: { 'Purchase Order': 1 },
      });
      const { json, records } = await run('find_purchase_orders', {
        supplier: 'Green',
        open_only: true,
      });
      expect(json).toEqual({
        total: 1,
        orders: [
          {
            name: 'PO-2048',
            supplier: 'Green Clay',
            date: '2026-10-18',
            expected: '2026-10-28',
            status: 'To Receive and Bill',
            received_percent: 40,
            total: 900,
            currency: 'ILS',
          },
        ],
      });
      expect(records).toEqual([
        { kind: 'purchaseOrder', id: 'PO-2048', label: 'PO-2048', mentions: ['PO-2048'] },
      ]);
      const filters = [
        ['company', '=', 'Rehan Nursery'],
        ['docstatus', '=', 1],
        ['per_received', '<', 100],
        ['status', 'not in', ['Closed', 'On Hold', 'Completed']],
        ['supplier_name', 'like', '%Green%'],
      ];
      expect(listCalls[0].query.filters).toEqual(filters);
      expect(countCalls[0].filters).toEqual(filters);
    });

    it('hides order values from a role that receives goods but does not see costs', async () => {
      const { run, listCalls } = setup({
        persona: 'warehouse',
        lists: {
          'Purchase Order': () => [{ ...order, grand_total: undefined, currency: undefined }],
        },
      });
      const outcome = await run('find_purchase_orders');
      expect(outcome.content).not.toContain('total":9');
      expect(JSON.stringify(outcome.json.orders[0])).not.toMatch(/"total"|"currency"/);
      expect(listCalls[0].query.fields).not.toContain('grand_total');
    });

    it('is not offered to a salesperson', async () => {
      const { run } = setup({ persona: 'salesperson' });
      expect((await run('find_purchase_orders')).content).toBe('not allowed for your role');
    });
  });
});
