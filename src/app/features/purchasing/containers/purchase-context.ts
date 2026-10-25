import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { prefillNoticeText } from '../../../core/tasks/prefill-entry';
import { ViewportService } from '../../../core/layout/viewport.service';
import { PurchaseOrderStore } from '../data-access/purchase-order.store';

/** What every "New purchase order" container needs: the order, the user, language and layout. */
export function injectPurchaseContext() {
  const store = inject(PurchaseOrderStore);
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
    prefillNotice: computed(() => {
      const notice = store.proposed();
      return notice ? prefillNoticeText(i18n.tr(), notice, 'purchase_order') : null;
    }),
    currency: computed(() => business.active()?.currency ?? ''),
    businessName: computed(() => business.active()?.name ?? ''),
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/purchases/new', ...path.split('/').filter(Boolean)], extras),
    openOrder: (name: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/purchases/order', name], extras),
  };
}
