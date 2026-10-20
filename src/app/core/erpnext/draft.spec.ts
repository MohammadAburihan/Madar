import { HttpErrorResponse } from '@angular/common/http';
import { DraftUnavailableError, missingAsUnavailable, referenceIn } from './draft';
import { ErpnextError } from './erpnext-error';

describe('draft helpers', () => {
  it('finds a Madar reference of the right kind inside a text', () => {
    expect(referenceIn('Madar quick sale SALE-0A1B2C3', 'SALE')).toBe('SALE-0A1B2C3');
    expect(referenceIn('Madar quick sale SALE-0A1B2C3', 'PUR')).toBeNull();
    expect(referenceIn('SALE-0A1B2C', 'SALE')).toBeNull();
    expect(referenceIn(null, 'SALE')).toBeNull();
    expect(referenceIn('', 'SALE')).toBeNull();
  });

  it('turns a missing document into an unavailable draft and keeps other errors', () => {
    expect(missingAsUnavailable(new HttpErrorResponse({ status: 404 }), 'SI-1')).toBeInstanceOf(
      DraftUnavailableError,
    );
    const offline = missingAsUnavailable(new HttpErrorResponse({ status: 0 }), 'SI-1');
    expect(offline).toBeInstanceOf(ErpnextError);
    expect((offline as ErpnextError).kind).toBe('offline');
  });
});
