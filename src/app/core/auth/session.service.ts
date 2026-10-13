import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';
import { ErpnextError } from '../erpnext/erpnext-error';
import { shareInFlight } from '../util/share-in-flight';
import { personaFor } from './persona';

export interface SessionUser {
  id: string;
  fullName: string;
  firstName: string;
  roles: string[];
}

interface UserDoc {
  name: string;
  full_name?: string;
  first_name?: string;
}

export type SessionStatus = 'unknown' | 'signed-in' | 'signed-out' | 'expired';

/** ERPNext accepted the password, but the session cookie didn't come back (blocked or cross-site cookies). */
export class SessionNotKeptError extends Error {
  constructor() {
    super('Signed in, but the session cookie was not kept');
  }
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly currentUser = signal<SessionUser | null>(null);
  private readonly currentStatus = signal<SessionStatus>('unknown');
  private readonly restore = shareInFlight(() => this.restoreSession());

  readonly user = this.currentUser.asReadonly();
  readonly status = this.currentStatus.asReadonly();
  readonly persona = computed(() => personaFor(this.currentUser()?.roles ?? []));

  /**
   * Resolves whether a valid ERPNext session exists, checking the server only once.
   * Rejects when ERPNext can't answer (offline or server error), so callers can show that instead.
   */
  ensure(): Promise<boolean> {
    const status = this.currentStatus();
    return status === 'unknown' ? this.restore() : Promise.resolve(status === 'signed-in');
  }

  async signIn(email: string, password: string): Promise<void> {
    await firstValueFrom(this.erpnext.post('login', { usr: email, pwd: password }));
    const id = await this.loggedInUser();
    if (!id) {
      throw new SessionNotKeptError();
    }
    await this.loadUser(id);
  }

  /**
   * ERPNext answers the same way whether or not the account exists, so only connection and
   * server failures are reported.
   */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      await firstValueFrom(
        this.erpnext.post('frappe.core.doctype.user.user.reset_password', { user: email }),
      );
    } catch (error) {
      const kind = ErpnextError.from(error).kind;
      if (kind === 'offline' || kind === 'server') {
        throw error;
      }
    }
  }

  /** Call after a 401/403: tells an expired session apart from a missing permission. */
  async checkExpired(): Promise<boolean> {
    const stillValid = await this.loggedInUser().then(
      (id) => !!id,
      () => true,
    );
    if (!stillValid) {
      this.currentUser.set(null);
      this.currentStatus.set('expired');
    }
    return !stillValid;
  }

  private async restoreSession(): Promise<boolean> {
    const id = await this.loggedInUser();
    if (!id) {
      this.currentStatus.set('signed-out');
      return false;
    }
    await this.loadUser(id);
    return true;
  }

  /** The signed-in user's id, or null. Frappe answers 403 (not "Guest") when there is no session. */
  private async loggedInUser(): Promise<string | null> {
    try {
      const user = await firstValueFrom(this.erpnext.get<string>('frappe.auth.get_logged_user'));
      return user && user !== 'Guest' ? user : null;
    } catch (error) {
      const kind = ErpnextError.from(error).kind;
      if (kind === 'forbidden' || kind === 'unauthorized') {
        return null;
      }
      throw error;
    }
  }

  private async loadUser(id: string): Promise<void> {
    // Non-admin users get an empty `roles` table on their own User doc, so roles are listed separately.
    const [doc, roles] = await Promise.all([
      firstValueFrom(this.erpnext.doc<UserDoc>('User', id)),
      firstValueFrom(
        this.erpnext.list<{ role: string }>('Has Role', {
          fields: ['role'],
          filters: [['parent', '=', id]],
          parent: 'User',
          limit: 0,
        }),
      ),
    ]);
    const fullName = doc.full_name || doc.first_name || id;
    this.currentUser.set({
      id,
      fullName,
      firstName: doc.first_name || fullName.split(' ')[0],
      roles: roles.map((r) => r.role),
    });
    this.currentStatus.set('signed-in');
  }
}
