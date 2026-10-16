import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SalesReturnStore } from '../data-access/sales-return.store';

/** What every "Return from sale" container needs: the return, the user, language and layout. */
export function injectReturnContext() {
  const store = inject(SalesReturnStore);
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
    warehouseName: (id: string | null) =>
      store.warehouses().find((w) => w.id === id)?.name ?? id ?? '',
    /** A step of the task for the invoice the store holds, which may differ from the URL's after a resume. */
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(
        ['/sales/invoices', store.invoiceName(), 'return', ...path.split('/').filter(Boolean)],
        extras,
      ),
    openInvoice: (extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/sales/invoices', store.invoiceName()], extras),
  };
}
