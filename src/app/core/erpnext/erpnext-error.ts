import { HttpErrorResponse } from '@angular/common/http';

export type ErpnextErrorKind = 'offline' | 'unauthorized' | 'forbidden' | 'server';

export class ErpnextError extends Error {
  constructor(
    readonly kind: ErpnextErrorKind,
    message: string,
    readonly status = 0,
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
    const message = (error.error?.message as string | undefined) ?? error.message;
    if (error.status === 0) {
      return new ErpnextError('offline', message);
    }
    if (error.status === 401) {
      return new ErpnextError('unauthorized', message, 401);
    }
    // Frappe answers 403 both for missing permissions and for expired sessions (treated as Guest).
    if (error.status === 403) {
      return new ErpnextError('forbidden', message, 403);
    }
    return new ErpnextError('server', message, error.status);
  }
}
