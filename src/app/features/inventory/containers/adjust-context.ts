import { computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { AdjustStore, CountStore, DamageStore } from '../data-access/adjust.store';
import { AdjustKind } from '../data-access/inventory.models';

/** The task a route hosts, from its `kind` data (set on the flow route its steps sit under). */
export function routeKind(route: ActivatedRoute): AdjustKind {
  for (let r: ActivatedRoute | null = route; r; r = r.parent) {
    if (r.snapshot.data['kind']) {
      return r.snapshot.data['kind'] === 'damage' ? 'damage' : 'count';
    }
  }
  return 'count';
}

/** What every count or damage step needs: its task's store, the user, language and layout. */
export function injectAdjustContext() {
  const kind = routeKind(inject(ActivatedRoute));
  const store: AdjustStore = kind === 'count' ? inject(CountStore) : inject(DamageStore);
  const session = inject(SessionService);
  const viewport = inject(ViewportService).viewport;
  const i18n = injectI18n();
  const router = inject(Router);
  return {
    kind,
    store,
    session,
    router,
    i18n,
    desktop: computed(() => viewport() !== 'mobile'),
    warehouse: () => store.warehouses().find((w) => w.id === store.warehouse()) ?? null,
    warehouseName: (id: string | null) =>
      store.warehouses().find((w) => w.id === id)?.name ?? id ?? '',
    /** "adjust.count.title" for the count, "adjust.damage.title" for damage. */
    key: (name: string) => `adjust.${kind}.${name}`,
    go: (path: string, extras?: Parameters<Router['navigate']>[1]) =>
      router.navigate(['/inventory', kind, ...path.split('/').filter(Boolean)], extras),
  };
}
