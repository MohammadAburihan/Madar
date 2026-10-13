import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { UnresolvedError, confirmRequest, newReference, unresolvedOr } from './confirmation';
import { ErpnextError } from './erpnext-error';

describe('confirmation', () => {
  afterEach(() => vi.useRealTimers());

  it('passes answers through', async () => {
    expect(await confirmRequest(of(42))).toBe(42);
  });

  it('treats gateway timeouts, lost connections and silence as unresolved', async () => {
    await expect(
      confirmRequest(throwError(() => new HttpErrorResponse({ status: 504 }))),
    ).rejects.toBeInstanceOf(UnresolvedError);
    await expect(
      confirmRequest(throwError(() => new HttpErrorResponse({ status: 0 }))),
    ).rejects.toBeInstanceOf(UnresolvedError);

    vi.useFakeTimers();
    const pending = confirmRequest(NEVER);
    const assertion = expect(pending).rejects.toBeInstanceOf(UnresolvedError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('keeps definite failures as ERPNext errors', () => {
    const error = unresolvedOr(new HttpErrorResponse({ status: 417 }));
    expect(error).toBeInstanceOf(ErpnextError);
    expect(unresolvedOr(new UnresolvedError())).toBeInstanceOf(UnresolvedError);
  });

  it('makes distinct prefixed references', () => {
    const a = newReference('COLL');
    expect(a).toMatch(/^COLL-[0-9A-Z]{7}$/);
    expect(newReference('COLL')).not.toBe(a);
  });
});
