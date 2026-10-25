export interface Limits {
  check(user: string): boolean;
  addOutputTokens(user: string, tokens: number): void;
}

export function createLimits(options: {
  ratePerMin: number;
  dailyOutputTokens: number;
  now?: () => number;
}): Limits {
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();
  let day = Math.floor(now() / 86_400_000);
  let tokens = new Map<string, number>();

  function rollDay(): void {
    const today = Math.floor(now() / 86_400_000);
    if (today !== day) {
      day = today;
      tokens = new Map();
    }
  }

  return {
    check(user) {
      rollDay();
      if ((tokens.get(user) ?? 0) >= options.dailyOutputTokens) return false;
      const time = now();
      const recent = (hits.get(user) ?? []).filter((t) => t > time - 60_000);
      if (recent.length >= options.ratePerMin) {
        hits.set(user, recent);
        return false;
      }
      recent.push(time);
      hits.set(user, recent);
      return true;
    },
    addOutputTokens(user, count) {
      rollDay();
      tokens.set(user, (tokens.get(user) ?? 0) + count);
    },
  };
}
