import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { prefillNoticeText } from '../../../core/tasks/prefill-entry';
import { ViewportService } from '../../../core/layout/viewport.service';
import { QuickSaleStore } from '../data-access/quick-sale.store';

/** What every quick-sale container needs: the sale, the user, the business, language, and layout. */
export function injectSaleContext() {
  const store = inject(QuickSaleStore);
  const session = inject(SessionService);
  const business = inject(BusinessService);
  const viewport = inject(ViewportService).viewport;
  const i18n = injectI18n();
  const router = inject(Router);
  return {
    store,
    session,
    business,
    router,
    i18n,
    viewport,
    desktop: computed(() => viewport() !== 'mobile'),
    prefillNotice: computed(() => {
      const notice = store.prefill();
      return notice ? prefillNoticeText(i18n.tr(), notice, 'quick_sale') : null;
    }),
    currency: computed(() => business.active()?.currency ?? ''),
    businessName: computed(() => business.active()?.name ?? ''),
    customerLabel: computed(() =>
      store.walkIn() ? i18n.tr().t('sale.walkInName') : (store.customer()?.name ?? ''),
    ),
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/sales/new', ...path.split('/').filter(Boolean)], extras),
  };
}
