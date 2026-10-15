import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PostedEarlierError,
  confirmRequest,
  reusableDraft,
  unresolvedOr,
} from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { withoutLocalFlags } from '../../../core/erpnext/payment-entry';
import { round2 } from '../../../core/format/number';
import { ExpenseCategory, ExpenseRequest } from './expense.models';

interface EntryRow {
  account: string;
  debit_in_account_currency: number;
  credit_in_account_currency: number;
  project?: string | null;
}

interface EntryDoc {
  name: string;
  docstatus: number;
  posting_date: string;
  accounts: EntryRow[];
  [key: string]: unknown;
}

/** Company accounts that are expenses in the books but not something a person pays for. */
const SYSTEM_EXPENSE_FIELDS = [
  'write_off_account',
  'exchange_gain_loss_account',
  'disposal_account',
  'round_off_account',
  'depreciation_expense_account',
];

/** Operating expenses: a submitted Journal Entry from an expense account to a cash or bank account. */
@Injectable({ providedIn: 'root' })
export class ExpenseApiService {
  private readonly erpnext = inject(ErpnextClient);

  /**
   * The company's operating expense accounts. Stock, cost-of-goods and other typed accounts are left out, and
   * so are the accounts ERPNext books on its own (write-off, exchange, rounding, disposal, depreciation).
   */
  async categories(company: string): Promise<ExpenseCategory[]> {
    const [rows, defaults] = await Promise.all([
      firstValueFrom(
        this.erpnext.list<{ name: string; account_name: string }>('Account', {
          fields: ['name', 'account_name'],
          filters: [
            ['company', '=', company],
            ['root_type', '=', 'Expense'],
            ['is_group', '=', 0],
            ['disabled', '=', 0],
            ['account_type', 'in', ['', 'Chargeable']],
          ],
          orderBy: 'account_name asc',
          limit: 0,
        }),
      ),
      this.companyDefaults(company),
    ]);
    const system = new Set(SYSTEM_EXPENSE_FIELDS.map((f) => defaults[f]).filter(Boolean));
    return rows
      .filter((r) => !system.has(r.name))
      .map((r) => ({ account: r.name, name: r.account_name }));
  }

  /**
   * Inserts and submits the expense. A timeout or lost connection throws UnresolvedError: it may have been
   * recorded, so callers must look it up with find(), not resubmit. Resolves to the entry's name.
   */
  async record(
    request: ExpenseRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<string> {
    const fresh = await this.entryDoc(request);
    const current = draft
      ? await reusableDraft(this.erpnext.doc<EntryDoc>('Journal Entry', draft))
      : null;
    if (current?.docstatus === 1) {
      // A slow earlier attempt recorded it after all; it's this request's result only if nothing changed.
      if (!sameExpense(current, request)) {
        throw new PostedEarlierError(current.name);
      }
      return current.name;
    }
    try {
      let doc: Record<string, unknown>;
      if (current) {
        // Keep the draft's identity; the fresh rows replace its accounts table.
        doc = {
          ...current,
          ...withoutLocalFlags(fresh),
          name: current.name,
          modified: current['modified'],
          docstatus: 0,
        };
      } else {
        doc = await confirmRequest(
          this.erpnext.post<EntryDoc>('frappe.client.insert', { doc: fresh }),
        );
        onInserted((doc as EntryDoc).name);
      }
      const entry = await confirmRequest(
        this.erpnext.post<EntryDoc>('frappe.client.submit', { doc }),
      );
      return entry.name;
    } catch (error) {
      throw unresolvedOr(error);
    }
  }

  /** Looks an expense up by its Madar reference after an unresolved confirmation. */
  async find(reference: string): Promise<{ expense: string } | 'not-found' | { draft: string }> {
    const [entry] = await firstValueFrom(
      this.erpnext.list<{ name: string; docstatus: number }>('Journal Entry', {
        fields: ['name', 'docstatus'],
        filters: [
          ['cheque_no', '=', reference],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'docstatus desc',
        limit: 1,
      }),
    );
    if (!entry) {
      return 'not-found';
    }
    return entry.docstatus === 0 ? { draft: entry.name } : { expense: entry.name };
  }

  /** Deletes a draft a failed confirmation left behind. */
  async discard(draft: string): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.client.delete', { doctype: 'Journal Entry', name: draft }),
    );
  }

  /** Attaches the receipt photo to the recorded expense. */
  async attachReceipt(expense: string, file: File): Promise<void> {
    await firstValueFrom(
      this.erpnext.upload(file, file.name || 'receipt.jpg', {
        doctype: 'Journal Entry',
        name: expense,
      }),
    );
  }

  private async entryDoc(request: ExpenseRequest): Promise<Record<string, unknown>> {
    // ERPNext requires a cost center on expense rows; the company's default one is where Madar books them.
    const { cost_center } = await this.companyDefaults(request.company);
    return {
      doctype: 'Journal Entry',
      voucher_type: request.account.isBank ? 'Bank Entry' : 'Cash Entry',
      company: request.company,
      posting_date: request.date,
      // Bank entries require a reference; it also lets "Check result" find this expense.
      cheque_no: request.reference,
      cheque_date: request.date,
      user_remark: `Madar expense ${request.reference}`,
      accounts: [
        {
          account: request.category,
          debit_in_account_currency: request.amount,
          cost_center,
          project: request.project,
        },
        {
          account: request.account.account,
          credit_in_account_currency: request.amount,
          cost_center,
        },
      ],
    };
  }

  private async companyDefaults(company: string): Promise<Record<string, string | null>> {
    return firstValueFrom(
      this.erpnext.post<Record<string, string | null>>('frappe.client.get_value', {
        doctype: 'Company',
        filters: { name: company },
        fieldname: ['cost_center', ...SYSTEM_EXPENSE_FIELDS],
      }),
    );
  }
}

function sameExpense(entry: EntryDoc, request: ExpenseRequest): boolean {
  const debit = entry.accounts.find((a) => a.account === request.category);
  const credit = entry.accounts.find((a) => a.account === request.account.account);
  return (
    entry.posting_date === request.date &&
    !!debit &&
    !!credit &&
    round2(debit.debit_in_account_currency) === round2(request.amount) &&
    round2(credit.credit_in_account_currency) === round2(request.amount) &&
    (debit.project ?? null) === request.project
  );
}
