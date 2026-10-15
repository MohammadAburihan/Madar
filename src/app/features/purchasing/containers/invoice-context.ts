import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SupplierInvoiceStore } from '../data-access/supplier-invoice.store';

/** What every "Record supplier invoice" container needs: the invoice, the user, language and layout. */
export function injectInvoiceContext() {
  const store = inject(SupplierInvoiceStore);
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
    /** A step of the task for the order the store holds, which may differ from the URL's after a resume. */
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(
        ['/purchases/order', store.orderName(), 'invoice', ...path.split('/').filter(Boolean)],
        extras,
      ),
    openOrder: (extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/purchases/order', store.orderName()], extras),
  };
}
