import { Capabilities } from '../../../core/auth/capabilities';

export const TOOL_NAMES = [
  'get_today_summary',
  'search_customers',
  'search_items',
  'find_invoices',
  'get_invoice',
  'list_drafts',
  'find_purchase_orders',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const isToolName = (name: string): name is ToolName =>
  (TOOL_NAMES as readonly string[]).includes(name);

interface PropertySchema {
  type: 'string' | 'integer' | 'boolean';
  format?: 'date';
  /** Bounds the strict schema can't express: the service's description states them. */
  minimum?: number;
  maximum?: number;
  maxLength?: number;
}

interface ToolSchema {
  properties: Record<string, PropertySchema>;
  required: string[];
}

const text: PropertySchema = { type: 'string', maxLength: 100 };
const date: PropertySchema = { type: 'string', format: 'date' };
const count = (maximum: number): PropertySchema => ({ type: 'integer', minimum: 1, maximum });

/** The input each tool takes: the same names, types and required fields as `assistant/src/tools.ts`. */
export const TOOL_SCHEMAS: Record<ToolName, ToolSchema> = {
  get_today_summary: { properties: {}, required: [] },
  search_customers: { properties: { query: text, limit: count(10) }, required: ['query'] },
  search_items: { properties: { query: text, limit: count(10) }, required: ['query'] },
  find_invoices: {
    properties: {
      customer: text,
      unpaid_only: { type: 'boolean' },
      from: date,
      to: date,
      limit: count(20),
    },
    required: [],
  },
  get_invoice: { properties: { name: text }, required: ['name'] },
  list_drafts: { properties: {}, required: [] },
  find_purchase_orders: {
    properties: { supplier: text, open_only: { type: 'boolean' }, limit: count(20) },
    required: [],
  },
};

/** The tools a role may be offered: those whose records its capabilities let it see. */
export function toolsFor(caps: Capabilities): ToolName[] {
  const customers = caps.sell || caps.collect || caps.manageProjects;
  return TOOL_NAMES.filter((name) => {
    switch (name) {
      case 'get_today_summary':
      case 'find_invoices':
      case 'get_invoice':
        return caps.sell;
      case 'search_customers':
        return customers;
      case 'list_drafts':
        return caps.sell || caps.orderPurchases;
      case 'find_purchase_orders':
        return caps.orderPurchases || caps.receiveGoods;
      default:
        return true;
    }
  });
}

export type ToolInput = Record<string, string | number | boolean>;

export type Validation = { ok: true; input: ToolInput } | { ok: false; error: string };

const isDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};

/** Checks a tool call's input against its schema; nothing runs on input that fails. */
export function validateInput(name: ToolName, input: unknown): Validation {
  const schema = TOOL_SCHEMAS[name];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Input must be an object.' };
  }
  const values = input as Record<string, unknown>;
  for (const key of Object.keys(values)) {
    if (!Object.hasOwn(schema.properties, key)) {
      return { ok: false, error: `Unknown field "${key}".` };
    }
  }
  for (const key of schema.required) {
    if (values[key] === undefined) {
      return { ok: false, error: `Field "${key}" is required.` };
    }
  }
  const clean: ToolInput = {};
  for (const [key, property] of Object.entries(schema.properties)) {
    const value = values[key];
    if (value === undefined) {
      continue;
    }
    if (property.type === 'boolean' && typeof value !== 'boolean') {
      return { ok: false, error: `Field "${key}" must be true or false.` };
    }
    if (property.type === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return { ok: false, error: `Field "${key}" must be a whole number.` };
      }
      if (value < (property.minimum ?? -Infinity) || value > (property.maximum ?? Infinity)) {
        return {
          ok: false,
          error: `Field "${key}" must be from ${property.minimum} to ${property.maximum}.`,
        };
      }
    }
    if (property.type === 'string') {
      if (typeof value !== 'string') {
        return { ok: false, error: `Field "${key}" must be text.` };
      }
      if (property.format === 'date' && !isDate(value)) {
        return { ok: false, error: `Field "${key}" must be a date as YYYY-MM-DD.` };
      }
      if (property.maxLength !== undefined && value.length > property.maxLength) {
        return { ok: false, error: `Field "${key}" is too long.` };
      }
    }
    clean[key] = value as string | number | boolean;
  }
  return { ok: true, input: clean };
}

export const RESULT_LIMIT_BYTES = 4096;

const bytes = (value: string) => new TextEncoder().encode(value).length;

/**
 * A tool result as compact JSON of at most 4 KB. A list that doesn't fit loses rows from the end and the
 * result says `"truncated": true`.
 */
export function toToolContent(payload: Record<string, unknown>, listKey: string | null): string {
  const whole = JSON.stringify(payload);
  if (bytes(whole) <= RESULT_LIMIT_BYTES) {
    return whole;
  }
  const rows =
    listKey && Array.isArray(payload[listKey]) ? [...(payload[listKey] as unknown[])] : [];
  while (rows.length) {
    rows.pop();
    const shorter = JSON.stringify({ ...payload, [listKey!]: rows, truncated: true });
    if (bytes(shorter) <= RESULT_LIMIT_BYTES) {
      return shorter;
    }
  }
  return JSON.stringify({ truncated: true });
}
