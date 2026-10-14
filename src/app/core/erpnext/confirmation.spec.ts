import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  UnresolvedError,
  confirmRequest,
  newReference,
  reusableDraft,
  unresolvedOr,
} from './confirmation';
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

  describe('reusableDraft', () => {
    it('returns a draft or a submitted document as it stands', async () => {
      expect(await reusableDraft(of({ name: 'D', docstatus: 0 }))).toEqual({
        name: 'D',
        docstatus: 0,
      });
      expect(await reusableDraft(of({ name: 'S', docstatus: 1 }))).toEqual({
        name: 'S',
        docstatus: 1,
      });
    });

    it('treats a cancelled or deleted draft as gone', async () => {
      expect(await reusableDraft(of({ name: 'C', docstatus: 2 }))).toBeNull();
      expect(
        await reusableDraft(throwError(() => new HttpErrorResponse({ status: 404 }))),
      ).toBeNull();
      expect(
        await reusableDraft(
          throwError(
            () => new HttpErrorResponse({ status: 417, error: { exc_type: 'DoesNotExistError' } }),
          ),
        ),
      ).toBeNull();
    });

    it('passes other read failures through', async () => {
      await expect(
        reusableDraft(throwError(() => new HttpErrorResponse({ status: 0 }))),
      ).rejects.toBeTruthy();
    });
  });
});
