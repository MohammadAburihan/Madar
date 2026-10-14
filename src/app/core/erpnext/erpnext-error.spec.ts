import { HttpErrorResponse } from '@angular/common/http';
import { ErpnextError } from './erpnext-error';

describe('ErpnextError', () => {
  it("reads Frappe's server messages and exception class", () => {
    const error = ErpnextError.from(
      new HttpErrorResponse({
        status: 417,
        error: {
          exc_type: 'NegativeStockError',
          exception: 'erpnext.stock.stock_ledger.NegativeStockError: 3 units needed',
          _server_messages: JSON.stringify([
            JSON.stringify({ message: '3 units of <strong>Olive tree</strong> needed.' }),
          ]),
        },
      }),
    );
    expect(error.kind).toBe('server');
    expect(error.status).toBe(417);
    expect(error.excType).toBe('NegativeStockError');
    expect(error.message).toBe('3 units of Olive tree needed.');
  });

  it('falls back to the plain message, then the exception line, then the HTTP text', () => {
    expect(
      ErpnextError.from(new HttpErrorResponse({ status: 417, error: { message: 'Plain' } }))
        .message,
    ).toBe('Plain');
    expect(
      ErpnextError.from(new HttpErrorResponse({ status: 417, error: { exception: 'Line' } }))
        .message,
    ).toBe('Line');
    const bare = ErpnextError.from(new HttpErrorResponse({ status: 500, url: '/api/x' }));
    expect(bare.message).toContain('/api/x');
    expect(bare.excType).toBeNull();
  });

  it('maps HTTP statuses to kinds', () => {
    expect(ErpnextError.from(new HttpErrorResponse({ status: 0 })).kind).toBe('offline');
    expect(ErpnextError.from(new HttpErrorResponse({ status: 401 })).kind).toBe('unauthorized');
    expect(ErpnextError.from(new HttpErrorResponse({ status: 403 })).kind).toBe('forbidden');
    expect(ErpnextError.from('boom').kind).toBe('server');
  });
});
