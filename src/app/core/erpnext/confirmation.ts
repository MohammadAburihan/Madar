import { Observable, firstValueFrom, timeout } from 'rxjs';
import { ErpnextError } from './erpnext-error';

/** Thrown when a confirmation may or may not have reached ERPNext (timeout or lost connection). */
export class UnresolvedError extends Error {
  constructor() {
    super('The confirmation did not get a definite answer');
  }
}

// Long enough for a busy ERPNext, short enough that the user isn't left wondering.
const CONFIRM_TIMEOUT_MS = 30_000;

/** Runs a confirming request; a timeout, dropped connection or gateway timeout becomes UnresolvedError. */
export async function confirmRequest<T>(request: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(request.pipe(timeout(CONFIRM_TIMEOUT_MS)));
  } catch (error) {
    throw unresolvedOr(error);
  }
}

export function unresolvedOr(error: unknown): Error {
  if (error instanceof UnresolvedError || (error as Error)?.name === 'TimeoutError') {
    return new UnresolvedError();
  }
  const erpnextError = ErpnextError.from(error);
  // A gateway timeout or dropped connection means the server may still have saved the record.
  return erpnextError.kind === 'offline' || erpnextError.status === 504
    ? new UnresolvedError()
    : erpnextError;
}

/** A random idempotency reference, e.g. SALE-0A1B2C3, stored on the ERPNext documents a task creates. */
export function newReference(prefix: string): string {
  const random = crypto
    .getRandomValues(new Uint32Array(1))[0]
    .toString(36)
    .toUpperCase()
    .padStart(7, '0');
  return `${prefix}-${random}`;
}

/**
 * Reads a remembered draft before reusing it. Gone (deleted in Desk) or cancelled means start a new document;
 * submitted means an earlier, slow attempt went through. Reading writes nothing, so other errors are definite.
 */
export async function reusableDraft<T extends { docstatus: number }>(
  read: Observable<T>,
): Promise<T | null> {
  try {
    const doc = await firstValueFrom(read);
    return doc.docstatus === 2 ? null : doc;
  } catch (error) {
    const missing = ErpnextError.from(error);
    if (missing.status === 404 || missing.excType === 'DoesNotExistError') {
      return null;
    }
    throw error;
  }
}
