import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { SessionService } from './session.service';

export const signedInGuard: CanMatchFn = async (_route, segments) => {
  const router = inject(Router);
  const session = inject(SessionService);
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
  const signedIn = await inject(SessionService)
    .ensure()
    .catch(() => false);
  return signedIn ? inject(Router).createUrlTree(['/']) : true;
};
