import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Business } from '../../../core/business/business.service';
import { confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { invoiceTotal } from '../../../core/erpnext/invoice-total';
import { round2 } from '../../../core/format/number';
import { temporaryOpeningAccount } from '../../../core/money/opening-account';
import { ContactKind } from './contacts.models';

/** Why an opening balance can't be recorded for this contact right now. */
export type OpeningBlock = 'disabled' | 'currency' | 'setup' | 'missing';

/** What the task needs from ERPNext before it can offer the form. */
export interface OpeningTarget {
  id: string;
  name: string;
  blocked: OpeningBlock | null;
  /** The company's Temporary Opening account and default cost center; empty while blocked by setup. */
  account: string;
  costCenter: string;
  uom: string;
}

export interface OpeningRequest {
  reference: string;
  kind: ContactKind;
  party: string;
  company: string;
  currency: string;
  amount: number;
  /** The posting and due date, `YYYY-MM-DD`. */
  date: string;
  note: string;
  itemName: string;
  account: string;
  costCenter: string;
  uom: string;
}

export interface OpeningResult {
  /** The opening invoice's name. */
  name: string;
  /** What ERPNext posted, in the company currency. */
  total: number;
}

interface InvoiceDoc {
  name: string;
  docstatus: number;
  is_opening?: string;
  customer?: string;
  supplier?: string;
  grand_total: number;
  rounded_total?: number | null;
  [key: string]: unknown;
}

const doctypeOf = (kind: ContactKind) =>
  kind === 'customers' ? 'Sales Invoice' : 'Purchase Invoice';

const partyField = (kind: ContactKind) => (kind === 'customers' ? 'customer' : 'supplier');

const referenceLine = (reference: string) => `Madar opening balance ${reference}`;

/**
 * Opening balances: what a customer owed or the business owed a supplier before Madar, posted the way ERPNext's
 * Opening Invoice Creation Tool does it, so the amount is owed but never counts as a sale or an expense.
 */
@Injectable({ providedIn: 'root' })
export class OpeningBalanceApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Reads the contact and the business setup. Writes nothing, so any failure here is definite. */
  async target(kind: ContactKind, id: string, business: Business): Promise<OpeningTarget> {
    const partyType = kind === 'customers' ? 'Customer' : 'Supplier';
    const empty = { id, name: id, account: '', costCenter: '', uom: 'Nos' };
    let party: { name: string; disabled: number; default_currency?: string | null } & Record<
      string,
      unknown
    >;
    try {
      party = await firstValueFrom(this.erpnext.doc(partyType, id));
    } catch (error) {
      const e = ErpnextError.from(error);
      if (e.status === 404 || e.excType === 'DoesNotExistError') {
        return { ...empty, blocked: 'missing' };
      }
      throw error;
    }
    const name = String(party[kind === 'customers' ? 'customer_name' : 'supplier_name'] ?? id);
    if (party.disabled) {
      return { ...empty, id: party.name, name, blocked: 'disabled' };
    }
    if (party.default_currency && party.default_currency !== business.currency) {
      return { ...empty, id: party.name, name, blocked: 'currency' };
    }
    const [partyAccount, account, company, uom] = await Promise.all([
      firstValueFrom(
        this.erpnext.get<string | null>('erpnext.accounts.party.get_party_account', {
          party_type: partyType,
          party: party.name,
          company: business.name,
        }),
      ),
      temporaryOpeningAccount(this.erpnext, business.name),
      firstValueFrom(
        this.erpnext.get<{ cost_center?: string | null }>('frappe.client.get_value', {
          doctype: 'Company',
          filters: business.name,
          fieldname: JSON.stringify(['cost_center']),
        }),
      ),
      this.defaultUom(),
    ]);
    const accountCurrency = partyAccount
      ? (
          await firstValueFrom(
            this.erpnext.get<{ account_currency?: string | null }>('frappe.client.get_value', {
              doctype: 'Account',
              filters: partyAccount,
              fieldname: JSON.stringify(['account_currency']),
            }),
          )
        )?.account_currency
      : null;
    const base = { id: party.name, name, uom };
    if (!partyAccount || !account || !company?.cost_center) {
      return { ...base, account: '', costCenter: '', blocked: 'setup' };
    }
    // ERPNext would need an exchange rate for a party whose ledger account is in another currency.
    if (accountCurrency && accountCurrency !== business.currency) {
      return { ...base, account, costCenter: company.cost_center, blocked: 'currency' };
    }
    return { ...base, account, costCenter: company.cost_center, blocked: null };
  }

  /** ERPNext's own default unit for a line without an item; some roles can't read Stock Settings. */
  private async defaultUom(): Promise<string> {
    try {
      const uom = await firstValueFrom(
        this.erpnext.get<string | null>('frappe.client.get_single_value', {
          doctype: 'Stock Settings',
          field: 'stock_uom',
        }),
      );
      return uom || 'Nos';
    } catch {
      return 'Nos';
    }
  }

  /**
   * Posts the opening invoice. A lost answer throws UnresolvedError: the invoice may exist, so callers look it up
   * with find() and never send again. An invoice an earlier attempt left behind is used, not duplicated.
   */
  async record(request: OpeningRequest): Promise<OpeningResult> {
    const earlier = await this.find(request.reference, request.kind);
    if (earlier?.docstatus === 1) {
      return this.result(earlier, request);
    }
    if (earlier) {
      const draft = await firstValueFrom(
        this.erpnext.doc<InvoiceDoc>(doctypeOf(request.kind), earlier.name),
      );
      this.assertSame(draft, request);
      return this.result(
        await confirmRequest(this.erpnext.post<InvoiceDoc>('frappe.client.submit', { doc: draft })),
        request,
      );
    }
    return this.result(
      await confirmRequest(
        this.erpnext.post<InvoiceDoc>('frappe.client.insert', {
          doc: { ...this.invoiceDoc(request), docstatus: 1 },
        }),
      ),
      request,
    );
  }

  /** The invoice a lost answer may have left under the reference, posted or still a draft; null when none. */
  private async find(reference: string, kind: ContactKind): Promise<InvoiceDoc | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<InvoiceDoc>(doctypeOf(kind), {
        fields: [
          'name',
          'docstatus',
          'is_opening',
          partyField(kind),
          'grand_total',
          'rounded_total',
        ],
        filters: [
          ['remarks', 'like', `%${referenceLine(reference)}%`],
          ['docstatus', '<', 2],
        ],
        orderBy: 'creation desc',
        limit: 1,
      }),
    );
    return row ?? null;
  }

  /** After a lost answer: the posted invoice under the reference, or null. Writes nothing. */
  async posted(request: OpeningRequest): Promise<OpeningResult | null> {
    const found = await this.find(request.reference, request.kind);
    return found?.docstatus === 1 ? this.result(found, request) : null;
  }

  private result(doc: InvoiceDoc, request: OpeningRequest): OpeningResult {
    this.assertSame(doc, request);
    return { name: doc.name, total: invoiceTotal(doc) };
  }

  /** The reference is this task's own, so a mismatch means the document was edited in Desk after posting. */
  private assertSame(doc: InvoiceDoc, request: OpeningRequest): void {
    const same =
      doc[partyField(request.kind)] === request.party &&
      doc.is_opening === 'Yes' &&
      Math.abs(round2(invoiceTotal(doc)) - request.amount) < 0.005;
    if (!same) {
      throw new OpeningChangedError(doc.name);
    }
  }

  private invoiceDoc(request: OpeningRequest) {
    const income = request.kind === 'customers';
    return {
      doctype: doctypeOf(request.kind),
      company: request.company,
      [partyField(request.kind)]: request.party,
      is_opening: 'Yes',
      set_posting_time: 1,
      posting_date: request.date,
      due_date: request.date,
      update_stock: 0,
      is_pos: 0,
      // The amount is in the company currency, whatever the party's defaults say.
      currency: request.currency,
      conversion_rate: 1,
      // The amount typed is the amount posted: no pricing rule, tax template or rounding changes it.
      ignore_pricing_rule: 1,
      disable_rounded_total: 1,
      taxes_and_charges: '',
      taxes: [],
      remarks: [request.note.trim(), referenceLine(request.reference)].filter(Boolean).join('\n\n'),
      items: [
        {
          item_name: request.itemName,
          description: request.itemName,
          qty: 1,
          uom: request.uom,
          conversion_factor: 1,
          price_list_rate: request.amount,
          rate: request.amount,
          [income ? 'income_account' : 'expense_account']: request.account,
          cost_center: request.costCenter,
        },
      ],
    };
  }
}

/** The posted invoice no longer matches what was asked for (edited in Desk): it is not reported as the result. */
export class OpeningChangedError extends Error {
  constructor(readonly invoice: string) {
    super(`${invoice} differs from the opening balance that was asked for`);
  }
}
