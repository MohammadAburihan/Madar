import { Capabilities } from '../../../core/auth/capabilities';
import { parseNumber } from '../../../core/format/number';

export const TOOL_NAMES = [
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
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const isToolName = (name: string): name is ToolName =>
  (TOOL_NAMES as readonly string[]).includes(name);

export const RECORD_KINDS = [
  'invoice',
  'quotation',
  'sales_order',
  'purchase_order',
  'customer',
  'supplier',
  'item',
  'draft',
] as const;
export const ITEM_KINDS = ['product', 'service'] as const;

export type RecordKindName = (typeof RECORD_KINDS)[number];

interface PropertySchema {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'array';
  format?: 'date';
  enum?: readonly string[];
  /** Bounds the strict schema can't express: the service's description states them. */
  minimum?: number;
  above?: number;
  maximum?: number;
  maxLength?: number;
  items?: ToolSchema;
  maxItems?: number;
}

interface ToolSchema {
  properties: Record<string, PropertySchema>;
  required: string[];
}

const text: PropertySchema = { type: 'string', maxLength: 100 };
const address: PropertySchema = { type: 'string', maxLength: 200 };
const date: PropertySchema = { type: 'string', format: 'date' };
const count = (maximum: number): PropertySchema => ({ type: 'integer', minimum: 1, maximum });
const quantity: PropertySchema = { type: 'number', above: 0, maximum: 10_000 };
const lines: PropertySchema = {
  type: 'array',
  maxItems: 20,
  items: {
    properties: {
      item: text,
      qty: quantity,
      rate: { type: 'number', minimum: 0, maximum: 10_000_000 },
    },
    required: ['item', 'qty'],
  },
};

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
  propose_quick_sale: {
    properties: { customer: text, items: lines, warehouse: text, project: text },
    required: ['items'],
  },
  propose_quotation: {
    properties: { customer: text, items: lines },
    required: ['customer', 'items'],
  },
  propose_purchase_order: {
    properties: { supplier: text, items: lines },
    required: ['supplier', 'items'],
  },
  propose_collect_payment: {
    properties: { customer: text, amount: { type: 'number', above: 0, maximum: 1_000_000_000 } },
    required: ['customer'],
  },
  propose_stock_move: {
    properties: { item: text, qty: quantity, from: text, to: text },
    required: ['item', 'qty'],
  },
  propose_new_customer: {
    properties: { name: text, phone: text, email: text, address },
    required: ['name'],
  },
  propose_new_supplier: {
    properties: { name: text, phone: text, email: text },
    required: ['name'],
  },
  propose_new_item: {
    properties: {
      name: text,
      kind: { type: 'string', enum: ITEM_KINDS },
      selling_price: { type: 'number', above: 0, maximum: 10_000_000 },
    },
    required: ['name', 'kind'],
  },
  open_record: {
    properties: { kind: { type: 'string', enum: RECORD_KINDS }, name: text },
    required: ['kind', 'name'],
  },
};

export function openableKinds(caps: Capabilities): RecordKindName[] {
  const sells = caps.sell;
  const buys = caps.orderPurchases || caps.receiveGoods;
  const kinds: [RecordKindName, boolean][] = [
    ['invoice', sells],
    ['quotation', sells],
    ['sales_order', sells],
    ['purchase_order', buys],
    ['customer', caps.sell || caps.collect || caps.manageProjects],
    [
      'supplier',
      caps.orderPurchases || caps.receiveGoods || caps.recordSupplierInvoices || caps.paySuppliers,
    ],
    ['item', true],
    ['draft', caps.sell || caps.orderPurchases],
  ];
  return kinds.filter(([, allowed]) => allowed).map(([kind]) => kind);
}

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
      case 'propose_quick_sale':
      case 'propose_quotation':
        return caps.sell;
      case 'propose_purchase_order':
        return caps.orderPurchases;
      case 'propose_collect_payment':
        return caps.collect;
      case 'propose_stock_move':
        return caps.transferStock;
      case 'propose_new_customer':
        return caps.editCustomers;
      case 'propose_new_supplier':
        return caps.addSuppliers;
      case 'propose_new_item':
        return caps.manageItems;
      case 'open_record':
        return openableKinds(caps).length > 0;
      default:
        return true;
    }
  });
}

export type ToolValue = string | number | boolean | ToolInput[];
export interface ToolInput {
  [key: string]: ToolValue;
}

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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function checkValue(
  path: string,
  property: PropertySchema,
  value: unknown,
): { ok: true; value: ToolValue } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error });
  const good = (clean: ToolValue) => ({ ok: true as const, value: clean });
  switch (property.type) {
    case 'boolean':
      return typeof value === 'boolean'
        ? good(value)
        : bad(`Field "${path}" must be true or false.`);
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return bad(`Field "${path}" must be a whole number.`);
      }
      if (value < (property.minimum ?? -Infinity) || value > (property.maximum ?? Infinity)) {
        return bad(`Field "${path}" must be from ${property.minimum} to ${property.maximum}.`);
      }
      return good(value);
    case 'number': {
      // Typed digits may be Arabic-Indic (٣٫٥), so text is read the way every other typed number is.
      const number = typeof value === 'string' ? parseNumber(value) : value;
      if (typeof number !== 'number' || !Number.isFinite(number)) {
        return bad(`Field "${path}" must be a number.`);
      }
      if (property.above !== undefined && number <= property.above) {
        return bad(`Field "${path}" must be more than ${property.above}.`);
      }
      if (number < (property.minimum ?? -Infinity) || number > (property.maximum ?? Infinity)) {
        return bad(`Field "${path}" must be at most ${property.maximum}.`);
      }
      return good(number);
    }
    case 'string':
      if (typeof value !== 'string') {
        return bad(`Field "${path}" must be text.`);
      }
      if (property.format === 'date' && !isDate(value)) {
        return bad(`Field "${path}" must be a date as YYYY-MM-DD.`);
      }
      if (property.maxLength !== undefined && value.length > property.maxLength) {
        return bad(`Field "${path}" is too long.`);
      }
      if (property.enum && !property.enum.includes(value)) {
        return bad(`Field "${path}" must be one of: ${property.enum.join(', ')}.`);
      }
      return good(value);
    case 'array': {
      if (!Array.isArray(value) || !value.length) {
        return bad(`Field "${path}" must be a list with at least one entry.`);
      }
      if (value.length > (property.maxItems ?? Infinity)) {
        return bad(`Field "${path}" can hold at most ${property.maxItems} entries.`);
      }
      const entries: ToolInput[] = [];
      for (const [i, entry] of value.entries()) {
        const checked = checkObject(property.items!, entry, `${path}[${i}]`);
        if (!checked.ok) {
          return checked;
        }
        entries.push(checked.input);
      }
      return good(entries);
    }
  }
}

function checkObject(schema: ToolSchema, input: unknown, path = ''): Validation {
  if (!isObject(input)) {
    return { ok: false, error: path ? `"${path}" must be an object.` : 'Input must be an object.' };
  }
  const at = (key: string) => (path ? `${path}.${key}` : key);
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(schema.properties, key)) {
      return { ok: false, error: `Unknown field "${at(key)}".` };
    }
  }
  for (const key of schema.required) {
    if (input[key] === undefined || input[key] === null) {
      return { ok: false, error: `Field "${at(key)}" is required.` };
    }
  }
  const clean: ToolInput = {};
  for (const [key, property] of Object.entries(schema.properties)) {
    if (input[key] === undefined || input[key] === null) {
      continue;
    }
    const checked = checkValue(at(key), property, input[key]);
    if (!checked.ok) {
      return checked;
    }
    clean[key] = checked.value;
  }
  return { ok: true, input: clean };
}

/** Checks a tool call's input against its schema; nothing runs on input that fails. */
export function validateInput(name: ToolName, input: unknown): Validation {
  return checkObject(TOOL_SCHEMAS[name], input);
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
