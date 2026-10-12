import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';
import { ErpnextError } from '../erpnext/erpnext-error';
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

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly currentUser = signal<SessionUser | null>(null);
  private readonly currentStatus = signal<SessionStatus>('unknown');
  private restoring?: Promise<boolean>;

  readonly user = this.currentUser.asReadonly();
  readonly status = this.currentStatus.asReadonly();
  readonly persona = computed(() => personaFor(this.currentUser()?.roles ?? []));

  /** Resolves whether a valid ERPNext session exists, checking the server only once. */
  ensure(): Promise<boolean> {
    const status = this.currentStatus();
    if (status !== 'unknown') {
      return Promise.resolve(status === 'signed-in');
    }
    this.restoring ??= this.restore().finally(() => (this.restoring = undefined));
    return this.restoring;
  }

  async signIn(email: string, password: string): Promise<void> {
    await firstValueFrom(this.erpnext.post('login', { usr: email, pwd: password }));
    await this.loadUser();
  }

  /** ERPNext answers the same way whether or not the account exists. */
  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.erpnext.post('frappe.core.doctype.user.user.reset_password', { user: email }),
    ).catch(() => undefined);
  }

  async signOut(): Promise<void> {
    await firstValueFrom(this.erpnext.post('logout', {})).catch(() => undefined);
    this.currentUser.set(null);
    this.currentStatus.set('signed-out');
  }

  /** Call after a 403: tells an expired session apart from a missing permission. */
  async checkExpired(): Promise<boolean> {
    const stillValid = await this.isLoggedIn().catch(() => true);
    if (!stillValid) {
      this.currentUser.set(null);
      this.currentStatus.set('expired');
    }
    return !stillValid;
  }

  private async restore(): Promise<boolean> {
    try {
      if (!(await this.isLoggedIn())) {
        this.currentStatus.set(this.currentStatus() === 'expired' ? 'expired' : 'signed-out');
        return false;
      }
      await this.loadUser();
      return true;
    } catch (error) {
      if (ErpnextError.from(error).kind === 'offline') {
        throw error;
      }
      this.currentStatus.set('signed-out');
      return false;
    }
  }

  /** Frappe answers 403 (not "Guest") when there is no session; only connection errors are rethrown. */
  private async isLoggedIn(): Promise<boolean> {
    try {
      const user = await firstValueFrom(this.erpnext.get<string>('frappe.auth.get_logged_user'));
      return !!user && user !== 'Guest';
    } catch (error) {
      const kind = ErpnextError.from(error).kind;
      if (kind === 'forbidden' || kind === 'unauthorized') {
        return false;
      }
      throw error;
    }
  }

  private async loadUser(): Promise<void> {
    const id = await firstValueFrom(this.erpnext.get<string>('frappe.auth.get_logged_user'));
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
