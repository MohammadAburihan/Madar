import { capabilitiesFor } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { toolRegistry } from '../../../../../assistant/src/tools';
import {
  RESULT_LIMIT_BYTES,
  TOOL_NAMES,
  TOOL_SCHEMAS,
  ToolName,
  toToolContent,
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
    ]);
  });

  it('gives store associates purchase orders too, since they receive goods', () => {
    expect(namesFor('storeAssociate')).toContain('find_purchase_orders');
    expect(namesFor('storeAssociate')).toContain('find_invoices');
  });

  it('keeps sales and customers from the warehouse worker', () => {
    expect(namesFor('warehouse')).toEqual(['search_items', 'find_purchase_orders']);
  });

  it('gives the purchasing officer items, drafts and purchase orders only', () => {
    expect(namesFor('purchasing')).toEqual(['search_items', 'list_drafts', 'find_purchase_orders']);
  });

  it('gives the project manager customers and items only', () => {
    expect(namesFor('projectManager')).toEqual(['search_customers', 'search_items']);
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
    for (const name of TOOL_NAMES) {
      const schema = toolRegistry[name].input_schema as {
        properties: Record<string, { type: string; format?: string }>;
        required?: string[];
      };
      const mine = TOOL_SCHEMAS[name];
      expect(Object.keys(mine.properties), name).toEqual(Object.keys(schema.properties));
      expect(mine.required, name).toEqual(schema.required ?? []);
      for (const [field, property] of Object.entries(mine.properties)) {
        expect(property.type, `${name}.${field}`).toBe(schema.properties[field].type);
        expect(property.format, `${name}.${field}`).toBe(schema.properties[field].format);
      }
    }
  });
});
