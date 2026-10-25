import { createHash } from 'node:crypto';

export interface AuthOptions {
  upstream: string;
  siteHost: string;
  fetch: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  failTtlMs?: number;
  maxEntries?: number;
}

export class UpstreamError extends Error {}

export interface Auth {
  userFor(cookie: string | undefined): Promise<string | null>;
}

export function createAuth(options: AuthOptions): Auth {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 60_000;
  const failTtlMs = options.failTtlMs ?? 20_000;
  const maxEntries = options.maxEntries ?? 5000;
  const cache = new Map<string, { user: string | null; expires: number }>();
  const inFlight = new Map<string, Promise<string | null>>();

  async function call(path: string, params: Record<string, string>, cookie: string) {
    const query = new URLSearchParams(params).toString();
    let response: Response;
    try {
      response = await options.fetch(
        `${options.upstream}/api/method/${path}${query && `?${query}`}`,
        {
          headers: { Cookie: cookie, Host: options.siteHost, Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        },
      );
    } catch {
      throw new UpstreamError('ERPNext unreachable');
    }
    if (response.status >= 500) throw new UpstreamError(`ERPNext answered ${response.status}`);
    if (response.status !== 200) return undefined;
    try {
      return ((await response.json()) as { message?: unknown }).message;
    } catch {
      throw new UpstreamError('ERPNext answered with invalid JSON');
    }
  }

  // Frappe makes a user a System User exactly when one of their roles has desk access, and hides
  // user_type from non-admins, so we read the roles (allowed on own record) and check Role.desk_access.
  async function lookup(cookie: string): Promise<string | null> {
    const user = await call('frappe.auth.get_logged_user', {}, cookie);
    if (typeof user !== 'string' || !user || user === 'Guest') return null;
    const roles = await call(
      'frappe.client.get_list',
      {
        doctype: 'Has Role',
        parent: 'User',
        fields: JSON.stringify(['role']),
        filters: JSON.stringify({ parent: user, parenttype: 'User' }),
        limit_page_length: '0',
      },
      cookie,
    );
    if (!Array.isArray(roles) || roles.length === 0) return null;
    const names = roles.map((r: { role?: unknown }) => r.role).filter((r) => typeof r === 'string');
    const desk = await call(
      'frappe.client.get_list',
      {
        doctype: 'Role',
        fields: JSON.stringify(['name']),
        filters: JSON.stringify({ name: ['in', names], desk_access: 1 }),
        limit_page_length: '1',
      },
      cookie,
    );
    return Array.isArray(desk) && desk.length > 0 ? user : null;
  }

  function remember(key: string, user: string | null, time: number): void {
    cache.delete(key);
    for (const [k, v] of cache) if (v.expires <= time) cache.delete(k);
    while (cache.size >= maxEntries) cache.delete(cache.keys().next().value as string);
    cache.set(key, { user, expires: time + (user ? ttlMs : failTtlMs) });
  }

  return {
    async userFor(cookie) {
      if (!cookie?.trim()) return null;
      const key = createHash('sha256').update(cookie).digest('hex');
      const hit = cache.get(key);
      if (hit && hit.expires > now()) return hit.user;
      const pending = inFlight.get(key);
      if (pending) return pending;
      const run = lookup(cookie)
        .then((user) => {
          remember(key, user, now());
          return user;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, run);
      return run;
    },
  };
}
