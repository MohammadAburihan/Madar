import { capabilitiesFor } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { toolRegistry } from '../../../../../assistant/src/tools';
import {
  RECORD_KINDS,
  RESULT_LIMIT_BYTES,
  TOOL_NAMES,
  TOOL_SCHEMAS,
  ToolName,
  toToolContent,
  openableKinds,
  toolsFor,
  validateInput,
} from './assistant-tools';

const namesFor = (persona: Persona) => toolsFor(capabilitiesFor(persona));
const bytes = (text: string) => new TextEncoder().encode(text).length;

describe('tools offered by role', () => {
  it('offers the owner every tool', () => {
    expect(namesFor('owner')).toEqual([...TOOL_NAMES]);
  });

  it('keeps purchase orders from salespeople, who sell but do not buy or receive', () => {
    expect(namesFor('salesperson')).toEqual([
      'get_today_summary',
      'search_customers',
      'search_items',
      'find_invoices',
      'get_invoice',
      'list_drafts',
      'propose_quick_sale',
      'propose_quotation',
      'propose_collect_payment',
      'propose_new_customer',
      'open_record',
    ]);
  });

  it('offers a sale and a quotation only to roles that sell, walk-ins aside', () => {
    for (const persona of ['owner', 'salesperson', 'storeAssociate'] as Persona[]) {
      expect(namesFor(persona), persona).toContain('propose_quick_sale');
      expect(namesFor(persona), persona).toContain('propose_quotation');
    }
    for (const persona of ['warehouse', 'purchasing', 'projectManager'] as Persona[]) {
      expect(namesFor(persona), persona).not.toContain('propose_quick_sale');
      expect(namesFor(persona), persona).not.toContain('propose_quotation');
    }
  });

  it('offers a purchase order to those who order purchases, and a payment to those who collect', () => {
    expect(namesFor('owner')).toContain('propose_purchase_order');
    expect(namesFor('purchasing')).toContain('propose_purchase_order');
    for (const persona of [
      'salesperson',
      'storeAssociate',
      'warehouse',
      'projectManager',
    ] as Persona[]) {
      expect(namesFor(persona), persona).not.toContain('propose_purchase_order');
    }
    for (const persona of ['owner', 'salesperson', 'storeAssociate'] as Persona[]) {
      expect(namesFor(persona), persona).toContain('propose_collect_payment');
    }
    for (const persona of ['warehouse', 'purchasing', 'projectManager'] as Persona[]) {
      expect(namesFor(persona), persona).not.toContain('propose_collect_payment');
    }
  });

  it('offers a stock move to those who may transfer stock', () => {
    for (const persona of ['owner', 'storeAssociate', 'warehouse'] as Persona[]) {
      expect(namesFor(persona), persona).toContain('propose_stock_move');
    }
    for (const persona of ['salesperson', 'purchasing', 'projectManager'] as Persona[]) {
      expect(namesFor(persona), persona).not.toContain('propose_stock_move');
    }
  });

  it('narrows a role by its ERPNext roles: an owner who may not order purchases gets no purchase order', () => {
    const caps = capabilitiesFor('owner', ['System Manager', 'Accounts Manager']);
    expect(toolsFor(caps)).not.toContain('propose_purchase_order');
    expect(toolsFor(caps)).not.toContain('propose_stock_move');
  });

  it('opens only the kinds of record a role can read', () => {
    const owner = capabilitiesFor('owner');
    expect(openableKinds(owner)).toEqual([...RECORD_KINDS]);
    expect(openableKinds(capabilitiesFor('salesperson'))).toEqual([
      'invoice',
      'quotation',
      'sales_order',
      'customer',
      'item',
      'draft',
    ]);
    expect(openableKinds(capabilitiesFor('warehouse'))).toEqual([
      'purchase_order',
      'supplier',
      'item',
    ]);
    expect(openableKinds(capabilitiesFor('purchasing'))).toEqual([
      'purchase_order',
      'supplier',
      'item',
      'draft',
    ]);
    expect(openableKinds(capabilitiesFor('projectManager'))).toEqual(['customer', 'item']);
  });

  it('offers each new-record tool to the roles PERMISSIONS lets add that record', () => {
    const offered = (persona: Persona) =>
      namesFor(persona).filter((name) => name.startsWith('propose_new_'));
    expect(offered('owner')).toEqual([
      'propose_new_customer',
      'propose_new_supplier',
      'propose_new_item',
    ]);
    expect(offered('salesperson')).toEqual(['propose_new_customer']);
    expect(offered('storeAssociate')).toEqual(['propose_new_customer']);
    expect(offered('projectManager')).toEqual(['propose_new_customer']);
    expect(offered('purchasing')).toEqual(['propose_new_supplier', 'propose_new_item']);
    expect(offered('warehouse')).toEqual([]);
  });

  it('narrows the new-record tools by the user’s ERPNext roles', () => {
    const noMasters = capabilitiesFor('owner', ['System Manager', 'Accounts Manager']);
    expect(toolsFor(noMasters)).not.toContain('propose_new_customer');
    expect(toolsFor(noMasters)).not.toContain('propose_new_supplier');
    expect(toolsFor(noMasters)).not.toContain('propose_new_item');
  });

  it('gives store associates purchase orders too, since they receive goods', () => {
    expect(namesFor('storeAssociate')).toContain('find_purchase_orders');
    expect(namesFor('storeAssociate')).toContain('find_invoices');
  });

  it('keeps sales and customers from the warehouse worker', () => {
    expect(namesFor('warehouse')).toEqual([
      'search_items',
      'find_purchase_orders',
      'propose_stock_move',
      'open_record',
    ]);
  });

  it('gives the purchasing officer items, drafts, purchase orders and their own proposals', () => {
    expect(namesFor('purchasing')).toEqual([
      'search_items',
      'list_drafts',
      'find_purchase_orders',
      'propose_purchase_order',
      'propose_new_supplier',
      'propose_new_item',
      'open_record',
    ]);
  });

  it('gives the project manager customers and items only', () => {
    expect(namesFor('projectManager')).toEqual([
      'search_customers',
      'search_items',
      'propose_new_customer',
      'open_record',
    ]);
  });
});

describe('validateInput', () => {
  it('accepts valid input and drops nothing', () => {
    expect(
      validateInput('find_invoices', { customer: 'Lina', unpaid_only: true, limit: 5 }),
    ).toEqual({ ok: true, input: { customer: 'Lina', unpaid_only: true, limit: 5 } });
    expect(validateInput('get_today_summary', {})).toEqual({ ok: true, input: {} });
  });

  it.each([
    ['not an object', 'search_items', 'chairs'],
    ['an array', 'search_items', []],
    ['null', 'search_items', null],
    ['a missing required field', 'search_items', {}],
    ['a missing invoice name', 'get_invoice', { limit: 1 }],
    ['an unknown field', 'search_items', { query: 'a', extra: 1 }],
    ['a field on a tool without any', 'list_drafts', { limit: 1 }],
    ['text that is a number', 'search_items', { query: 5 }],
    ['text that is too long', 'search_items', { query: 'x'.repeat(101) }],
    ['a limit as text', 'search_items', { query: 'a', limit: '5' }],
    ['a fractional limit', 'search_items', { query: 'a', limit: 2.5 }],
    ['a limit of zero', 'search_items', { query: 'a', limit: 0 }],
    ['a limit above the maximum', 'search_items', { query: 'a', limit: 11 }],
    ['an invoice limit above 20', 'find_invoices', { limit: 21 }],
    ['a flag as text', 'find_invoices', { unpaid_only: 'yes' }],
    ['a date in another format', 'find_invoices', { from: '25/10/2026' }],
    ['a date that does not exist', 'find_invoices', { to: '2026-02-30' }],
  ] as [string, ToolName, unknown][])('rejects %s', (_, name, input) => {
    expect(validateInput(name, input)).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it('accepts a leap day and the largest limits', () => {
    expect(validateInput('find_invoices', { from: '2028-02-29', limit: 20 }).ok).toBe(true);
    expect(validateInput('search_customers', { query: '', limit: 10 }).ok).toBe(true);
  });
});

describe('validateInput for proposals', () => {
  const sale = { customer: 'Lina', items: [{ item: 'Olive', qty: 2 }] };

  it('accepts a sale with lines, a typed price and a warehouse', () => {
    const input = {
      customer: 'walk-in',
      items: [
        { item: 'Olive tree', qty: 2, rate: 80 },
        { item: 'POT-30', qty: 0.5 },
      ],
      warehouse: 'Main',
    };
    expect(validateInput('propose_quick_sale', input)).toEqual({ ok: true, input });
    expect(validateInput('propose_collect_payment', { customer: 'Lina' }).ok).toBe(true);
    expect(validateInput('propose_collect_payment', { customer: 'Lina', amount: 12.5 }).ok).toBe(
      true,
    );
    expect(
      validateInput('propose_stock_move', { item: 'OLV-20', qty: 3, from: 'a', to: 'b' }).ok,
    ).toBe(true);
    expect(validateInput('open_record', { kind: 'draft', name: 'SI-1' }).ok).toBe(true);
  });

  it('accepts the new-record tools with their optional fields, and a price in Arabic digits', () => {
    expect(validateInput('propose_new_customer', { name: 'Samer' }).ok).toBe(true);
    expect(
      validateInput('propose_new_customer', {
        name: 'Samer',
        phone: '059',
        email: 'a@b.co',
        address: 'x'.repeat(200),
      }).ok,
    ).toBe(true);
    expect(validateInput('propose_new_supplier', { name: 'Clay', phone: '1' }).ok).toBe(true);
    expect(validateInput('propose_new_item', { name: 'Fig', kind: 'service' }).ok).toBe(true);
    expect(
      validateInput('propose_new_item', { name: 'Fig', kind: 'product', selling_price: '٤٥٫٥' }),
    ).toEqual({ ok: true, input: { name: 'Fig', kind: 'product', selling_price: 45.5 } });
  });

  it.each([
    ['a customer without a name', 'propose_new_customer', { phone: '1' }],
    [
      'an address over 200 characters',
      'propose_new_customer',
      { name: 'S', address: 'x'.repeat(201) },
    ],
    ['a supplier address', 'propose_new_supplier', { name: 'S', address: 'x' }],
    ['an item without a kind', 'propose_new_item', { name: 'Fig' }],
    ['an unknown item kind', 'propose_new_item', { name: 'Fig', kind: 'bundle' }],
    [
      'a selling price of zero',
      'propose_new_item',
      { name: 'Fig', kind: 'product', selling_price: 0 },
    ],
    ['a name over 100 characters', 'propose_new_item', { name: 'x'.repeat(101), kind: 'product' }],
  ] as [string, ToolName, unknown][])('rejects %s', (_, name, input) => {
    expect(validateInput(name, input)).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it.each([
    ['no lines', 'propose_quick_sale', { customer: 'Lina', items: [] }],
    ['lines that are not a list', 'propose_quotation', { customer: 'Lina', items: 'Olive' }],
    [
      'more than twenty lines',
      'propose_quotation',
      {
        customer: 'Lina',
        items: Array.from({ length: 21 }, () => ({ item: 'a', qty: 1 })),
      },
    ],
    ['a line without a quantity', 'propose_quick_sale', { customer: 'L', items: [{ item: 'a' }] }],
    ['a quantity of zero', 'propose_quick_sale', { customer: 'L', items: [{ item: 'a', qty: 0 }] }],
    [
      'a negative quantity',
      'propose_quick_sale',
      { customer: 'L', items: [{ item: 'a', qty: -1 }] },
    ],
    [
      'a quantity above 10000',
      'propose_quick_sale',
      { customer: 'L', items: [{ item: 'a', qty: 10001 }] },
    ],
    [
      'a quantity that is not a number',
      'propose_quick_sale',
      { customer: 'L', items: [{ item: 'a', qty: 'many' }] },
    ],
    [
      'a negative price',
      'propose_purchase_order',
      { supplier: 'S', items: [{ item: 'a', qty: 1, rate: -1 }] },
    ],
    [
      'an unknown field on a line',
      'propose_quick_sale',
      { customer: 'L', items: [{ item: 'a', qty: 1, discount: 5 }] },
    ],
    ['a line that is not an object', 'propose_quick_sale', { customer: 'L', items: ['a'] }],
    ['a missing customer', 'propose_quick_sale', { items: [{ item: 'a', qty: 1 }] }],
    ['a payment of zero', 'propose_collect_payment', { customer: 'L', amount: 0 }],
    ['a stock move without a quantity', 'propose_stock_move', { item: 'a' }],
    ['an unknown kind of record', 'open_record', { kind: 'payment', name: 'PAY-1' }],
    ['a record without a name', 'open_record', { kind: 'invoice' }],
  ] as [string, ToolName, unknown][])('rejects %s', (_, name, input) => {
    expect(validateInput(name, input)).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it('names the line and field that failed', () => {
    expect(
      validateInput('propose_quick_sale', {
        customer: 'L',
        items: [
          { item: 'a', qty: 1 },
          { item: 'b', qty: 0 },
        ],
      }),
    ).toEqual({ ok: false, error: 'Field "items[1].qty" must be more than 0.' });
  });

  it('reads typed numbers with Arabic digits and separators', () => {
    expect(
      validateInput('propose_quick_sale', {
        customer: 'L',
        items: [{ item: 'a', qty: '٣', rate: '٨٥٫٥' }],
      }),
    ).toEqual({ ok: true, input: { customer: 'L', items: [{ item: 'a', qty: 3, rate: 85.5 }] } });
    expect(validateInput('propose_collect_payment', { customer: 'L', amount: '١٢٠' })).toEqual({
      ok: true,
      input: { customer: 'L', amount: 120 },
    });
  });

  it('takes the sale as given when it is valid', () => {
    expect(validateInput('propose_quotation', sale)).toEqual({ ok: true, input: sale });
  });
});

describe('toToolContent', () => {
  it('writes compact JSON when it fits', () => {
    expect(toToolContent({ total: 1, rows: [{ a: 1 }] }, 'rows')).toBe(
      '{"total":1,"rows":[{"a":1}]}',
    );
  });

  it('drops rows from the end of the list and says it truncated', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      name: `SI-${1000 + i}`,
      note: 'x'.repeat(200),
    }));
    const content = toToolContent({ total: 40, rows }, 'rows');
    const parsed = JSON.parse(content) as {
      total: number;
      rows: { name: string }[];
      truncated: boolean;
    };
    expect(bytes(content)).toBeLessThanOrEqual(RESULT_LIMIT_BYTES);
    expect(parsed.truncated).toBe(true);
    expect(parsed.total).toBe(40);
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(parsed.rows.length).toBeLessThan(40);
    expect(parsed.rows[0].name).toBe('SI-1000');
  });

  it('counts bytes, not characters, so Arabic names fit too', () => {
    const rows = Array.from({ length: 60 }, () => ({ name: 'ليلى حداد'.repeat(10) }));
    expect(bytes(toToolContent({ rows }, 'rows'))).toBeLessThanOrEqual(RESULT_LIMIT_BYTES);
  });

  it('falls back to a bare truncation marker when even an empty list is too big', () => {
    expect(toToolContent({ note: 'x'.repeat(5000), rows: [1] }, 'rows')).toBe('{"truncated":true}');
    expect(toToolContent({ note: 'x'.repeat(5000) }, null)).toBe('{"truncated":true}');
  });
});

describe('the service registry', () => {
  it('defines the same tools, in the same order, as the app sends', () => {
    expect(Object.keys(toolRegistry)).toEqual([...TOOL_NAMES]);
  });

  it('describes the same fields, types and required fields as the app checks', () => {
    interface Node {
      properties: Record<string, { type: string; format?: string; enum?: string[]; items?: Node }>;
      required?: string[];
    }
    interface Mine {
      properties: Record<
        string,
        { type: string; format?: string; enum?: readonly string[]; items?: Mine }
      >;
      required: string[];
    }
    const compare = (mine: Mine, theirs: Node, where: string) => {
      expect(Object.keys(mine.properties), where).toEqual(Object.keys(theirs.properties));
      expect(mine.required, where).toEqual(theirs.required ?? []);
      for (const [field, property] of Object.entries(mine.properties)) {
        const other = theirs.properties[field];
        expect(property.type, `${where}.${field}`).toBe(other.type);
        expect(property.format, `${where}.${field}`).toBe(other.format);
        expect(property.enum, `${where}.${field}`).toEqual(other.enum);
        expect(!!property.items, `${where}.${field} items`).toBe(!!other.items);
        if (property.items && other.items) {
          compare(property.items, other.items, `${where}.${field}[]`);
        }
      }
    };
    for (const name of TOOL_NAMES) {
      compare(TOOL_SCHEMAS[name] as Mine, toolRegistry[name].input_schema as unknown as Node, name);
    }
  });
});
