import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { AddStockStore } from '../data-access/add-stock.store';

/** What every "Add stock" step needs: the task, the user, language and layout. */
export function injectAddStockContext() {
  const store = inject(AddStockStore);
  const session = inject(SessionService);
  const viewport = inject(ViewportService).viewport;
  const i18n = injectI18n();
  const router = inject(Router);
  const business = inject(BusinessService);
  return {
    store,
    session,
    router,
    i18n,
    desktop: computed(() => viewport() !== 'mobile'),
    currency: computed(() => business.active()?.currency ?? ''),
    /** Costs are for the roles that see them; the others' lines take each item's own. */
    withCosts: computed(() => session.capabilities().seeCosts),
    warehouseName: (id: string | null) =>
      store.warehouses().find((w) => w.id === id)?.name ?? id ?? '',
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/inventory/add', ...path.split('/').filter(Boolean)], extras),
  };
}
