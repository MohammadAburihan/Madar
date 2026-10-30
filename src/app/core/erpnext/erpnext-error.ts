import { HttpErrorResponse } from '@angular/common/http';

export type ErpnextErrorKind = 'offline' | 'unauthorized' | 'forbidden' | 'server';

export class ErpnextError extends Error {
  constructor(
    readonly kind: ErpnextErrorKind,
    message: string,
    readonly status = 0,
    /** Frappe's exception class, e.g. `NegativeStockError`; null when the server didn't say. */
    readonly excType: string | null = null,
    /** The text Frappe meant for the user (`_server_messages`); null when the answer had none. */
    readonly userMessage: string | null = null,
  ) {
    super(message);
  }

  static from(error: unknown): ErpnextError {
    if (error instanceof ErpnextError) {
      return error;
    }
    if (!(error instanceof HttpErrorResponse)) {
      return new ErpnextError('server', String(error));
    }
    const body = typeof error.error === 'object' && error.error ? error.error : {};
    const excType = typeof body.exc_type === 'string' ? body.exc_type : null;
    const userMessage = serverMessages(body);
    const message = serverMessage(body) ?? error.message;
    if (error.status === 0) {
      return new ErpnextError('offline', message, 0, excType);
    }
    if (error.status === 401) {
      return new ErpnextError('unauthorized', message, 401, excType);
    }
    // Frappe answers 403 both for missing permissions and for expired sessions (treated as Guest).
    if (error.status === 403) {
      return new ErpnextError('forbidden', message, 403, excType);
    }
    return new ErpnextError('server', message, error.status, excType, userMessage);
  }
}

/**
 * Frappe puts the user-facing text in `_server_messages` (a JSON list of JSON objects with `message`), the
 * exception line in `exception`, and sometimes a plain `message`.
 */
function serverMessage(body: Record<string, unknown>): string | null {
  const messages = serverMessages(body);
  if (messages) {
    return messages;
  }
  if (typeof body['message'] === 'string') {
    return body['message'];
  }
  if (typeof body['exception'] === 'string') {
    return body['exception'];
  }
  return null;
}

function serverMessages(body: Record<string, unknown>): string | null {
  if (typeof body['_server_messages'] === 'string') {
    try {
      const messages = (JSON.parse(body['_server_messages']) as string[])
        .map((entry) => {
          try {
            return String((JSON.parse(entry) as { message?: unknown }).message ?? '');
          } catch {
            return entry;
          }
        })
        .map((text) => text.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean);
      if (messages.length) {
        return messages.join('\n');
      }
    } catch {
      // Fall through to the other fields.
    }
  }
  return null;
}
