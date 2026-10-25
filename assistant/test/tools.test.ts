import { describe, expect, it } from 'vitest';
import { selectTools, toolRegistry } from '../src/tools.js';

const NAMES = [
  'get_today_summary',
  'search_customers',
  'search_items',
  'find_invoices',
  'get_invoice',
  'list_drafts',
  'find_purchase_orders',
];

const objects = (schema: unknown): Record<string, unknown>[] => {
  if (typeof schema !== 'object' || schema === null) return [];
  const node = schema as Record<string, unknown>;
  const nested = Object.values((node['properties'] as object | undefined) ?? {}).flatMap(objects);
  return node['type'] === 'object' ? [node, ...nested] : nested;
};

describe('tool registry', () => {
  it('defines the seven read-only tools the app sends', () => {
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

  it('selects the requested tools in order without cache markers (the system breakpoint covers them)', () => {
    const tools = selectTools(['find_invoices', 'get_invoice', 'find_invoices', 'nope']);
    expect(tools.map((t) => t.name)).toEqual(['find_invoices', 'get_invoice']);
    expect(tools.some((t) => 'cache_control' in t)).toBe(false);
  });
});
