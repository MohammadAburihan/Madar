import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../auth/session.service';
import { UnresolvedError, confirmRequest } from '../erpnext/confirmation';
import { ErpnextClient } from '../erpnext/erpnext-client';
import { ErpnextError } from '../erpnext/erpnext-error';
import { DRAFT_DOCTYPE, DraftKind } from './draft-kind';

/** Why a delete didn't happen. `offline` and `error` leave it unknown whether the draft is gone. */
export type DeleteFailure = 'permission' | 'linked' | 'offline' | 'error';

/** `changed`: the draft was confirmed, belongs to another business, or is gone already. */
export type DeleteOutcome = 'deleted' | 'changed';

export class DraftDeleteError extends Error {
  constructor(readonly failure: DeleteFailure) {
    super(`The draft wasn't deleted: ${failure}`);
  }
}

/** Deleting a draft by name, and asking ERPNext whether the signed-in user's roles may. */
@Injectable({ providedIn: 'root' })
export class DraftDeletionService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly session = inject(SessionService);
  /** Drafts whose delete ended without an answer: finding one missing on the retry means it went through. */
  private readonly unsure = new Set<string>();

  /**
   * ERPNext's delete right for this document (it differs per role, doctype and, for owner-only rules, document).
   * Only a definite no is an answer; a lost connection or an expired session throws.
   */
  async allowed(kind: DraftKind, name: string): Promise<boolean> {
    try {
      const answer = await firstValueFrom(
        this.erpnext.get<{ has_permission: boolean }>('frappe.client.has_permission', {
          doctype: DRAFT_DOCTYPE[kind],
          docname: name,
          perm_type: 'delete',
        }),
      );
      return answer?.has_permission === true;
    } catch (error) {
      if (ErpnextError.from(error).kind === 'forbidden' && !(await this.session.checkExpired())) {
        return false;
      }
      throw error;
    }
  }

  /** Deletes the draft after reading it again: it must still be a draft of the business. */
  async delete(kind: DraftKind, name: string, company: string): Promise<DeleteOutcome> {
    const doctype = DRAFT_DOCTYPE[kind];
    const key = `${doctype}:${name}`;
    let sent = false;
    try {
      const [current] = await firstValueFrom(
        this.erpnext.list<{ docstatus: number; company: string }>(doctype, {
          fields: ['docstatus', 'company'],
          filters: [['name', '=', name]],
          limit: 1,
        }),
      );
      if (!current) {
        const wentThrough = this.unsure.delete(key);
        return wentThrough ? 'deleted' : 'changed';
      }
      if (current.docstatus !== 0 || current.company !== company) {
        return 'changed';
      }
      sent = true;
      await confirmRequest(this.erpnext.post('frappe.client.delete', { doctype, name }));
      this.unsure.delete(key);
      return 'deleted';
    } catch (error) {
      const failure = await this.failureOf(error);
      if (sent && (failure === 'offline' || failure === 'error')) {
        this.unsure.add(key);
      }
      throw new DraftDeleteError(failure);
    }
  }

  private async failureOf(error: unknown): Promise<DeleteFailure> {
    if (error instanceof UnresolvedError) {
      return 'offline';
    }
    const erpnext = ErpnextError.from(error);
    if (erpnext.excType === 'LinkExistsError') {
      return 'linked';
    }
    if (erpnext.kind === 'forbidden') {
      // 403 is also how an expired session answers; that one goes back to sign-in.
      await this.session.checkExpired();
      return 'permission';
    }
    return erpnext.kind === 'offline' ? 'offline' : 'error';
  }
}
