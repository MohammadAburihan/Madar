import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { OrderInvoiceStore } from '../data-access/order-invoice.store';

/** What every "Invoice the order" container needs: the invoice, the user, language and layout. */
export function injectOrderInvoiceContext() {
  const store = inject(OrderInvoiceStore);
  const session = inject(SessionService);
  const business = inject(BusinessService);
  const viewport = inject(ViewportService).viewport;
  const i18n = injectI18n();
  const router = inject(Router);
  return {
    store,
    session,
    router,
    i18n,
    desktop: computed(() => viewport() !== 'mobile'),
    currency: computed(() => business.active()?.currency ?? ''),
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(
        ['/sales/orders', store.orderName(), 'invoice', ...path.split('/').filter(Boolean)],
        extras,
      ),
    openOrder: (extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/sales/orders', store.orderName()], extras),
  };
}
