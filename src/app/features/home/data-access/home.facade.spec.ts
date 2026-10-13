import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SessionService, SessionUser } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { HomeApiService, HomeLoadResult } from './home-api.service';
import { HomeFacade } from './home.facade';

const LINA: SessionUser = {
  id: 'lina@rehan.example',
  fullName: 'Lina Saleh',
  firstName: 'Lina',
  roles: ['Sales User'],
};

function setup(options: {
  user?: SessionUser | null;
  ensure?: () => Promise<boolean>;
  load?: () => Promise<HomeLoadResult>;
}) {
  const user = signal<SessionUser | null>(options.user === undefined ? LINA : options.user);
  const session = {
    user,
    persona: () => 'salesperson' as const,
    ensure: options.ensure ?? (() => Promise.resolve(true)),
    checkExpired: vi.fn(() => Promise.resolve(false)),
    status: () => 'signed-in',
  };
  const api = {
    load: vi.fn(
      options.load ?? (() => Promise.resolve({ data: { todaySales: 1 }, allForbidden: false })),
    ),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SessionService, useValue: session },
      { provide: HomeApiService, useValue: api },
      {
        provide: BusinessService,
        useValue: {
          ensure: () => Promise.resolve({ name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN' }),
        },
      },
      {
        provide: SiteClockService,
        useValue: { ensure: () => Promise.resolve(), now: () => new Date(2026, 9, 13, 9) },
      },
    ],
  });
  return { facade: TestBed.inject(HomeFacade), session, api, user };
}

describe('HomeFacade', () => {
  it('loads Home for the signed-in user at site time', async () => {
    const { facade, api } = setup({});

    await facade.load();

    expect(facade.status()).toBe('ready');
    expect(facade.data()).toEqual({ todaySales: 1 });
    expect(api.load).toHaveBeenCalledWith(
      expect.objectContaining({ companyCurrency: 'ILS', today: new Date(2026, 9, 13, 9) }),
    );
  });

  it('shows the offline state, not an expired session, when the server is unreachable at start-up', async () => {
    const { facade } = setup({
      user: null,
      ensure: () => Promise.reject(new ErpnextError('offline', 'down')),
    });

    await facade.load();

    expect(facade.status()).toBe('offline');
  });

  it('treats a 401 as an expired session when ERPNext no longer knows the session', async () => {
    const { facade, session } = setup({
      load: () => Promise.reject(new ErpnextError('unauthorized', 'SessionExpired', 401)),
    });
    session.checkExpired.mockResolvedValue(true);

    await facade.load();

    expect(facade.status()).toBe('expired');
    expect(session.checkExpired).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable error for a 401 while the session is still valid', async () => {
    const { facade, session } = setup({
      load: () => Promise.reject(new ErpnextError('unauthorized', 'Not allowed', 401)),
    });

    await facade.load();

    expect(facade.status()).toBe('error');
    expect(session.checkExpired).toHaveBeenCalledTimes(1);
  });

  it('ignores a slower, older load that finishes last', async () => {
    let resolveSlow!: (r: HomeLoadResult) => void;
    const results = [
      new Promise<HomeLoadResult>((resolve) => (resolveSlow = resolve)),
      Promise.resolve({ data: { todaySales: 2 }, allForbidden: false }),
    ];
    const { facade } = setup({ load: () => results.shift()! });

    const slow = facade.load();
    await facade.load();
    resolveSlow({ data: { todaySales: 1 }, allForbidden: false });
    await slow;

    expect(facade.data()).toEqual({ todaySales: 2 });
    expect(facade.status()).toBe('ready');
  });

  it('does not start a second load for the user a running load restored', async () => {
    let finish!: (r: HomeLoadResult) => void;
    const { facade, api } = setup({ load: () => new Promise((resolve) => (finish = resolve)) });

    const running = facade.load();
    await vi.waitFor(() => expect(api.load).toHaveBeenCalledTimes(1));
    await facade.loadFor(LINA.id);
    finish({ data: { todaySales: 1 }, allForbidden: false });
    await running;

    expect(api.load).toHaveBeenCalledTimes(1);
    void facade.loadFor(LINA.id);
    await vi.waitFor(() => expect(api.load).toHaveBeenCalledTimes(2));
  });

  it('sends someone who was never signed in to sign-in without an "expired" notice', async () => {
    const { facade, session } = setup({ user: null, ensure: () => Promise.resolve(false) });
    (session as unknown as { status: () => string }).status = () => 'signed-out';

    await facade.load();

    expect(facade.status()).toBe('signed-out');
  });

  it('skips the session check when only some data was refused', async () => {
    const { facade, session } = setup({
      load: () => Promise.resolve({ data: { todaySales: 1 }, allForbidden: false }),
    });

    await facade.load();

    expect(session.checkExpired).not.toHaveBeenCalled();
  });
});
