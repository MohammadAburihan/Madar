import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OWN_SALES_ONLY } from '../../../core/auth/persona';
import { CustomerDirectoryService } from '../../../core/customers/customer-directory.service';
import { PartyBalancesService } from '../../../core/customers/party-balances.service';
import { newReference } from '../../../core/erpnext/confirmation';
import { ErpnextClient, Field, Filter } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { round2, westernDigits } from '../../../core/format/number';
import { BuyingPricesService } from '../../../core/pricing/buying-prices.service';
import { SellingPricesService } from '../../../core/pricing/selling-prices.service';
import {
  CANDIDATE_CAP,
  Candidates,
  candidatePatterns,
  candidatesOf,
  rankSimilar,
  sameName,
  findSameSpelled,
} from '../../../core/util/fuzzy-match';
import { SupplierDirectoryService } from '../../../core/suppliers/supplier-directory.service';
import { WarehouseDirectoryService } from '../../../core/stock/warehouse-directory.service';
import { lineRate, mergeLines } from '../../../core/tasks/prefill-lines';
import { PrefillLine, PrefillRequest } from '../../../core/tasks/task-prefill.service';
import {
  ChoiceOption,
  NotFoundFailure,
  Proposal,
  ProposalLine,
  RecordKind,
  ToolFailure,
  ToolFound,
  ToolScope,
} from './assistant.models';
import { RecordKindName, ToolInput, ToolName, openableKinds } from './assistant-tools';

const MAX_OPTIONS = 5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WALK_IN = /^walk[\s-]?in(\s+customer)?$/i;

class NeedsChoice extends Error {
  constructor(
    readonly field: string,
    readonly query: string,
    readonly options: ChoiceOption[],
    readonly why: 'several' | 'close' | 'exists' = 'several',
    readonly canCreate: boolean | null = null,
  ) {
    super(`Needs a choice: ${field}`);
  }
}

interface ItemRow {
  name: string;
  item_name: string;
  stock_uom: string;
  is_stock_item: number;
  disabled: number;
  is_sales_item: number;
  is_purchase_item: number;
}

type ItemUse = 'sell' | 'buy' | 'stock';
interface Party {
  id: string;
  name: string;
}

type Similar = { near: Party[]; capped: boolean };

const ITEM_FIELDS = [
  'name',
  'item_name',
  'stock_uom',
  'is_stock_item',
  'disabled',
  'is_sales_item',
  'is_purchase_item',
];

type DocKind = 'invoice' | 'quotation' | 'sales_order' | 'purchase_order';

const DOCUMENTS: Record<DocKind, { doctype: string; kind: RecordKind; sales: boolean }> = {
  invoice: { doctype: 'Sales Invoice', kind: 'invoice', sales: true },
  quotation: { doctype: 'Quotation', kind: 'quotation', sales: true },
  sales_order: { doctype: 'Sales Order', kind: 'salesOrder', sales: true },
  purchase_order: { doctype: 'Purchase Order', kind: 'purchaseOrder', sales: false },
};

/** A choice label for a repeated name, `Lina Haddad (C-2)`, split back into the name and the id it was made from. */
function labelParts(text: string): { name: string; id: string } | null {
  const match = /^(.*\S)\s+\(([^()]+)\)$/.exec(text.trim());
  return match ? { name: match[1], id: match[2].trim() } : null;
}

const SIMILAR_NAMES_NOTE = 'Similar names exist; check the list before saving';

const tooMany = (field: string, query: string) =>
  `too many ${field} names look like "${query}": ask the user for more of the name`;
const like = (term: string) => `%${term.trim()}%`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const money = (currency: string, amount: number) => `${currency} ${amount.toFixed(2)}`;
const forbiddenAsNull = (error: unknown): null => {
  if (ErpnextError.from(error).kind === 'forbidden') {
    return null;
  }
  throw error;
};

/** Options a person can tell apart: a name that repeats gets its id after it. */
function optionsOf(rows: { id: string; name: string }[]): ChoiceOption[] {
  return rows.slice(0, MAX_OPTIONS).map((row) => ({
    id: row.id,
    label:
      rows.filter((other) => same(other.name, row.name)).length > 1
        ? `${row.name} (${row.id})`
        : row.name,
  }));
}

/**
 * Prepares what the assistant proposes: finds the records its words name (an exact id or name first, then a limited
 * search), and builds a proposal for the user to open in the normal task. Nothing is written to ERPNext.
 */
@Injectable({ providedIn: 'root' })
export class AssistantProposalsService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly customers = inject(CustomerDirectoryService);
  private readonly suppliers = inject(SupplierDirectoryService);
  private readonly balances = inject(PartyBalancesService);
  private readonly sellingPrices = inject(SellingPricesService);
  private readonly buyingPrices = inject(BuyingPricesService);
  private readonly warehouses = inject(WarehouseDirectoryService);

  async run(name: ToolName, input: ToolInput, scope: ToolScope): Promise<ToolFound> {
    try {
      switch (name) {
        case 'propose_quick_sale':
          return await this.quickSale(input, scope);
        case 'propose_quotation':
          return await this.quotation(input, scope);
        case 'propose_purchase_order':
          return await this.purchaseOrder(input, scope);
        case 'propose_collect_payment':
          return await this.collectPayment(input, scope);
        case 'propose_stock_move':
          return await this.stockMove(input, scope);
        case 'propose_new_customer':
          return await this.newCustomer(input, scope);
        case 'propose_new_supplier':
          return await this.newSupplier(input, scope);
        case 'propose_new_item':
          return await this.newItem(input, scope);
        case 'open_record':
          return await this.openRecord(input, scope);
        default:
          throw new ToolFailure('not allowed for your role');
      }
    } catch (error) {
      if (error instanceof NeedsChoice) {
        return {
          payload: {
            needs_choice: true,
            ...(error.why === 'close' ? { did_you_mean: true } : {}),
            ...(error.why === 'exists' ? { already_exists: true } : {}),
            field: error.field,
            query: error.query,
            options: error.options,
            ...(error.canCreate !== null ? { can_create: error.canCreate } : {}),
          },
          listKey: null,
          records: [],
          choices:
            error.why === 'close'
              ? error.options.map((option) => ({ ...option, suggested: true }))
              : error.options,
        };
      }
      throw error;
    }
  }

  private async quickSale(input: ToolInput, scope: ToolScope): Promise<ToolFound> {
    const text = String(input['customer']).trim();
    const walkIn = WALK_IN.test(text);
    if (walkIn && !scope.caps.sellToWalkIn) {
      throw new ToolFailure('walk-in sales are not allowed for your role');
    }
    const customer = walkIn ? null : await this.customer(text, scope);
    const warehouse =
      typeof input['warehouse'] === 'string' && input['warehouse'].trim()
        ? await this.warehouse('warehouse', input['warehouse'], scope)
        : null;
    const lines = await this.itemLines(input, 'sell', scope);
    const priced = await this.selling(lines, scope);
    const proposal = this.proposal('quick_sale', {
      party: customer?.name ?? null,
      lines: priced.lines,
      total: priced.total,
      request: {
        kind: 'quick_sale',
        payload: {
          ...(customer ? { customer: customer.id } : { walkIn: true }),
          lines: priced.prefill,
          ...(warehouse ? { warehouse: warehouse.id } : {}),
        },
      },
    });
    const to = customer?.name ?? 'a walk-in customer';
    return this.proposed(
      proposal,
      `Sale to ${to}: ${this.describe(priced.lines, scope.currency)}. Total ${money(scope.currency, priced.total ?? 0)}.`,
      priced.notes,
    );
  }

  private async quotation(input: ToolInput, scope: ToolScope): Promise<ToolFound> {
    const text = String(input['customer']).trim();
    if (WALK_IN.test(text)) {
      throw new ToolFailure('a quotation needs a named customer, not a walk-in');
    }
    const customer = await this.customer(text, scope);
    const lines = await this.itemLines(input, 'sell', scope);
    const priced = await this.selling(lines, scope);
    const proposal = this.proposal('quotation', {
      party: customer.name,
      lines: priced.lines,
      total: priced.total,
      request: {
        kind: 'quotation',
        payload: { customer: customer.id, lines: priced.prefill },
      },
    });
    return this.proposed(
      proposal,
      `Quotation for ${customer.name}: ${this.describe(priced.lines, scope.currency)}. Total ${money(scope.currency, priced.total ?? 0)}.`,
      priced.notes,
    );
  }

  private async purchaseOrder(input: ToolInput, scope: ToolScope): Promise<ToolFound> {
    const supplier = await this.supplier(String(input['supplier']), scope);
    const lines = await this.itemLines(input, 'buy', scope);
    const notes: string[] = [];
    const date = scope.today;
    const priceList = await this.buyingPrices.priceList().catch(() => null);
    const rows = await Promise.all(
      lines.map(async (line) => ({
        line,
        listed: await this.buyingPrices
          .rate(line.item.name, priceList, {
            company: scope.company,
            supplier: supplier.id,
            currency: scope.currency,
            date,
          })
          .catch(() => 0),
      })),
    );
    const shown: ProposalLine[] = [];
    const prefill: PrefillLine[] = [];
    for (const { line, listed } of rows) {
      const mayType = scope.caps.seeCosts;
      const rate = lineRate(
        { item_code: line.item.name, qty: line.qty, rate: line.rate },
        mayType,
        listed,
      );
      if (line.rate !== undefined && !mayType) {
        notes.push(
          `${line.item.item_name}: the proposed price was ignored; your role can't set prices.`,
        );
      }
      if (!rate) {
        notes.push(
          `${line.item.item_name}: no buying price is set; the order form will ask for it.`,
        );
      }
      shown.push({
        name: line.item.item_name,
        qty: line.qty,
        amount: rate ? round2(line.qty * rate) : null,
      });
      prefill.push({
        item_code: line.item.name,
        qty: line.qty,
        ...(line.rate !== undefined && mayType ? { rate: line.rate } : {}),
      });
    }
    const total = shown.every((l) => l.amount !== null)
      ? round2(shown.reduce((sum, l) => sum + (l.amount ?? 0), 0))
      : null;
    const proposal = this.proposal('purchase_order', {
      party: supplier.name,
      lines: shown,
      total,
      request: {
        kind: 'purchase_order',
        payload: { supplier: supplier.id, lines: prefill },
      },
    });
    return this.proposed(
      proposal,
      `Purchase from ${supplier.name}: ${this.describe(shown, scope.currency)}.${total === null ? '' : ` Total ${money(scope.currency, total)}.`}`,
      notes,
    );
  }

  private async collectPayment(input: ToolInput, scope: ToolScope): Promise<ToolFound> {
    const text = String(input['customer']).trim();
    if (WALK_IN.test(text)) {
      throw new ToolFailure('walk-in sales have nothing to collect later');
    }
    const customer = await this.customer(text, scope);
    const balances = await this.balances
      .outstanding(
        'Sales Invoice',
        'customer',
        [customer.id],
        { name: scope.company, currency: scope.currency },
        OWN_SALES_ONLY.includes(scope.persona) ? scope.userId : null,
      )
      .catch(forbiddenAsNull);
    const due = balances ? round2(balances.get(customer.id) ?? 0) : null;
    if (due !== null && due <= 0.005) {
      throw new ToolFailure(`nothing to collect: ${customer.name} has no unpaid invoices`);
    }
    const amount = typeof input['amount'] === 'number' ? round2(input['amount']) : null;
    if (amount !== null && due !== null && amount > due + 0.005) {
      throw new ToolFailure(
        `the amount is more than ${customer.name} owes: ${money(scope.currency, due)} outstanding`,
      );
    }
    const proposal = this.proposal('collect_payment', {
      party: customer.name,
      amount,
      due,
      request: {
        kind: 'collect_payment',
        payload: { customer: customer.id, ...(amount !== null ? { amount } : {}) },
      },
    });
    const owes = due === null ? '' : ` (${money(scope.currency, due)} outstanding)`;
    return this.proposed(
      proposal,
      `Payment from ${customer.name}${owes}: ${amount === null ? 'the full amount due' : money(scope.currency, amount)}.`,
      [],
    );
  }

  private async stockMove(input: ToolInput, scope: ToolScope): Promise<ToolFound> {
    const qty = Number(input['qty']);
    if (!Number.isInteger(qty)) {
      throw new ToolFailure('qty must be a whole number: stock moves whole units');
    }
    const item = await this.item(String(input['item']), 'stock', scope);
    const from = await this.optionalWarehouse('from', input['from'], scope);
    const to = await this.optionalWarehouse('to', input['to'], scope);
    if (from && to && from.id === to.id) {
      throw new ToolFailure('from and to are the same location');
    }
    const notes: string[] = [];
    if (from) {
      const bins = await this.erpnext
        .listAll<{ warehouse: string; actual_qty: number }>('Bin', {
          fields: ['warehouse', 'actual_qty'],
          filters: [
            ['item_code', '=', item.name],
            ['warehouse', '=', from.id],
          ],
        })
        .catch(forbiddenAsNull);
      const held = bins?.reduce((sum, bin) => sum + Number(bin.actual_qty), 0);
      if (held !== undefined && qty > held) {
        notes.push(`${from.name} holds only ${held}; the form will ask for a smaller quantity.`);
      }
    }
    const proposal = this.proposal('stock_move', {
      item: item.item_name,
      lines: [{ name: item.item_name, qty, amount: null }],
      from: from?.name ?? null,
      to: to?.name ?? null,
      request: {
        kind: 'stock_move',
        payload: {
          item_code: item.name,
          qty,
          ...(from ? { from_warehouse: from.id } : {}),
          ...(to ? { to_warehouse: to.id } : {}),
        },
      },
    });
    const route =
      from || to ? `: ${from?.name ?? 'any location'} to ${to?.name ?? 'any location'}` : '';
    return this.proposed(proposal, `Stock move of ${qty} × ${item.item_name}${route}.`, notes);
  }

  private async newCustomer(input: ToolInput, scope: ToolScope): Promise<ToolFound> {
    if (!scope.caps.editCustomers) {
      throw new ToolFailure('not allowed for your role');
    }
    const name = this.newName(input);
    if (WALK_IN.test(name)) {
      throw new ToolFailure('the Walk-in Customer already exists and is used for anonymous sales');
    }
    const exact = await this.customers.exact(name);
    this.guardDuplicate('customer', name, exact);
    const similar = await this.sameNameElsewhere('customer', name, () =>
      this.customers.spelledLike(name),
    );
    const payload = {
      name,
      ...this.contactFields(input),
      ...this.optionalText(input, 'address'),
    };
    return this.newProposal(
      'new_customer',
      name,
      { kind: 'new_customer', payload },
      'customer',
      [],
      similar,
    );
  }

  private async newSupplier(input: ToolInput, scope: ToolScope): Promise<ToolFound> {
    if (!scope.caps.addSuppliers) {
      throw new ToolFailure('not allowed for your role');
    }
    const name = this.newName(input);
    const exact = await this.suppliers.exact(name);
    this.guardDuplicate('supplier', name, exact);
    const similar = await this.sameNameElsewhere('supplier', name, () =>
      this.suppliers.spelledLike(name),
    );
    const payload = { name, ...this.contactFields(input) };
    return this.newProposal(
      'new_supplier',
      name,
      { kind: 'new_supplier', payload },
      'supplier',
      [],
      similar,
    );
  }

  private async newItem(input: ToolInput, scope: ToolScope): Promise<ToolFound> {
    if (!scope.caps.manageItems) {
      throw new ToolFailure('not allowed for your role');
    }
    const name = this.newName(input);
    const kind = input['kind'] === 'service' ? 'service' : 'product';
    const exact = await this.list<ItemRow>(
      'Item',
      ITEM_FIELDS,
      [['has_variants', '=', 0]],
      MAX_OPTIONS,
      {
        orFilters: [
          ['name', '=', westernDigits(name)],
          ['item_name', '=', name],
        ] as Filter[],
      },
    );
    this.guardDuplicate(
      'item',
      name,
      exact.map((row) => ({ id: row.name, name: row.item_name, disabled: !!row.disabled })),
    );
    const similar = await this.sameNameElsewhere('item', name, () => this.itemsSpelledLike(name));
    const notes: string[] = [];
    const price = typeof input['selling_price'] === 'number' ? input['selling_price'] : null;
    const mayPrice = scope.caps.setItemPrices;
    if (price !== null && !mayPrice) {
      notes.push("The selling price was ignored; your role can't set prices.");
    }
    const payload = { name, kind, ...(price !== null && mayPrice ? { price } : {}) } as const;
    return this.newProposal(
      'new_item',
      name,
      { kind: 'new_item', payload },
      'item',
      notes,
      similar,
    );
  }

  private newName(input: ToolInput): string {
    const name = String(input['name']).trim();
    if (!name) {
      throw new ToolFailure('a name is needed');
    }
    return name;
  }

  private optionalText(input: ToolInput, key: string): Record<string, string> {
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    return value ? { [key]: value } : {};
  }

  private contactFields(input: ToolInput): Record<string, string> {
    const email = this.optionalText(input, 'email');
    if (email['email'] && !EMAIL.test(email['email'])) {
      throw new ToolFailure(`the email address isn't valid: ${email['email']}`);
    }
    return { ...this.optionalText(input, 'phone'), ...email };
  }

  /** A record already has this exact name: the user picks it, or learns it is disabled; nothing new is proposed. */
  private guardDuplicate(
    field: string,
    name: string,
    exact: (Party & { disabled: boolean })[],
  ): void {
    const live = exact.filter((row) => !row.disabled);
    if (live.length) {
      throw new NeedsChoice(field, name, optionsOf(live), 'exists');
    }
    if (exact.length) {
      throw new ToolFailure(`${field} is disabled: ${exact[0].name}`);
    }
  }

  /**
   * The same name spelt with other case, spaces, punctuation or Arabic letter variants is still the same record,
   * disabled or not. Answers whether so many similar names exist that the read could not rule a duplicate out.
   */
  private async sameNameElsewhere(
    field: string,
    name: string,
    find: () => Promise<Candidates<Party & { disabled: boolean }>>,
  ): Promise<boolean> {
    const { rows, capped } = await find();
    const same = rows.filter((row) => sameName(row.name, name));
    const live = same.filter((row) => !row.disabled);
    if (live.length) {
      throw new NeedsChoice(field, name, optionsOf(live), 'exists');
    }
    if (same.length) {
      throw new ToolFailure(`${field} is disabled: ${same[0].name}`);
    }
    return capped;
  }

  private newProposal(
    kind: 'new_customer' | 'new_supplier' | 'new_item',
    name: string,
    request: PrefillRequest,
    what: string,
    notes: string[] = [],
    similar = false,
  ): ToolFound {
    const proposal = this.proposal(kind, {
      party: name,
      request,
      ...(similar ? { similarNames: true } : {}),
    });
    return this.proposed(
      proposal,
      `New ${what}: ${name}. Nothing is saved until the user reviews and saves it.`,
      notes,
      similar ? SIMILAR_NAMES_NOTE : undefined,
    );
  }

  private async openRecord(input: ToolInput, scope: ToolScope): Promise<ToolFound> {
    const kind = String(input['kind']) as RecordKindName;
    const text = String(input['name']).trim();
    if (!openableKinds(scope.caps).includes(kind)) {
      throw new ToolFailure('not allowed for your role');
    }
    const record = await this.record(kind, text, scope);
    const proposal: Proposal = {
      ...this.blank('open_record'),
      party: record.label,
      record,
    };
    const confirmed =
      record.kind === 'invoice' ||
      record.kind === 'quotation' ||
      record.kind === 'salesOrder' ||
      record.kind === 'purchaseOrder';
    const note = record.draft
      ? 'It is a draft: its page has Continue and Delete.'
      : confirmed
        ? "It is confirmed: cancelling or amending isn't available in Madar yet."
        : 'Its page has the details and the actions the user may take.';
    return this.proposed(proposal, `${record.label} is ready to open. ${note}`, []);
  }

  private async record(
    kind: RecordKindName,
    text: string,
    scope: ToolScope,
  ): Promise<NonNullable<Proposal['record']>> {
    switch (kind) {
      case 'customer': {
        const customer = await this.customer(text, scope, true);
        return { kind: 'customer', id: customer.id, label: customer.name, draft: false };
      }
      case 'supplier': {
        const supplier = await this.supplier(text, scope, true);
        return { kind: 'supplier', id: supplier.id, label: supplier.name, draft: false };
      }
      case 'item': {
        const item = await this.item(text, 'any', scope);
        return { kind: 'item', id: item.name, label: item.item_name, draft: false };
      }
      case 'draft':
        return this.draftRecord(text, scope);
      default: {
        const found = await this.document(DOCUMENTS[kind as DocKind], text, scope, [0, 1]);
        if (!found) {
          throw new ToolFailure(`not found: ${kind.replace('_', ' ')} "${text}"`);
        }
        return {
          kind: DOCUMENTS[kind as DocKind].kind,
          id: found.name,
          label: found.name,
          draft: found.docstatus === 0,
        };
      }
    }
  }

  private async draftRecord(
    text: string,
    scope: ToolScope,
  ): Promise<NonNullable<Proposal['record']>> {
    const kinds: DocKind[] = [
      ...(scope.caps.sell ? (['invoice', 'quotation', 'sales_order'] as const) : []),
      ...(scope.caps.orderPurchases ? (['purchase_order'] as const) : []),
    ];
    for (const kind of kinds) {
      const found = await this.document(DOCUMENTS[kind], text, scope, [0]);
      if (found) {
        return { kind: DOCUMENTS[kind].kind, id: found.name, label: found.name, draft: true };
      }
    }
    throw new ToolFailure(`not found: draft "${text}"`);
  }

  private async document(
    spec: { doctype: string; sales: boolean },
    name: string,
    scope: ToolScope,
    statuses: number[],
  ): Promise<{ name: string; docstatus: number } | null> {
    const own: Filter[] =
      spec.sales && OWN_SALES_ONLY.includes(scope.persona) ? [['owner', '=', scope.userId]] : [];
    const [row] = await this.list<{ name: string; docstatus: number }>(
      spec.doctype,
      ['name', 'docstatus'],
      [['name', '=', name], ['company', '=', scope.company], ['docstatus', 'in', statuses], ...own],
      1,
    );
    return row ?? null;
  }

  private async customer(text: string, scope: ToolScope, allowDisabled = false): Promise<Party> {
    const label = labelParts(text);
    const tagged = label
      ? (await this.customers.exact(label.id)).filter(
          (c) => c.id === label.id && same(c.name, label.name),
        )
      : [];
    const exact = tagged.length ? tagged : await this.customers.exact(text);
    const usable = allowDisabled ? exact : exact.filter((c) => !c.disabled);
    if (exact.length && !usable.length) {
      throw new ToolFailure(`customer is disabled: ${exact[0].name}`);
    }
    if (usable.length > 1) {
      throw new NeedsChoice('customer', text, optionsOf(usable));
    }
    if (usable.length === 1) {
      return usable[0];
    }
    const found = await this.customers.find(text, MAX_OPTIONS + 1);
    return this.only('customer', text, found, scope, async () => {
      const { rows, capped } = await this.customers.candidates(text);
      return { near: rankSimilar(text, rows, (c) => c.name), capped };
    });
  }

  private async supplier(text: string, scope: ToolScope, allowDisabled = false): Promise<Party> {
    const label = labelParts(text);
    const tagged = label
      ? (await this.suppliers.exact(label.id)).filter(
          (s) => s.id === label.id && same(s.name, label.name),
        )
      : [];
    const exact = tagged.length ? tagged : await this.suppliers.exact(text);
    const usable = allowDisabled ? exact : exact.filter((s) => !s.disabled);
    if (exact.length && !usable.length) {
      throw new ToolFailure(`supplier is disabled: ${exact[0].name}`);
    }
    if (usable.length > 1) {
      throw new NeedsChoice('supplier', text, optionsOf(usable));
    }
    if (usable.length === 1) {
      return usable[0];
    }
    const term = text.trim().toLowerCase();
    const all = await this.suppliers.list();
    const found = all.filter(
      (s) => s.name.toLowerCase().includes(term) || s.id.toLowerCase().includes(term),
    );
    return this.only('supplier', text, found, scope, async () => ({
      near: rankSimilar(text, all, (s) => s.name),
      capped: false,
    }));
  }

  private async only(
    field: string,
    query: string,
    found: Party[],
    scope: ToolScope,
    similar: () => Promise<Similar>,
  ): Promise<Party> {
    if (found.length > 1) {
      throw new NeedsChoice(field, query, optionsOf(found));
    }
    if (found.length) {
      return found[0];
    }
    return this.miss(field, query, scope, similar);
  }

  /** Whether the user may add this kind of record as new; null for kinds that can't be added. */
  private mayCreate(field: string, scope: ToolScope): boolean | null {
    return field === 'customer'
      ? scope.caps.editCustomers
      : field === 'supplier'
        ? scope.caps.addSuppliers
        : field === 'item'
          ? scope.caps.manageItems
          : null;
  }

  /**
   * Nothing matched: close names to pick from, else not found, saying whether the user may add it as new. A read
   * that hit its cap proves nothing about a missing name, so it asks for more of the name instead.
   */
  private async miss(
    field: string,
    query: string,
    scope: ToolScope,
    similar: () => Promise<Similar>,
  ): Promise<never> {
    const { near, capped } = await similar();
    const creatable = this.mayCreate(field, scope);
    if (near.length) {
      throw new NeedsChoice(
        field,
        query,
        optionsOf(near),
        'close',
        creatable === null ? null : creatable && !capped,
      );
    }
    if (capped) {
      throw new NotFoundFailure(tooMany(field, query), {
        not_found: true,
        too_many: true,
        field,
        query,
      });
    }
    const message = `not found: ${field} "${query}"`;
    if (creatable === null) {
      throw new ToolFailure(message);
    }
    throw new NotFoundFailure(message, { not_found: true, field, query, can_create: creatable });
  }

  private async item(text: string, use: ItemUse | 'any', scope: ToolScope): Promise<ItemRow> {
    const term = text.trim();
    const eligible = (row: ItemRow) =>
      use === 'any' ||
      (use === 'sell'
        ? !!row.is_sales_item
        : use === 'buy'
          ? !!row.is_purchase_item
          : !!row.is_stock_item);
    const label = labelParts(term);
    const tagged = label
      ? (
          await this.list<ItemRow>(
            'Item',
            ITEM_FIELDS,
            [
              ['has_variants', '=', 0],
              ['name', '=', westernDigits(label.id)],
            ],
            1,
          )
        ).filter((row) => same(row.item_name, label.name))
      : [];
    const exact = tagged.length
      ? tagged
      : await this.list<ItemRow>('Item', ITEM_FIELDS, [['has_variants', '=', 0]], MAX_OPTIONS, {
          orFilters: [
            ['name', '=', westernDigits(term)],
            ['item_name', '=', term],
          ] as Filter[],
        });
    const usable = exact.filter((row) => (!row.disabled || use === 'any') && eligible(row));
    if (exact.length && !usable.length) {
      const [row] = exact;
      throw new ToolFailure(
        row.disabled
          ? `item is disabled: ${row.item_name}`
          : use === 'sell'
            ? `item can't be sold: ${row.item_name}`
            : use === 'buy'
              ? `item can't be bought: ${row.item_name}`
              : `item isn't a stock item: ${row.item_name}`,
      );
    }
    if (usable.length > 1) {
      throw new NeedsChoice('item', term, this.itemOptions(usable));
    }
    if (usable.length === 1) {
      return usable[0];
    }
    const flag =
      use === 'sell'
        ? 'is_sales_item'
        : use === 'buy'
          ? 'is_purchase_item'
          : use === 'stock'
            ? 'is_stock_item'
            : null;
    const found = await this.list<ItemRow>(
      'Item',
      ITEM_FIELDS,
      [
        ...(use === 'any' ? [] : ([['disabled', '=', 0]] as Filter[])),
        ['has_variants', '=', 0],
        ...(flag ? ([[flag, '=', 1]] as Filter[]) : []),
      ],
      MAX_OPTIONS + 1,
      {
        orFilters: [
          ['item_code', 'like', like(westernDigits(term))],
          ['item_name', 'like', like(term)],
        ] as Filter[],
        orderBy: 'item_name asc, name asc',
      },
    );
    if (found.length > 1) {
      throw new NeedsChoice('item', term, this.itemOptions(found));
    }
    if (found.length === 1) {
      return found[0];
    }
    return this.miss('item', term, scope, async () => {
      const { rows, capped } = await this.itemCandidates(term, flag);
      return {
        near: rankSimilar(term, rows, (row) => row.item_name).map((row) => ({
          id: row.name,
          name: row.item_name,
        })),
        capped,
      };
    });
  }

  private async itemCandidates(
    term: string,
    flag: string | null,
  ): Promise<Candidates<{ name: string; item_name: string }>> {
    const patterns = candidatePatterns(term);
    if (!patterns.length) {
      return { rows: [], capped: false };
    }
    return candidatesOf(
      await this.erpnext.listAll<{ name: string; item_name: string }>(
        'Item',
        {
          fields: ['name', 'item_name'],
          filters: [
            ['disabled', '=', 0],
            ['has_variants', '=', 0],
            ...(flag ? ([[flag, '=', 1]] as Filter[]) : []),
          ],
          orFilters: patterns.map((pattern) => ['item_name', 'like', pattern] as Filter),
        },
        CANDIDATE_CAP + 1,
      ),
    );
  }

  private itemsSpelledLike(term: string): Promise<Candidates<Party & { disabled: boolean }>> {
    return findSameSpelled(term, async (patterns, limit) => {
      const rows = await this.erpnext.listAll<{
        name: string;
        item_name: string;
        disabled: number;
      }>(
        'Item',
        {
          fields: ['name', 'item_name', 'disabled'],
          filters: [['has_variants', '=', 0]],
          orFilters: patterns.map((pattern) => ['item_name', 'like', pattern] as Filter),
        },
        limit,
      );
      return rows.map((r) => ({ id: r.name, name: r.item_name, disabled: !!r.disabled }));
    });
  }

  private itemOptions(rows: ItemRow[]): ChoiceOption[] {
    return optionsOf(rows.map((row) => ({ id: row.name, name: row.item_name })));
  }

  private async itemLines(
    input: ToolInput,
    use: ItemUse,
    scope: ToolScope,
  ): Promise<{ item: ItemRow; qty: number; rate?: number }[]> {
    const entries = input['items'] as ToolInput[];
    const lines: { item: ItemRow; qty: number; rate?: number }[] = [];
    for (const entry of entries) {
      const item = await this.item(String(entry['item']), use, scope);
      lines.push({
        item,
        qty: Number(entry['qty']),
        ...(typeof entry['rate'] === 'number' ? { rate: entry['rate'] } : {}),
      });
    }
    const merged = mergeLines(
      lines.map((l) => ({
        item_code: l.item.name,
        qty: l.qty,
        ...(l.rate !== undefined ? { rate: l.rate } : {}),
      })),
    );
    return merged.map((m) => {
      const first = lines.find((l) => l.item.name === m.item_code)!;
      return { item: first.item, qty: m.qty, ...(m.rate !== undefined ? { rate: m.rate } : {}) };
    });
  }

  private async optionalWarehouse(field: string, value: unknown, scope: ToolScope) {
    return typeof value === 'string' && value.trim() ? this.warehouse(field, value, scope) : null;
  }

  private async warehouse(field: string, text: string, scope: ToolScope): Promise<Party> {
    const term = text.trim();
    const all = await this.warehouses.list(scope.company);
    const label = labelParts(term);
    const tagged = label
      ? all.find((w) => same(w.id, label.id) && same(w.name, label.name))
      : undefined;
    if (tagged) {
      return tagged;
    }
    const exact = all.filter((w) => same(w.id, term) || same(w.name, term));
    if (exact.length === 1) {
      return exact[0];
    }
    const found = exact.length
      ? exact
      : all.filter(
          (w) =>
            w.name.toLowerCase().includes(term.toLowerCase()) ||
            w.id.toLowerCase().includes(term.toLowerCase()),
        );
    return this.only(field, term, found, scope, async () => ({
      near: rankSimilar(term, all, (w) => w.name),
      capped: false,
    }));
  }

  private async selling(lines: { item: ItemRow; qty: number; rate?: number }[], scope: ToolScope) {
    const prices = await this.sellingPrices
      .prices(
        lines.map((l) => ({ name: l.item.name, stock_uom: l.item.stock_uom })),
        scope.company,
        scope.today,
      )
      .catch(forbiddenAsNull);
    const notes: string[] = [];
    const shown: ProposalLine[] = [];
    const prefill: PrefillLine[] = [];
    for (const line of lines) {
      const listed = prices?.get(line.item.name) ?? 0;
      const mayType = scope.caps.editPrice;
      const rate = lineRate(
        { item_code: line.item.name, qty: line.qty, rate: line.rate },
        mayType,
        listed,
      );
      if (line.rate !== undefined && !mayType) {
        notes.push(
          `${line.item.item_name}: the proposed price was ignored; your role can't set prices.`,
        );
      }
      if (!prices) {
        notes.push(`${line.item.item_name}: prices aren't available for your role.`);
      } else if (!rate) {
        notes.push(`${line.item.item_name}: no selling price is set.`);
      }
      const typed = line.rate !== undefined && mayType;
      shown.push({
        name: line.item.item_name,
        qty: line.qty,
        amount: typed || listed > 0 ? round2(line.qty * rate) : null,
      });
      prefill.push({
        item_code: line.item.name,
        qty: line.qty,
        ...(line.rate !== undefined && mayType ? { rate: line.rate } : {}),
      });
    }
    const total = shown.every((l) => l.amount !== null)
      ? round2(shown.reduce((sum, l) => sum + (l.amount ?? 0), 0))
      : null;
    return { lines: shown, prefill, notes, total };
  }

  private describe(lines: ProposalLine[], currency: string): string {
    return lines
      .map(
        (l) => `${l.qty} × ${l.name}${l.amount === null ? '' : ` (${money(currency, l.amount)})`}`,
      )
      .join(', ');
  }

  private blank(kind: Proposal['kind']): Proposal {
    return {
      id: newReference('PRP'),
      kind,
      party: null,
      item: null,
      lines: [],
      total: null,
      amount: null,
      due: null,
      from: null,
      to: null,
      record: null,
      request: null,
    };
  }

  private proposal(kind: Proposal['kind'], fields: Partial<Proposal>): Proposal {
    return { ...this.blank(kind), ...fields };
  }

  private proposed(proposal: Proposal, summary: string, notes: string[], note?: string): ToolFound {
    return {
      payload: {
        proposal_id: proposal.id,
        summary,
        ...(notes.length ? { notes } : {}),
        ...(note ? { note } : {}),
      },
      listKey: null,
      records: [],
      proposals: [proposal],
    };
  }

  private list<T>(
    doctype: string,
    fields: Field[],
    filters: Filter[],
    limit: number,
    extra: { orFilters?: Filter[]; orderBy?: string } = {},
  ): Promise<T[]> {
    return firstValueFrom(this.erpnext.list<T>(doctype, { fields, filters, limit, ...extra }));
  }
}
