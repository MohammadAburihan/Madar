import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { CollectionStore } from '../data-access/collection.store';

/** What every "Receive payment" container needs: the collection, the user, the business, language, layout. */
export function injectCollectionContext() {
  const store = inject(CollectionStore);
  const session = inject(SessionService);
  const business = inject(BusinessService);
  const viewport = inject(ViewportService).viewport;
  const i18n = injectI18n();
  const router = inject(Router);
  const clock = inject(SiteClockService);
  return {
    clock,
    store,
    session,
    router,
    i18n,
    viewport,
    desktop: computed(() => viewport() !== 'mobile'),
    currency: computed(() => business.active()?.currency ?? ''),
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/money/receive', ...path.split('/').filter(Boolean)], extras),
  };
}
