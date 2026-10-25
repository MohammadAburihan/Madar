import { createHash } from 'node:crypto';

export interface AuthOptions {
  upstream: string;
  siteHost: string;
  fetch: typeof fetch;
  now?: () => number;
  ttlMs?: number;
}

export interface Auth {
  userFor(cookie: string | undefined): Promise<string | null>;
}

export function createAuth(options: AuthOptions): Auth {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 60_000;
  const cache = new Map<string, { user: string; expires: number }>();

  async function lookup(cookie: string): Promise<string | null> {
    try {
      const response = await options.fetch(
        `${options.upstream}/api/method/frappe.auth.get_logged_user`,
        {
          headers: { Cookie: cookie, Host: options.siteHost, Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (response.status !== 200) return null;
      const body = (await response.json()) as { message?: unknown };
      const user = typeof body.message === 'string' ? body.message : '';
      return user && user !== 'Guest' ? user : null;
    } catch {
      return null;
    }
  }

  return {
    async userFor(cookie) {
      if (!cookie?.trim()) return null;
      const key = createHash('sha256').update(cookie).digest('hex');
      const hit = cache.get(key);
      if (hit && hit.expires > now()) return hit.user;
      cache.delete(key);
      const user = await lookup(cookie);
      if (user) {
        const time = now();
        for (const [k, v] of cache) if (v.expires <= time) cache.delete(k);
        cache.set(key, { user, expires: time + ttlMs });
      }
      return user;
    },
  };
}
