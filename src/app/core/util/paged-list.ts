import { computed, signal } from '@angular/core';

export const PAGE_SIZE = 50;

/** One page: `fetched` is how many source rows it used up when some were dropped or merged (default: items). */
export interface Page<T> {
  items: T[];
  more: boolean;
  fetched?: number;
}

/** Reads up to `size` rows from row `start` of a fixed query. */
export type PageFetch<T> = (start: number, size: number) => Promise<Page<T>>;

/** Rows read with one extra row (`size + 1`) say whether another page exists, without a count query. */
export function pageOf<R>(rows: R[], size: number): { rows: R[]; more: boolean } {
  return { rows: rows.slice(0, size), more: rows.length > size };
}

export function mapPage<T, U>(fetch: PageFetch<T>, map: (items: T[]) => U[]): PageFetch<U> {
  return async (start, size) => {
    const page = await fetch(start, size);
    return { ...page, items: map(page.items), fetched: page.fetched ?? page.items.length };
  };
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * A list loaded a page at a time. A reset token drops answers from a query that has since changed; a failed
 * "more" keeps the rows already shown and offers a retry.
 */
export class PagedList<T> {
  readonly items = signal<T[]>([]);
  readonly status = signal<Status>('idle');
  readonly hasMore = signal(false);
  readonly loadingMore = signal(false);
  readonly moreFailed = signal(false);
  /** Why the first page failed, for a screen that tells forbidden from offline. */
  readonly error = signal<unknown>(null);
  readonly loading = computed(() => this.status() === 'loading');
  private fetch: PageFetch<T> | null = null;
  private offset = 0;
  private token = 0;
  private keys = new Set<string>();

  constructor(private readonly options: { size?: number; key?: (item: T) => string } = {}) {}

  private get size(): number {
    return this.options.size ?? PAGE_SIZE;
  }

  /** Starts over with a new query: clears what was shown, so nothing of the old selection lingers. */
  async loadFirst(fetch: PageFetch<T>): Promise<void> {
    const token = this.clear();
    this.fetch = fetch;
    this.status.set('loading');
    try {
      const page = await fetch(0, this.size);
      if (token === this.token) {
        this.append(page);
        this.status.set('ready');
      }
    } catch (error) {
      if (token === this.token) {
        this.error.set(error);
        this.status.set('error');
      }
    }
  }

  async loadMore(): Promise<void> {
    if (!this.fetch || this.status() !== 'ready' || !this.hasMore() || this.loadingMore()) {
      return;
    }
    const token = this.token;
    this.loadingMore.set(true);
    this.moreFailed.set(false);
    try {
      const page = await this.fetch(this.offset, this.size);
      if (token === this.token) {
        this.append(page);
      }
    } catch {
      if (token === this.token) {
        this.moreFailed.set(true);
      }
    } finally {
      if (token === this.token) {
        this.loadingMore.set(false);
      }
    }
  }

  /** Runs the same query again from the first page (the retry after a failed first load). */
  retry(): Promise<void> {
    return this.fetch ? this.loadFirst(this.fetch) : Promise.resolve();
  }

  /** Forgets everything and ignores answers still on their way; for a page entered again. */
  reset(): void {
    this.clear();
    this.fetch = null;
    this.status.set('idle');
  }

  private clear(): number {
    this.items.set([]);
    this.hasMore.set(false);
    this.loadingMore.set(false);
    this.moreFailed.set(false);
    this.error.set(null);
    this.offset = 0;
    this.keys = new Set();
    return ++this.token;
  }

  private append(page: Page<T>): void {
    const key = this.options.key;
    const fresh = key
      ? page.items.filter((item) => {
          const id = key(item);
          return this.keys.has(id) ? false : (this.keys.add(id), true);
        })
      : page.items;
    this.items.update((items) => [...items, ...fresh]);
    this.offset += page.fetched ?? page.items.length;
    this.hasMore.set(page.more);
  }
}

/** A list already held in full that shows a window of it, growing a page at a time. */
export class ClientWindow<T> {
  private readonly shown = signal(PAGE_SIZE);
  private readonly all = signal<readonly T[]>([]);
  readonly items = computed(() => this.all().slice(0, this.shown()));
  readonly hasMore = computed(() => this.all().length > this.shown());

  constructor(private readonly size = PAGE_SIZE) {
    this.shown.set(size);
  }

  /** The full list; the window returns to the first page. */
  set(all: readonly T[]): void {
    this.all.set(all);
    this.shown.set(this.size);
  }

  /** Keeps the window as it is when the same list is refreshed. */
  refresh(all: readonly T[]): void {
    this.all.set(all);
  }

  /** Back to the first page, keeping the list. */
  restart(): void {
    this.shown.set(this.size);
  }

  more(): void {
    this.shown.update((n) => n + this.size);
  }

  reset(): void {
    this.set([]);
  }
}

/**
 * Pages one sorted list that several sources feed (Payment Entry + Journal Entry): each source is read from its own
 * cursor, and a row is shown only once every source that still has rows has read past it, so the merged order
 * stays right. `compare` must be a total order (end it with the name); `key` drops rows two sources both return.
 * Each call builds its own cache, so make one per query.
 */
export function mergeSources<T>(
  sources: readonly ((start: number, size: number) => Promise<T[]>)[],
  compare: (a: T, b: T) => number,
  key: (row: T) => string,
): PageFetch<T> {
  const rows = sources.map(() => [] as T[]);
  const done = sources.map(() => false);
  const chunk = PAGE_SIZE;

  const safeRows = (): T[] => {
    const lasts = rows.filter((r, i) => !done[i] && r.length).map((r) => r[r.length - 1]);
    const edge = lasts.sort(compare)[0];
    const seen = new Set<string>();
    return rows
      .flat()
      .sort(compare)
      .filter((row) => {
        const id = key(row);
        if ((edge && compare(row, edge) > 0) || seen.has(id)) {
          return false;
        }
        seen.add(id);
        return true;
      });
  };

  const read = async (i: number, size: number): Promise<void> => {
    const got = await sources[i](rows[i].length, size);
    rows[i].push(...got);
    if (got.length < size) {
      done[i] = true;
    }
  };

  return async (start, size) => {
    for (;;) {
      const empty = sources.map((_, i) => i).filter((i) => !done[i] && !rows[i].length);
      if (empty.length) {
        await Promise.all(empty.map((i) => read(i, Math.max(chunk, size + 1))));
        continue;
      }
      const safe = safeRows();
      const open = sources.map((_, i) => i).filter((i) => !done[i]);
      if (safe.length > start + size || !open.length) {
        return {
          items: safe.slice(start, start + size),
          more: safe.length > start + size,
        };
      }
      const lowest = open.reduce((a, b) =>
        compare(rows[a][rows[a].length - 1], rows[b][rows[b].length - 1]) <= 0 ? a : b,
      );
      await read(lowest, Math.max(chunk, size + 1));
    }
  };
}

/**
 * A source whose rows are dropped or merged after reading (a filter on the result, repeats): it keeps its own cursor
 * over the raw rows and reads on until it has `size` rows, so a short answer always means "no more".
 * Call it in order, once per page; make one per query.
 */
export function filledSource<T>(
  read: (rawStart: number, size: number) => Promise<{ rows: T[]; raw: number }>,
): (start: number, size: number) => Promise<T[]> {
  let next = 0;
  return async (_start, size) => {
    const out: T[] = [];
    while (out.length < size) {
      const page = await read(next, size);
      next += page.raw;
      out.push(...page.rows);
      if (page.raw < size) {
        break;
      }
    }
    return out;
  };
}
