import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SupplierPaymentStore } from '../data-access/supplier-payment.store';

/** What every "Pay supplier" container needs: the payment, the user, language and layout. */
export function injectPayContext() {
  const store = inject(SupplierPaymentStore);
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
    /** A step of the task for the invoice the store holds, which may differ from the URL's after a resume. */
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(
        ['/purchases/invoice', store.invoiceName(), 'pay', ...path.split('/').filter(Boolean)],
        extras,
      ),
    openInvoice: (name?: string | null, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/purchases/invoice', name ?? store.invoiceName()], extras),
  };
}
