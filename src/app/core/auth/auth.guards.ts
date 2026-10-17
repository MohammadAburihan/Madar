import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { ConnectionService } from '../business/connection.service';
import { SessionService } from './session.service';

export const signedInGuard: CanMatchFn = async (_route, segments) => {
  const router = inject(Router);
  const session = inject(SessionService);
  const connection = inject(ConnectionService);
  // The whole requested URL, so query parameters survive the trip through connecting and sign-in.
  const requested = router.currentNavigation()?.extractedUrl;
  const returnUrl = requested
    ? router.serializeUrl(requested)
    : '/' + segments.map((s) => s.path).join('/');
  const back = returnUrl === '/' ? null : returnUrl;
  if (!connection.connected()) {
    // The apps need an address to reach at all; on the web, someone already signed in here has it.
    // ERPNext unreachable lets the shell show its connection state, without recording a connection.
    const signedIn = connection.native
      ? false
      : await session.ensure().catch(() => 'unreachable' as const);
    if (!signedIn) {
      return router.createUrlTree(['/connect'], { queryParams: { returnUrl: back } });
    }
    if (signedIn === true) {
      void connection.connect(connection.address() ?? '');
    }
  }
  // When ERPNext is unreachable, let the shell load and show its connection state instead of the sign-in form.
  const signedIn = await session.ensure().catch(() => true);
  if (signedIn) {
    return true;
  }
  return router.createUrlTree(['/sign-in'], {
    queryParams: {
      returnUrl: back,
      expired: session.status() === 'expired' ? 1 : null,
    },
  });
};

export const signedOutGuard: CanMatchFn = async () => {
  if (!inject(ConnectionService).connected()) {
    const router = inject(Router);
    const returnUrl =
      router.currentNavigation()?.extractedUrl.queryParamMap.get('returnUrl') ?? null;
    return router.createUrlTree(['/connect'], { queryParams: { returnUrl } });
  }
  const signedIn = await inject(SessionService)
    .ensure()
    .catch(() => false);
  return signedIn ? inject(Router).createUrlTree(['/']) : true;
};
