import { describe, expect, it, vi } from 'vitest';
import { createAuth } from '../src/auth.js';
import { startHarness, body } from './helpers.js';

describe('auth', () => {
  it('returns 401 without a cookie', async () => {
    const h = await startHarness();
    const res = await h.post(body(), null);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'unauthorized' });
    await h.close();
  });

  it('returns 401 for a Guest session', async () => {
    const h = await startHarness({ user: null });
    expect((await h.post(body())).status).toBe(401);
    expect(h.params).toHaveLength(0);
    await h.close();
  });

  const erp = (opts: { user?: string; roles?: unknown[]; desk?: unknown[] } = {}) =>
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const message = url.includes('get_logged_user')
        ? (opts.user ?? 'a@b.c')
        : url.includes('doctype=Has+Role')
          ? (opts.roles ?? [{ role: 'Sales User' }])
          : (opts.desk ?? [{ name: 'Sales User' }]);
      return new Response(JSON.stringify({ message }), { status: 200 });
    });

  it('asks ERPNext with the cookie and site host, and caches the answer for 60 s', async () => {
    let time = 0;
    const fetchMock = erp();
    const auth = createAuth({
      upstream: 'http://erp',
      siteHost: 'site.test',
      fetch: fetchMock as unknown as typeof fetch,
      now: () => time,
    });
    expect(await auth.userFor('sid=1')).toBe('a@b.c');
    expect(await auth.userFor('sid=1')).toBe('a@b.c');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://erp/api/method/frappe.auth.get_logged_user');
    expect(init.headers).toMatchObject({ Cookie: 'sid=1', Host: 'site.test' });
    for (const call of fetchMock.mock.calls)
      expect((call as unknown as [string, RequestInit])[1].headers).toMatchObject({
        Cookie: 'sid=1',
        Host: 'site.test',
      });
    time = 61_000;
    await auth.userFor('sid=1');
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('only lets desk users through: a role without desk access is refused', async () => {
    const auth = createAuth({
      upstream: 'http://erp',
      siteHost: 'h',
      fetch: erp({ roles: [{ role: 'Customer' }], desk: [] }) as unknown as typeof fetch,
    });
    expect(await auth.userFor('sid=1')).toBeNull();
    const none = createAuth({
      upstream: 'http://erp',
      siteHost: 'h',
      fetch: erp({ roles: [] }) as unknown as typeof fetch,
    });
    expect(await none.userFor('sid=1')).toBeNull();
  });

  it('caches failures for 20 s and treats network errors as unauthorized', async () => {
    let time = 0;
    const fetchMock = vi.fn(async () => {
      throw new Error('down');
    });
    const auth = createAuth({
      upstream: 'http://erp',
      siteHost: 'h',
      fetch: fetchMock as unknown as typeof fetch,
      now: () => time,
    });
    expect(await auth.userFor('sid=1')).toBeNull();
    expect(await auth.userFor('sid=1')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    time = 21_000;
    expect(await auth.userFor('sid=1')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds the cache, evicting the oldest entry', async () => {
    const fetchMock = erp();
    const auth = createAuth({
      upstream: 'http://erp',
      siteHost: 'h',
      fetch: fetchMock as unknown as typeof fetch,
      maxEntries: 2,
    });
    for (const c of ['a=1', 'b=1', 'c=1']) await auth.userFor(c);
    expect(fetchMock).toHaveBeenCalledTimes(9);
    await auth.userFor('c=1');
    await auth.userFor('b=1');
    expect(fetchMock).toHaveBeenCalledTimes(9);
    await auth.userFor('a=1');
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });
});
