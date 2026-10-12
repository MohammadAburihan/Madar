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
const OMAR: SessionUser = {
  id: 'omar@rehan.example',
  fullName: 'Omar Khalil',
  firstName: 'Omar',
  roles: ['Stock User'],
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
  };
  const api = {
    load: vi.fn(
      options.load ?? (() => Promise.resolve({ data: { todaySales: 1 }, forbidden: false })),
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

  it('treats a 401 from ERPNext as an expired session', async () => {
    const { facade } = setup({
      load: () => Promise.reject(new ErpnextError('unauthorized', 'SessionExpired', 401)),
    });

    await facade.load();

    expect(facade.status()).toBe('expired');
  });

  it('ignores a slower, older load that finishes last', async () => {
    let resolveSlow!: (r: HomeLoadResult) => void;
    const results = [
      new Promise<HomeLoadResult>((resolve) => (resolveSlow = resolve)),
      Promise.resolve({ data: { todaySales: 2 }, forbidden: false }),
    ];
    const { facade } = setup({ load: () => results.shift()! });

    const slow = facade.load();
    await facade.load();
    resolveSlow({ data: { todaySales: 1 }, forbidden: false });
    await slow;

    expect(facade.data()).toEqual({ todaySales: 2 });
    expect(facade.status()).toBe('ready');
  });

  it('drops the previous user’s data when someone else signs in', async () => {
    let finish!: (r: HomeLoadResult) => void;
    const { facade, user, api } = setup({});
    await facade.load();

    api.load.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    user.set(OMAR);
    const loading = facade.load();
    await vi.waitFor(() => expect(api.load).toHaveBeenCalledTimes(2));

    expect(facade.data()).toBeNull();
    finish({ data: { lowStock: { count: 1, warehouse: 'Main warehouse' } }, forbidden: false });
    await loading;
    expect(facade.data()).toEqual({ lowStock: { count: 1, warehouse: 'Main warehouse' } });
  });
});
