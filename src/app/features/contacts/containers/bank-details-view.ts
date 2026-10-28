import {
  isValidAccountNumber,
  isValidIban,
  normalizeAccountNumber,
  normalizeIban,
} from '../../../core/format/iban';
import { Translator } from '../../../core/i18n/translator';
import { BankAccountRecord, BankDetails } from '../data-access/contacts.models';

const MAX_SUGGESTIONS = 8;

export interface BankSuggestion {
  value: string;
  label: string;
  add: boolean;
}

export type BankChoice =
  | { kind: 'none' }
  | { kind: 'existing'; name: string }
  | { kind: 'new'; name: string }
  | { kind: 'unpicked'; name: string };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The bank the typed text names exactly (ignoring case), never a near match. */
export function exactBank(banks: readonly string[], text: string): string | null {
  return text.trim() ? (banks.find((b) => same(b, text)) ?? null) : null;
}

/** Banks containing the typed text, then "Add bank" when the role may and no bank has exactly that name. */
export function bankSuggestions(
  banks: readonly string[],
  text: string,
  canAdd: boolean,
  tr: Translator,
): BankSuggestion[] {
  const query = text.trim().toLowerCase();
  const matches = banks
    .filter((b) => b.toLowerCase().includes(query))
    .slice(0, MAX_SUGGESTIONS)
    .map((b) => ({ value: b, label: b, add: false }));
  if (canAdd && query && !exactBank(banks, text)) {
    matches.push({
      value: text.trim(),
      label: tr.t('contacts.bank.add', { name: text.trim() }),
      add: true,
    });
  }
  return matches;
}

/** What the bank field holds: an existing bank, a new one the user chose to add, or text not yet resolved. */
export function resolveBank(
  banks: readonly string[],
  text: string,
  addedName: string | null,
): BankChoice {
  if (!text.trim()) {
    return { kind: 'none' };
  }
  const existing = exactBank(banks, text);
  if (existing) {
    return { kind: 'existing', name: existing };
  }
  return addedName !== null && same(addedName, text)
    ? { kind: 'new', name: text.trim() }
    : { kind: 'unpicked', name: text.trim() };
}

/** The typed values in the form ERPNext stores them: IBAN and numbers normalised, the bank as resolved. */
export function bankDetailsOf(choice: BankChoice, iban: string, accountNo: string): BankDetails {
  return {
    bank: choice.kind === 'none' ? '' : choice.name,
    iban: normalizeIban(iban),
    accountNo: normalizeAccountNumber(accountNo),
  };
}

export interface BankErrors {
  bank: string | null;
  iban: string | null;
  accountNo: string | null;
}

export function bankErrors(
  choice: BankChoice,
  iban: string,
  accountNo: string,
  canAdd: boolean,
  tr: Translator,
): BankErrors {
  const numbers = !!iban.trim() || !!accountNo.trim();
  return {
    bank:
      choice.kind === 'none'
        ? numbers
          ? tr.t('contacts.bank.bankRequired')
          : null
        : choice.kind === 'unpicked'
          ? tr.t(canAdd ? 'contacts.bank.pickOrAdd' : 'contacts.bank.pickBank')
          : null,
    iban: iban.trim() && !isValidIban(iban) ? tr.t('contacts.bank.ibanError') : null,
    accountNo:
      accountNo.trim() && !isValidAccountNumber(accountNo)
        ? tr.t('contacts.bank.accountError')
        : null,
  };
}

/** Whether the form differs from what ERPNext holds (a disabled account counts as none). */
export function bankChanged(details: BankDetails, loaded: BankAccountRecord | null): boolean {
  const held = loaded && !loaded.disabled ? loaded : null;
  return (
    details.bank !== (held?.bank ?? '') ||
    details.iban !== normalizeIban(held?.iban ?? '') ||
    details.accountNo !== normalizeAccountNumber(held?.accountNo ?? '')
  );
}

/** The detail page's rows; the IBAN and number read left to right. */
export function bankRows(record: BankAccountRecord, tr: Translator) {
  return [
    { label: tr.t('contacts.bank.bank'), value: record.bank, ltr: false },
    ...(record.iban ? [{ label: tr.t('contacts.bank.iban'), value: record.iban, ltr: true }] : []),
    ...(record.accountNo
      ? [{ label: tr.t('contacts.bank.accountNo'), value: record.accountNo, ltr: true }]
      : []),
  ];
}
