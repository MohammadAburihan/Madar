import type Anthropic from '@anthropic-ai/sdk';

type ToolDef = Omit<Anthropic.Tool, 'name'>;

const limit = (max: number, fallback: number) => ({
  type: 'integer',
  description: `How many to return, 1 to ${max}. Defaults to ${fallback}.`,
});

const lineItems = (what: string) => ({
  type: 'array',
  description: `The ${what}, 1 to 20 lines. Each line is an item by name or code with a quantity above 0 and up to 10000. Only give a price when the user stated one.`,
  items: {
    type: 'object',
    properties: {
      item: { type: 'string', description: 'The item name or code.' },
      qty: { type: 'number', description: 'How many, more than 0 and up to 10000.' },
      rate: { type: 'number', description: 'The unit price, only if the user stated one.' },
    },
    required: ['item', 'qty'],
    additionalProperties: false,
  },
});

const RECORD_KINDS = [
  'invoice',
  'quotation',
  'sales_order',
  'purchase_order',
  'customer',
  'supplier',
  'item',
  'draft',
];

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
  propose_quick_sale: {
    description:
      'Prepares a sale for the user to review and confirm in Madar. Nothing is saved by this call: it returns a card with a button that opens the sale filled in. If a name matches several records the result asks which one is meant; ask the user and call again with their answer.',
    input_schema: {
      type: 'object',
      properties: {
        customer: {
          type: 'string',
          description:
            'The customer name or id, or "walk-in" for a customer who is not on file. Optional when a project is given.',
        },
        items: lineItems('items to sell'),
        warehouse: {
          type: 'string',
          description: 'The warehouse to sell from, only if the user named one.',
        },
        project: {
          type: 'string',
          description:
            "A customer project name or id, only if the user is selling to a project. The sale is billed to that project and goes to the project's customer, so customer may be left out.",
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    strict: true,
  },
  propose_quotation: {
    description:
      'Prepares a quotation for the user to review and confirm in Madar. Nothing is saved by this call: it returns a card with a button that opens the quotation filled in. If a name matches several records the result asks which one is meant; ask the user and call again with their answer.',
    input_schema: {
      type: 'object',
      properties: {
        customer: { type: 'string', description: 'The customer name or id.' },
        items: lineItems('items to quote'),
      },
      required: ['customer', 'items'],
      additionalProperties: false,
    },
    strict: true,
  },
  propose_purchase_order: {
    description:
      'Prepares a purchase order for the user to review and confirm in Madar. Nothing is saved by this call: it returns a card with a button that opens the order filled in. If a name matches several records the result asks which one is meant; ask the user and call again with their answer.',
    input_schema: {
      type: 'object',
      properties: {
        supplier: { type: 'string', description: 'The supplier name or id.' },
        items: lineItems('items to buy'),
      },
      required: ['supplier', 'items'],
      additionalProperties: false,
    },
    strict: true,
  },
  propose_collect_payment: {
    description:
      'Prepares collecting a payment from a customer for the user to review and confirm in Madar. Nothing is saved by this call: it returns a card with a button that opens the payment filled in. Without an amount the full amount due is proposed.',
    input_schema: {
      type: 'object',
      properties: {
        customer: { type: 'string', description: 'The customer name or id.' },
        amount: {
          type: 'number',
          description: 'How much to collect, more than 0, only if the user stated an amount.',
        },
      },
      required: ['customer'],
      additionalProperties: false,
    },
    strict: true,
  },
  propose_stock_move: {
    description:
      'Prepares moving stock of one item between two locations for the user to review and confirm in Madar. Nothing is saved by this call: it returns a card with a button that opens the move filled in.',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'The item name or code.' },
        qty: {
          type: 'number',
          description: 'How many units to move: a whole number above 0, up to 10000.',
        },
        from: {
          type: 'string',
          description: 'The location to move from, only if the user named one.',
        },
        to: { type: 'string', description: 'The location to move to, only if the user named one.' },
      },
      required: ['item', 'qty'],
      additionalProperties: false,
    },
    strict: true,
  },
  propose_new_customer: {
    description:
      'Prepares adding a new customer for the user to review and save in the normal form. Use it only when a customer lookup said can_create and the user wants the customer added; never for a name that was only misspelt. Nothing is saved by this call: it returns a card with a button that opens the new-customer form filled in.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The customer name as the user said it.' },
        phone: { type: 'string', description: 'The phone number, only if the user gave one.' },
        email: { type: 'string', description: 'The email address, only if the user gave one.' },
        address: {
          type: 'string',
          description: 'The address, up to 200 characters, only if the user gave one.',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
    strict: true,
  },
  propose_new_supplier: {
    description:
      'Prepares adding a new supplier for the user to review and save in the normal form. Use it only when a supplier lookup said can_create and the user wants the supplier added; never for a name that was only misspelt. Nothing is saved by this call: it returns a card with a button that opens the new-supplier form filled in.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The supplier name as the user said it.' },
        phone: { type: 'string', description: 'The phone number, only if the user gave one.' },
        email: { type: 'string', description: 'The email address, only if the user gave one.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    strict: true,
  },
  propose_new_item: {
    description:
      'Prepares adding a new item or service for the user to review and save in the normal form. Use it only when an item lookup said can_create and the user wants it added; never for a name that was only misspelt. Nothing is saved by this call: it returns a card with a button that opens the new-item form filled in.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The item name as the user said it.' },
        kind: {
          type: 'string',
          enum: ['product', 'service'],
          description: 'A product that is stocked and sold, or a service.',
        },
        selling_price: {
          type: 'number',
          description: 'The selling price, more than 0, only if the user stated one.',
        },
      },
      required: ['name', 'kind'],
      additionalProperties: false,
    },
    strict: true,
  },
  open_record: {
    description:
      "Gives the user a button that opens a record's page in Madar. Use it when the user wants to edit or delete something: a draft's page has Continue and Delete; a confirmed record cannot be cancelled or amended in Madar yet, so say so. Nothing is changed by this call.",
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: RECORD_KINDS,
          description:
            'What kind of record it is. Use draft for an unfinished document of any kind.',
        },
        name: {
          type: 'string',
          description:
            'The record id such as SI-1042, or the name for a customer, supplier or item.',
        },
      },
      required: ['kind', 'name'],
      additionalProperties: false,
    },
    strict: true,
  },
};

export function selectTools(names: readonly string[]): Anthropic.Tool[] {
  const unique = [...new Set(names)].filter((name) => Object.hasOwn(toolRegistry, name));
  return unique.map((name): Anthropic.Tool => ({ name, ...toolRegistry[name]! }));
}
