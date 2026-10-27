import { describe, expect, it } from 'vitest';
import { STABLE_PROMPT } from '../src/prompt.js';
import { selectTools, toolRegistry } from '../src/tools.js';

const NAMES = [
  'get_today_summary',
  'search_customers',
  'search_items',
  'find_invoices',
  'get_invoice',
  'list_drafts',
  'find_purchase_orders',
  'propose_quick_sale',
  'propose_quotation',
  'propose_purchase_order',
  'propose_collect_payment',
  'propose_stock_move',
  'propose_new_customer',
  'propose_new_supplier',
  'propose_new_item',
  'open_record',
];

const objects = (schema: unknown): Record<string, unknown>[] => {
  if (typeof schema !== 'object' || schema === null) return [];
  const node = schema as Record<string, unknown>;
  const nested = [
    ...Object.values((node['properties'] as object | undefined) ?? {}),
    ...(node['items'] ? [node['items']] : []),
  ].flatMap(objects);
  return node['type'] === 'object' ? [node, ...nested] : nested;
};

type Node = {
  properties?: Record<string, Node>;
  items?: Node;
  required?: string[];
};

const mandatory = (schema: Node): string[] => schema.required ?? [];

describe('tool registry', () => {
  it('sets strict on no tool', () => {
    for (const [name, def] of Object.entries(toolRegistry)) {
      expect(
        def,
        `${name}: strict tools hit Anthropic's grammar limits (24 optional parameters, 16 union-typed parameters across all tools in a request), so the app validates every input against TOOL_SCHEMAS instead.`,
      ).not.toHaveProperty('strict');
    }
  });

  it('defines the seven lookups, the six proposals and the three new-record proposals the app sends', () => {
    expect(Object.keys(toolRegistry)).toEqual(NAMES);
  });

  it('keeps every tool closed and described', () => {
    for (const [name, def] of Object.entries(toolRegistry)) {
      expect(def.description, name).toBeTruthy();
      for (const object of objects(def.input_schema)) {
        expect(object['additionalProperties'], name).toBe(false);
      }
    }
  });

  it('requires the search text and the invoice name, and nothing else', () => {
    const required = (name: string) => mandatory(toolRegistry[name]!.input_schema as Node);
    expect(required('search_customers')).toEqual(['query']);
    expect(required('search_items')).toEqual(['query']);
    expect(required('get_invoice')).toEqual(['name']);
    for (const name of [
      'get_today_summary',
      'find_invoices',
      'list_drafts',
      'find_purchase_orders',
    ])
      expect(required(name), name).toEqual([]);
  });

  it('requires what each proposal needs, and leaves prices, warehouses and amounts optional', () => {
    const schema = (name: string) => {
      const node = toolRegistry[name]!.input_schema as Node;
      return { properties: node.properties!, required: mandatory(node) };
    };
    expect(schema('propose_quick_sale').required).toEqual(['items']);
    expect(Object.keys(schema('propose_quick_sale').properties)).toContain('project');
    expect(Object.keys(schema('propose_quotation').properties)).not.toContain('project');
    expect(schema('propose_quotation').required).toEqual(['customer', 'items']);
    expect(schema('propose_purchase_order').required).toEqual(['supplier', 'items']);
    expect(schema('propose_collect_payment').required).toEqual(['customer']);
    expect(schema('propose_stock_move').required).toEqual(['item', 'qty']);
    expect(schema('open_record').required).toEqual(['kind', 'name']);
    expect(schema('propose_new_customer').required).toEqual(['name']);
    expect(schema('propose_new_supplier').required).toEqual(['name']);
    expect(schema('propose_new_item').required).toEqual(['name', 'kind']);
    const line = schema('propose_quick_sale').properties['items']!.items!;
    expect(Object.keys(line.properties)).toEqual(['item', 'qty', 'rate']);
    expect(mandatory(line)).toEqual(['item', 'qty']);
  });

  it('lets open_record name only the kinds of record Madar can open', () => {
    const { kind } = (
      toolRegistry['open_record']!.input_schema as {
        properties: Record<string, { enum: string[] }>;
      }
    ).properties as Record<string, { enum: string[] }>;
    expect(kind!.enum).toEqual([
      'invoice',
      'quotation',
      'sales_order',
      'purchase_order',
      'customer',
      'supplier',
      'item',
      'draft',
    ]);
  });

  it('says in every proposal tool that nothing is saved by the call', () => {
    for (const name of NAMES.filter((n) => n.startsWith('propose_'))) {
      expect(toolRegistry[name]!.description, name).toMatch(/Nothing is saved/);
    }
  });

  it('selects the requested tools in order without cache markers (the system breakpoint covers them)', () => {
    const tools = selectTools(['find_invoices', 'get_invoice', 'find_invoices', 'nope']);
    expect(tools.map((t) => t.name)).toEqual(['find_invoices', 'get_invoice']);
    expect(tools.some((t) => 'cache_control' in t)).toBe(false);
  });
});

describe('new-record tools', () => {
  const props = (name: string) =>
    Object.keys((toolRegistry[name]!.input_schema as { properties: object }).properties);

  it('take only what the form fills in', () => {
    expect(props('propose_new_customer')).toEqual(['name', 'phone', 'email', 'address']);
    expect(props('propose_new_supplier')).toEqual(['name', 'phone', 'email']);
    expect(props('propose_new_item')).toEqual(['name', 'kind', 'selling_price']);
  });

  it('limit an item to a product or a service', () => {
    const { kind } = (
      toolRegistry['propose_new_item']!.input_schema as {
        properties: Record<string, { enum: string[] }>;
      }
    ).properties as Record<string, { enum: string[] }>;
    expect(kind!.enum).toEqual(['product', 'service']);
  });

  it('are for a name that was not found, never for one that was only misspelt', () => {
    for (const name of ['propose_new_customer', 'propose_new_supplier', 'propose_new_item']) {
      expect(toolRegistry[name]!.description, name).toMatch(/can_create/);
      expect(toolRegistry[name]!.description, name).toMatch(
        /never for a name that was only misspelt/,
      );
    }
  });
});

describe('system prompt', () => {
  it('shows suggestions for a name not found, offers to add only when can_create, and never creates silently', () => {
    expect(STABLE_PROMPT).toMatch(
      /was not found, show the suggestions it returns \(did_you_mean\)/,
    );
    expect(STABLE_PROMPT).toMatch(/never invent names/);
    expect(STABLE_PROMPT).toMatch(/can_create is true, offer to add it as new/);
    expect(STABLE_PROMPT).toMatch(
      /offer to add it as new only if that earlier result had can_create true/,
    );
    expect(STABLE_PROMPT).toMatch(/too_many, ask the user for more of the name/);
    expect(STABLE_PROMPT).toMatch(/propose_new_\* tool/);
    expect(STABLE_PROMPT).toMatch(/Never create anything silently/);
    expect(STABLE_PROMPT).toMatch(/come back and ask again/);
  });

  it('sends changes through the propose tools and never claims they were made', () => {
    expect(STABLE_PROMPT).toMatch(/propose_\* tool/);
    expect(STABLE_PROMPT).toMatch(/nothing is saved until the user reviews and confirms/);
    expect(STABLE_PROMPT).toMatch(/tell the user to review and confirm/);
    expect(STABLE_PROMPT).toMatch(/Never say it was done/);
    expect(STABLE_PROMPT).toMatch(/Never claim that something was created, changed or deleted/);
  });

  it('sends edits and deletions to open_record and says confirmed records cannot be cancelled', () => {
    expect(STABLE_PROMPT).toMatch(/open_record/);
    expect(STABLE_PROMPT).toMatch(/cannot be cancelled or amended in Madar yet/);
  });

  it('asks which record is meant instead of guessing, and never invents a price', () => {
    expect(STABLE_PROMPT).toMatch(/matches several records, ask the user which one/);
    expect(STABLE_PROMPT).toMatch(/Never invent prices/);
  });
});
