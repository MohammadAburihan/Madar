import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { normalizeIban } from '../../../core/format/iban';
import { BankAccountRecord, BankDetails, ContactKind } from './contacts.models';

interface BankAccountRow {
  name: string;
  bank: string;
  iban?: string | null;
  bank_account_no?: string | null;
  disabled?: number;
  modified: string;
}

const PARTY_TYPE = { customers: 'Customer', suppliers: 'Supplier' } as const;

/** The bank account was changed elsewhere since the form loaded it. */
export class BankChangedError extends Error {
  constructor() {
    super('The bank details changed since they were loaded');
  }
}

export const noBankDetails = (details: BankDetails) =>
  !details.bank.trim() && !details.iban.trim() && !details.accountNo.trim();

const toRecord = (row: BankAccountRow): BankAccountRecord => ({
  name: row.name,
  bank: row.bank,
  iban: row.iban ?? '',
  accountNo: row.bank_account_no ?? '',
  modified: row.modified,
  disabled: !!row.disabled,
});

/**
 * A customer's or supplier's bank details, kept as a Bank Account linked to the party. Each write is its own
 * step that looks before it writes, so running the steps again after a failure never duplicates a record.
 */
@Injectable({ providedIn: 'root' })
export class ContactBankApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Every bank to choose from. Rejects with a forbidden error when the role may not read them. */
  async banks(): Promise<string[]> {
    const rows = await this.erpnext.listAll<{ name: string }>('Bank', {
      fields: ['name'],
      orderBy: 'name asc',
    });
    return rows.map((r) => r.name);
  }

  /** The party's own account (not a company's): an enabled one first, else the newest disabled one. */
  async account(kind: ContactKind, id: string): Promise<BankAccountRecord | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<BankAccountRow>('Bank Account', {
        fields: ['name', 'bank', 'iban', 'bank_account_no', 'disabled', 'modified'],
        filters: [
          ['party_type', '=', PARTY_TYPE[kind]],
          ['party', '=', id],
          ['is_company_account', '=', 0],
        ],
        orderBy: 'disabled asc, modified desc, name asc',
        limit: 1,
      }),
    );
    return row ? toRecord(row) : null;
  }

  /**
   * Saves the party's bank details: makes the bank when it is new, then creates, updates or (when all three are
   * empty) disables the account. `loaded` is the account the form was filled from; a change made to it since
   * throws BankChangedError instead of overwriting. Resolves to the account as saved, or null when none is held.
   */
  async save(
    kind: ContactKind,
    id: string,
    details: BankDetails,
    loaded: BankAccountRecord | null,
    newBank: boolean,
  ): Promise<BankAccountRecord | null> {
    if (noBankDetails(details)) {
      return this.disable(kind, id, loaded);
    }
    const bank = newBank ? await this.ensureBank(details.bank) : details.bank;
    return this.write(kind, id, { ...details, bank }, loaded);
  }

  /** Creates the bank unless it exists by now; resolves to its name as ERPNext holds it. */
  async ensureBank(name: string): Promise<string> {
    const find = async () => {
      const [row] = await firstValueFrom(
        this.erpnext.list<{ name: string }>('Bank', {
          fields: ['name'],
          filters: [['name', '=', name]],
          limit: 1,
        }),
      );
      return row?.name ?? null;
    };
    const found = await find();
    if (found) {
      return found;
    }
    try {
      const doc = await firstValueFrom(
        this.erpnext.post<{ name: string }>('frappe.client.insert', {
          doc: { doctype: 'Bank', bank_name: name },
        }),
      );
      return doc.name;
    } catch (error) {
      // A first attempt whose answer was lost made it.
      const existing = ErpnextError.from(error).excType === 'DuplicateEntryError' && (await find());
      if (existing) {
        return existing;
      }
      throw error;
    }
  }

  private async write(
    kind: ContactKind,
    id: string,
    details: BankDetails,
    loaded: BankAccountRecord | null,
  ): Promise<BankAccountRecord> {
    const current = await this.account(kind, id);
    if (!current) {
      const doc = await firstValueFrom(
        this.erpnext.post<BankAccountRow>('frappe.client.insert', {
          doc: {
            doctype: 'Bank Account',
            // ERPNext names the account "<account_name> - <bank>"; the party's kind and id keep it unique.
            account_name: `${PARTY_TYPE[kind]} ${id}`,
            bank: details.bank,
            party_type: PARTY_TYPE[kind],
            party: id,
            is_company_account: 0,
            ...(details.iban ? { iban: details.iban } : {}),
            ...(details.accountNo ? { bank_account_no: details.accountNo } : {}),
          },
        }),
      );
      return toRecord(doc);
    }
    const same =
      !current.disabled &&
      current.bank === details.bank &&
      normalizeIban(current.iban) === normalizeIban(details.iban) &&
      current.accountNo === details.accountNo;
    if (same) {
      return current;
    }
    if (current.modified !== loaded?.modified) {
      throw new BankChangedError();
    }
    return this.saveDoc(current.name, {
      bank: details.bank,
      iban: details.iban,
      bank_account_no: details.accountNo,
      disabled: 0,
    });
  }

  /** Clearing keeps the accounts (payments may link to them) but switches every enabled one off. */
  private async disable(
    kind: ContactKind,
    id: string,
    loaded: BankAccountRecord | null,
  ): Promise<null> {
    const enabled = await firstValueFrom(
      this.erpnext.list<BankAccountRow>('Bank Account', {
        fields: ['name', 'bank', 'iban', 'bank_account_no', 'disabled', 'modified'],
        filters: [
          ['party_type', '=', PARTY_TYPE[kind]],
          ['party', '=', id],
          ['is_company_account', '=', 0],
          ['disabled', '=', 0],
        ],
        orderBy: 'modified desc, name asc',
        limit: 100,
      }),
    );
    for (const row of enabled.filter((r) => !r.disabled)) {
      if (row.name === loaded?.name && row.modified !== loaded.modified) {
        throw new BankChangedError();
      }
      await this.saveDoc(row.name, { disabled: 1 });
    }
    return null;
  }

  private async saveDoc(
    name: string,
    changes: Record<string, unknown>,
  ): Promise<BankAccountRecord> {
    const doc = await firstValueFrom(this.erpnext.doc<BankAccountRow>('Bank Account', name));
    const saved = await firstValueFrom(
      this.erpnext.post<BankAccountRow>('frappe.client.save', { doc: { ...doc, ...changes } }),
    );
    return toRecord(saved);
  }
}
