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

  it('asks ERPNext with the cookie and site host, and caches the answer for 60 s', async () => {
    let time = 0;
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ message: 'a@b.c' }), { status: 200 }),
    );
    const auth = createAuth({
      upstream: 'http://erp',
      siteHost: 'site.test',
      fetch: fetchMock as typeof fetch,
      now: () => time,
    });
    expect(await auth.userFor('sid=1')).toBe('a@b.c');
    expect(await auth.userFor('sid=1')).toBe('a@b.c');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://erp/api/method/frappe.auth.get_logged_user');
    expect(init.headers).toMatchObject({ Cookie: 'sid=1', Host: 'site.test' });
    time = 61_000;
    await auth.userFor('sid=1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures and treats network errors as unauthorized', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('down');
    });
    const auth = createAuth({
      upstream: 'http://erp',
      siteHost: 'h',
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(await auth.userFor('sid=1')).toBeNull();
    expect(await auth.userFor('sid=1')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
