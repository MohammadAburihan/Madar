import { ErpnextError } from './erpnext-error';

/** The draft a task was asked to open is gone, posted, someone else's, another business's or not Madar's. */
export class DraftUnavailableError extends Error {
  constructor(readonly draft: string) {
    super(`${draft} can't be continued`);
  }
}

/** Madar's idempotency reference (e.g. SALE-0A1B2C3) inside a text field, or null when there is none. */
export function referenceIn(text: unknown, prefix: string): string | null {
  return typeof text === 'string'
    ? (text.match(new RegExp(`\\b${prefix}-[0-9A-Z]{7}\\b`))?.[0] ?? null)
    : null;
}

/** Maps ERPNext's "no such document" answer to DraftUnavailableError; other errors pass through. */
export function missingAsUnavailable(error: unknown, name: string): Error {
  const erpnext = ErpnextError.from(error);
  return erpnext.status === 404 || erpnext.excType === 'DoesNotExistError'
    ? new DraftUnavailableError(name)
    : erpnext;
}
