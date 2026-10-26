import { describe, expect, it, vi } from 'vitest';
import { createAuth, UpstreamError } from '../src/auth.js';
import type { ErpRequest, ErpRequester } from '../src/erpnext-http.js';
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
    vi.fn(async (url: string, _request?: ErpRequest) => {
      const message = url.includes('get_logged_user')
        ? (opts.user ?? 'a@b.c')
        : url.includes('doctype=Has+Role')
          ? (opts.roles ?? [{ role: 'Sales User' }])
          : (opts.desk ?? [{ name: 'Sales User' }]);
      return { status: 200, body: JSON.stringify({ message }) };
    });

  it('asks ERPNext with the cookie and site host, and caches the answer for 60 s', async () => {
    let time = 0;
    const requestMock = erp();
    const auth = createAuth({
      upstream: 'http://erp',
      siteHost: 'site.test',
      request: requestMock as unknown as ErpRequester,
      now: () => time,
    });
    expect(await auth.userFor('sid=1')).toBe('a@b.c');
    expect(await auth.userFor('sid=1')).toBe('a@b.c');
    expect(requestMock).toHaveBeenCalledTimes(3);
    const [url, init] = requestMock.mock.calls[0] as unknown as [string, ErpRequest];
    expect(url).toBe('http://erp/api/method/frappe.auth.get_logged_user');
    expect(init.headers).toMatchObject({ Cookie: 'sid=1', Host: 'site.test' });
    for (const call of requestMock.mock.calls)
      expect((call as unknown as [string, ErpRequest])[1].headers).toMatchObject({
        Cookie: 'sid=1',
        Host: 'site.test',
      });
    time = 61_000;
    await auth.userFor('sid=1');
    expect(requestMock).toHaveBeenCalledTimes(6);
  });

  it('only lets desk users through: a role without desk access is refused', async () => {
    const auth = createAuth({
      upstream: 'http://erp',
      siteHost: 'h',
      request: erp({ roles: [{ role: 'Customer' }], desk: [] }) as unknown as ErpRequester,
    });
    expect(await auth.userFor('sid=1')).toBeNull();
    const none = createAuth({
      upstream: 'http://erp',
      siteHost: 'h',
      request: erp({ roles: [] }) as unknown as ErpRequester,
    });
    expect(await none.userFor('sid=1')).toBeNull();
  });

  it('caches a refusal for 20 s', async () => {
    let time = 0;
    const requestMock = vi.fn(async () => ({ status: 403, body: '{}' }));
    const auth = createAuth({
      upstream: 'http://erp',
      siteHost: 'h',
      request: requestMock as unknown as ErpRequester,
      now: () => time,
    });
    expect(await auth.userFor('sid=1')).toBeNull();
    expect(await auth.userFor('sid=1')).toBeNull();
    expect(requestMock).toHaveBeenCalledTimes(1);
    time = 21_000;
    expect(await auth.userFor('sid=1')).toBeNull();
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it('throws UpstreamError on network errors, timeouts and 5xx, and does not cache them', async () => {
    for (const fail of [
      async () => {
        throw new Error('down');
      },
      async () => {
        throw new Error('ERPNext request timed out');
      },
      async () => ({ status: 502, body: 'oops' }),
      async () => ({ status: 200, body: '<html>' }),
    ]) {
      const requestMock = vi.fn(fail);
      const auth = createAuth({
        upstream: 'http://erp',
        siteHost: 'h',
        request: requestMock as unknown as ErpRequester,
      });
      await expect(auth.userFor('sid=1')).rejects.toBeInstanceOf(UpstreamError);
      await expect(auth.userFor('sid=1')).rejects.toBeInstanceOf(UpstreamError);
      expect(requestMock).toHaveBeenCalledTimes(2);
    }
  });

  it('bounds the cache, evicting the oldest entry', async () => {
    const requestMock = erp();
    const auth = createAuth({
      upstream: 'http://erp',
      siteHost: 'h',
      request: requestMock as unknown as ErpRequester,
      maxEntries: 2,
    });
    for (const c of ['a=1', 'b=1', 'c=1']) await auth.userFor(c);
    expect(requestMock).toHaveBeenCalledTimes(9);
    await auth.userFor('c=1');
    await auth.userFor('b=1');
    expect(requestMock).toHaveBeenCalledTimes(9);
    await auth.userFor('a=1');
    expect(requestMock).toHaveBeenCalledTimes(12);
  });
});
