import { westernDigits } from './number';

const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const INVISIBLE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0]/g;
const ACCOUNT_NUMBER = /^[A-Za-z0-9-]+$/;

/** Spaces, no-break spaces and bidi marks dropped, upper case, Arabic-Indic digits as Western ones. */
export function normalizeIban(text: string): string {
  return westernDigits(text).replace(INVISIBLE, '').replace(/\s+/g, '').toUpperCase();
}

/** Same checksum as Frappe's `is_valid_iban` (mod 97), plus the shape of an IBAN. */
export function isValidIban(text: string): boolean {
  const iban = normalizeIban(text);
  if (!IBAN_SHAPE.test(iban)) {
    return false;
  }
  let remainder = 0;
  for (const char of iban.slice(4) + iban.slice(0, 4)) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

/** Spaces and bidi marks dropped and Western digits; letters, digits and dashes are what an account number holds. */
export function normalizeAccountNumber(text: string): string {
  return westernDigits(text).replace(INVISIBLE, '').replace(/\s+/g, '');
}

export function isValidAccountNumber(text: string): boolean {
  return ACCOUNT_NUMBER.test(normalizeAccountNumber(text));
}
