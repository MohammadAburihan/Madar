export interface Usage {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export const emptyUsage = (): Usage => ({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0 });

export function billedTokens(usage: Usage): number {
  return Math.ceil(usage.input + usage.cacheWrite + usage.cacheRead * 0.1 + usage.output);
}

export interface Reservation {
  settle(billed: number): void;
}

export type Refusal = 'busy' | 'rate' | 'budget';

export interface Limits {
  reserve(
    user: string,
    estimate: number,
  ): { ok: true; reservation: Reservation } | { ok: false; reason: Refusal };
}

const DAY_MS = 86_400_000;

export function createLimits(options: {
  ratePerMin: number;
  dailyTokens: number;
  globalDailyTokens: number;
  now?: () => number;
}): Limits {
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();
  const inFlight = new Set<string>();
  let day = Math.floor(now() / DAY_MS);
  let used = new Map<string, number>();
  let globalUsed = 0;
  let globalReserved = 0;

  function rollDay(): void {
    const today = Math.floor(now() / DAY_MS);
    if (today !== day) {
      day = today;
      used = new Map();
      globalUsed = 0;
    }
  }

  function pruneHits(time: number): void {
    for (const [user, times] of hits) {
      const recent = times.filter((t) => t > time - 60_000);
      if (recent.length === 0) hits.delete(user);
      else hits.set(user, recent);
    }
  }

  return {
    reserve(user, estimate) {
      rollDay();
      const time = now();
      pruneHits(time);
      if (inFlight.has(user)) return { ok: false, reason: 'busy' };
      const recent = hits.get(user) ?? [];
      if (recent.length >= options.ratePerMin) return { ok: false, reason: 'rate' };
      if ((used.get(user) ?? 0) + estimate > options.dailyTokens)
        return { ok: false, reason: 'budget' };
      if (globalUsed + globalReserved + estimate > options.globalDailyTokens)
        return { ok: false, reason: 'budget' };

      recent.push(time);
      hits.set(user, recent);
      inFlight.add(user);
      globalReserved += estimate;
      let settled = false;
      return {
        ok: true,
        reservation: {
          settle(billed) {
            if (settled) return;
            settled = true;
            inFlight.delete(user);
            globalReserved -= estimate;
            rollDay();
            used.set(user, (used.get(user) ?? 0) + billed);
            globalUsed += billed;
          },
        },
      };
    },
  };
}
