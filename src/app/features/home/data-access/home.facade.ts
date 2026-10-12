import { Injectable, inject, signal } from '@angular/core';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ConnectionStatus } from '../../../shared/ui/connection-status.component';

@Injectable({ providedIn: 'root' })
export class HomeFacade {
  private readonly erpnext = inject(ErpnextClient);
  private readonly status = signal<ConnectionStatus>('checking');

  readonly backendStatus = this.status.asReadonly();

  checkBackend(): void {
    this.status.set('checking');
    this.erpnext.ping().subscribe({
      next: (ok) => this.status.set(ok ? 'online' : 'offline'),
      error: () => this.status.set('offline'),
    });
  }
}
