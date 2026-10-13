import { Injectable, inject, signal } from '@angular/core';
import { Subscription, timeout } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ConnectionStatus } from '../../../shared/ui/connection-status.component';

const PING_TIMEOUT_MS = 10_000;

@Injectable({ providedIn: 'root' })
export class HomeFacade {
  private readonly erpnext = inject(ErpnextClient);
  private readonly status = signal<ConnectionStatus>('checking');

  readonly backendStatus = this.status.asReadonly();

  private check?: Subscription;

  checkBackend(): void {
    // A slower, older ping must not overwrite the result of a newer one.
    this.check?.unsubscribe();
    this.status.set('checking');
    // Without a timeout a hung backend would leave the chip on "checking" with no retry button.
    this.check = this.erpnext
      .ping()
      .pipe(timeout(PING_TIMEOUT_MS))
      .subscribe({
        next: (ok) => this.status.set(ok ? 'online' : 'offline'),
        error: () => this.status.set('offline'),
      });
  }
}
