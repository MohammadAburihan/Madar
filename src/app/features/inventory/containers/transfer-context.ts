import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { TransferStore } from '../data-access/transfer.store';

/** What every "Move stock" container needs: the transfer, the user, language and layout. */
export function injectTransferContext() {
  const store = inject(TransferStore);
  const session = inject(SessionService);
  const viewport = inject(ViewportService).viewport;
  const i18n = injectI18n();
  const router = inject(Router);
  return {
    store,
    session,
    router,
    i18n,
    desktop: computed(() => viewport() !== 'mobile'),
    warehouseName: (id: string | null) =>
      store.warehouses().find((w) => w.id === id)?.name ?? id ?? '',
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/inventory/transfer', ...path.split('/').filter(Boolean)], extras),
  };
}
