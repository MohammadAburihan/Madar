import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ConnectionService } from '../business/connection.service';
import { signedInGuard, signedOutGuard } from './auth.guards';
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
        connected(true),
      ],
    });
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/task/sell?customer=X');

    const tree = router.parseUrl(router.url);
    expect(tree.root.children['primary'].segments.map((s) => s.path)).toEqual(['sign-in']);
    expect(tree.queryParams['returnUrl']).toBe('/task/sell?customer=X');
  });

  it('asks for the business address first when the device isn’t connected', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'connect', component: Blank },
          { path: 'sign-in', component: Blank, canMatch: [signedOutGuard] },
          { path: 'sales', component: Blank, canMatch: [signedInGuard] },
        ]),
        {
          provide: SessionService,
          useValue: { ensure: () => Promise.resolve(false), status: () => 'signed-out' },
        },
        connected(false),
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/sales?x=1');
    expect(router.url).toBe('/connect?returnUrl=%2Fsales%3Fx%3D1');
    await router.navigateByUrl('/sign-in');
    expect(router.url).toBe('/connect');
  });
});

function connected(value: boolean) {
  return {
    provide: ConnectionService,
    useValue: { connected: () => value, native: false, address: () => 'https://rehan.example.com' },
  };
}
