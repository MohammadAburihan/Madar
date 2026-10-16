import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { ConnectionService } from '../business/connection.service';
import { SessionService } from './session.service';

export const signedInGuard: CanMatchFn = async (_route, segments) => {
  const router = inject(Router);
  const session = inject(SessionService);
  const connection = inject(ConnectionService);
  if (!connection.connected()) {
    // The apps need an address to reach at all; on the web, someone already signed in here has it.
    const signedIn = !connection.native && (await session.ensure().catch(() => false));
    if (!signedIn) {
      return router.createUrlTree(['/connect']);
    }
    void connection.connect(connection.address() ?? '');
  }
  // When ERPNext is unreachable, let the shell load and show its connection state instead of the sign-in form.
  const signedIn = await session.ensure().catch(() => true);
  if (signedIn) {
    return true;
  }
  // The whole requested URL, so query parameters survive the trip through sign-in.
  const requested = router.currentNavigation()?.extractedUrl;
  const returnUrl = requested
    ? router.serializeUrl(requested)
    : '/' + segments.map((s) => s.path).join('/');
  return router.createUrlTree(['/sign-in'], {
    queryParams: {
      returnUrl: returnUrl === '/' ? null : returnUrl,
      expired: session.status() === 'expired' ? 1 : null,
    },
  });
};

export const signedOutGuard: CanMatchFn = async () => {
  if (!inject(ConnectionService).connected()) {
    return inject(Router).createUrlTree(['/connect']);
  }
  const signedIn = await inject(SessionService)
    .ensure()
    .catch(() => false);
  return signedIn ? inject(Router).createUrlTree(['/']) : true;
};
