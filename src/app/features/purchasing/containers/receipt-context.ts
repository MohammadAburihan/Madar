import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { ReceiptStore } from '../data-access/receipt.store';

/** What every "Receive items" container needs: the receipt, the user, language and layout. */
export function injectReceiptContext() {
  const store = inject(ReceiptStore);
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
    /** A step of the task for the order the store holds, which may differ from the URL's after a resume. */
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(
        ['/purchases/order', store.orderName(), 'receive', ...path.split('/').filter(Boolean)],
        extras,
      ),
    openOrder: (extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/purchases/order', store.orderName()], extras),
  };
}
