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

describe('tool registry', () => {
  it('defines the seven lookups and the six proposals the app sends', () => {
    expect(Object.keys(toolRegistry)).toEqual(NAMES);
  });

  it('keeps every tool strict, closed and described', () => {
    for (const [name, def] of Object.entries(toolRegistry)) {
      expect(def.strict, name).toBe(true);
      expect(def.description, name).toBeTruthy();
      for (const object of objects(def.input_schema)) {
        expect(object['additionalProperties'], name).toBe(false);
      }
    }
  });

  it('requires the search text and the invoice name, and nothing else', () => {
    const required = (name: string) =>
      (toolRegistry[name]!.input_schema as { required?: string[] }).required ?? [];
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
    const schema = (name: string) =>
      toolRegistry[name]!.input_schema as {
        required?: string[];
        properties: Record<string, { items?: { required?: string[]; properties: object } }>;
      };
    expect(schema('propose_quick_sale').required).toEqual(['customer', 'items']);
    expect(schema('propose_quotation').required).toEqual(['customer', 'items']);
    expect(schema('propose_purchase_order').required).toEqual(['supplier', 'items']);
    expect(schema('propose_collect_payment').required).toEqual(['customer']);
    expect(schema('propose_stock_move').required).toEqual(['item', 'qty']);
    expect(schema('open_record').required).toEqual(['kind', 'name']);
    const line = schema('propose_quick_sale').properties['items']!.items!;
    expect(Object.keys(line.properties)).toEqual(['item', 'qty', 'rate']);
    expect(line.required).toEqual(['item', 'qty']);
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

describe('system prompt', () => {
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
