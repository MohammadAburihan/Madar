import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { DeliveryStore } from '../data-access/delivery.store';

/** What every "Deliver order" container needs: the delivery, the user, language and layout. */
export function injectDeliveryContext() {
  const store = inject(DeliveryStore);
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
        ['/sales/orders', store.orderName(), 'deliver', ...path.split('/').filter(Boolean)],
        extras,
      ),
    openOrder: (extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/sales/orders', store.orderName()], extras),
  };
}
