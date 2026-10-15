import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SupplyStore } from '../data-access/supply.store';

/** What every "Supply a project" container needs: the delivery, the user, language and layout. */
export function injectSupplyContext() {
  const store = inject(SupplyStore);
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
    /** A step of the task for the project and item the store holds, which may differ from the URL's after a resume. */
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(
        ['/projects', store.project(), 'supply', store.item(), ...path.split('/').filter(Boolean)],
        extras,
      ),
    openProject: (extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/projects', store.project()], extras),
  };
}
