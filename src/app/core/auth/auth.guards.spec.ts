import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signedInGuard } from './auth.guards';
import { SessionService } from './session.service';

@Component({ template: '' })
class Blank {}

describe('signedInGuard', () => {
  it('keeps query parameters in the return URL', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'sign-in', component: Blank },
          { path: 'task/:action', component: Blank, canMatch: [signedInGuard] },
        ]),
        {
          provide: SessionService,
          useValue: { ensure: () => Promise.resolve(false), status: () => 'signed-out' },
        },
      ],
    });
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/task/sell?customer=X');

    const tree = router.parseUrl(router.url);
    expect(tree.root.children['primary'].segments.map((s) => s.path)).toEqual(['sign-in']);
    expect(tree.queryParams['returnUrl']).toBe('/task/sell?customer=X');
  });
});
