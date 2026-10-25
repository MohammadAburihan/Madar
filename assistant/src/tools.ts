import type Anthropic from '@anthropic-ai/sdk';

type ToolDef = Omit<Anthropic.Tool, 'name'>;

const limit = (max: number, fallback: number) => ({
  type: 'integer',
  description: `How many to return, 1 to ${max}. Defaults to ${fallback}.`,
});

export const toolRegistry: Record<string, ToolDef> = {
  get_today_summary: {
    description:
      "Returns the business's confirmed sales total and count for today and the amount customers still owe, in the business currency.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  search_customers: {
    description:
      'Finds customers by name or phone and returns their phone and what each still owes, in the business currency.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of the customer name or phone number.' },
        limit: limit(10, 5),
      },
      required: ['query'],
      additionalProperties: false,
    },
    strict: true,
  },
  search_items: {
    description:
      'Finds items and services by name or code and returns their stock in each warehouse and their selling price. Buying cost is included only when the user may see it.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of the item name or code.' },
        limit: limit(10, 5),
      },
      required: ['query'],
      additionalProperties: false,
    },
    strict: true,
  },
  find_invoices: {
    description:
      'Lists sales invoices, newest first, with customer, date, total and amount still due. Drafts are flagged. Filter by customer, by unpaid only, or by date range.',
    input_schema: {
      type: 'object',
      properties: {
        customer: { type: 'string', description: 'Part of the customer name.' },
        unpaid_only: {
          type: 'boolean',
          description: 'Only confirmed invoices with an amount due.',
        },
        from: { type: 'string', format: 'date', description: 'First invoice date, YYYY-MM-DD.' },
        to: { type: 'string', format: 'date', description: 'Last invoice date, YYYY-MM-DD.' },
        limit: limit(20, 10),
      },
      additionalProperties: false,
    },
    strict: true,
  },
  get_invoice: {
    description:
      'Returns one sales invoice by its exact name (for example SI-1042) with its lines, totals and payment status.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The invoice name, such as SI-1042.' } },
      required: ['name'],
      additionalProperties: false,
    },
    strict: true,
  },
  list_drafts: {
    description:
      'Lists the unfinished documents (drafts) the user can continue: sales, orders, quotations and purchase orders.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  find_purchase_orders: {
    description:
      'Lists confirmed purchase orders, newest first, with supplier, dates and how much has arrived. Order values are included only when the user may see them.',
    input_schema: {
      type: 'object',
      properties: {
        supplier: { type: 'string', description: 'Part of the supplier name.' },
        open_only: {
          type: 'boolean',
          description: 'Only orders whose goods have not all arrived and that are not closed.',
        },
        limit: limit(20, 10),
      },
      additionalProperties: false,
    },
    strict: true,
  },
};

export function selectTools(names: readonly string[]): Anthropic.Tool[] {
  const unique = [...new Set(names)].filter((name) => Object.hasOwn(toolRegistry, name));
  return unique.map((name): Anthropic.Tool => ({ name, ...toolRegistry[name]! }));
}
