import { ClientWindow, PageFetch, PagedList, mapPage, mergeSources, pageOf } from './paged-list';

const rowsOf = (n: number, from = 0) => Array.from({ length: n }, (_, i) => from + i);

/** A source of `total` numbered rows that records how it was asked. */
function source(total: number) {
  const calls: [number, number][] = [];
  const fetch: PageFetch<number> = async (start, size) => {
    calls.push([start, size]);
    const rows = pageOf(rowsOf(total).slice(start, start + size + 1), size);
    return { items: rows.rows, more: rows.more };
  };
  return { fetch, calls };
}

describe('PagedList', () => {
  it('loads the first page of 50 and knows another exists from the 51st row', async () => {
    const list = new PagedList<number>();
    await list.loadFirst(source(120).fetch);

    expect(list.items().length).toBe(50);
    expect(list.hasMore()).toBe(true);
    expect(list.status()).toBe('ready');
  });

  it('has no more when the last page is exactly full', async () => {
    const list = new PagedList<number>();
    await list.loadFirst(source(50).fetch);

    expect(list.items().length).toBe(50);
    expect(list.hasMore()).toBe(false);
  });

  it('appends the next page from where the last one stopped', async () => {
    const { fetch, calls } = source(120);
    const list = new PagedList<number>();
    await list.loadFirst(fetch);
    await list.loadMore();
    await list.loadMore();

    expect(calls.map((c) => c[0])).toEqual([0, 50, 100]);
    expect(list.items()).toEqual(rowsOf(120));
    expect(list.hasMore()).toBe(false);
    await list.loadMore();
    expect(calls.length).toBe(3);
  });

  it('starts over on a new query and drops the old rows at once', async () => {
    const list = new PagedList<number>();
    await list.loadFirst(source(120).fetch);
    const next = list.loadFirst(source(3).fetch);

    expect(list.items()).toEqual([]);
    await next;
    expect(list.items()).toEqual([0, 1, 2]);
    expect(list.hasMore()).toBe(false);
  });

  it('ignores answers from a query that was replaced', async () => {
    let release: (page: { items: number[]; more: boolean }) => void = () => undefined;
    const slow: PageFetch<number> = () => new Promise((resolve) => (release = resolve));
    const list = new PagedList<number>();
    const first = list.loadFirst(slow);
    await list.loadFirst(source(2).fetch);
    release({ items: [99], more: true });
    await first;

    expect(list.items()).toEqual([0, 1]);
    expect(list.hasMore()).toBe(false);
  });

  it('ignores a late next page after a reset', async () => {
    let release: (page: { items: number[]; more: boolean }) => void = () => undefined;
    let calls = 0;
    const fetch: PageFetch<number> = async () => {
      calls += 1;
      return calls === 1
        ? { items: rowsOf(50), more: true }
        : new Promise((resolve) => (release = resolve));
    };
    const list = new PagedList<number>();
    await list.loadFirst(fetch);
    const more = list.loadMore();
    list.reset();
    release({ items: [999], more: false });
    await more;

    expect(list.items()).toEqual([]);
    expect(list.status()).toBe('idle');
    expect(list.loadingMore()).toBe(false);
  });

  it('keeps the rows shown when the next page fails, and retries it', async () => {
    let fail = true;
    const inner = source(80).fetch;
    const fetch: PageFetch<number> = (start, size) =>
      start > 0 && fail ? Promise.reject(new Error('offline')) : inner(start, size);
    const list = new PagedList<number>();
    await list.loadFirst(fetch);
    await list.loadMore();

    expect(list.items().length).toBe(50);
    expect(list.moreFailed()).toBe(true);
    expect(list.hasMore()).toBe(true);
    expect(list.status()).toBe('ready');

    fail = false;
    await list.loadMore();
    expect(list.items().length).toBe(80);
    expect(list.moreFailed()).toBe(false);
  });

  it('reports a failed first page and retries it', async () => {
    let fail = true;
    const inner = source(3).fetch;
    const list = new PagedList<number>();
    await list.loadFirst((s, n) => (fail ? Promise.reject(new Error('x')) : inner(s, n)));
    expect(list.status()).toBe('error');

    fail = false;
    await list.retry();
    expect(list.status()).toBe('ready');
    expect(list.items().length).toBe(3);
  });

  it('counts source rows, not shown rows, and skips repeats', async () => {
    const fetch: PageFetch<{ id: string }> = async (start) => ({
      items: start === 0 ? [{ id: 'a' }, { id: 'a' }, { id: 'b' }] : [{ id: 'b' }, { id: 'c' }],
      more: start === 0,
      fetched: start === 0 ? 3 : 2,
    });
    const list = new PagedList<{ id: string }>({ key: (r) => r.id });
    await list.loadFirst(fetch);
    await list.loadMore();

    expect(list.items().map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('maps pages without losing the cursor', async () => {
    const list = new PagedList<string>();
    await list.loadFirst(mapPage(source(60).fetch, (rows) => rows.map(String)));
    await list.loadMore();

    expect(list.items().length).toBe(60);
  });
});

describe('ClientWindow', () => {
  it('shows 50 and grows by 50', () => {
    const window = new ClientWindow<number>();
    window.set(rowsOf(120));
    expect(window.items().length).toBe(50);
    expect(window.hasMore()).toBe(true);

    window.more();
    window.more();
    expect(window.items().length).toBe(120);
    expect(window.hasMore()).toBe(false);
  });

  it('returns to the first page on a new list, and stays on a refresh', () => {
    const window = new ClientWindow<number>();
    window.set(rowsOf(120));
    window.more();
    window.refresh(rowsOf(130));
    expect(window.items().length).toBe(100);

    window.set(rowsOf(130));
    expect(window.items().length).toBe(50);
  });
});

describe('mergeSources', () => {
  type Row = { name: string; date: number };
  const newest = (a: Row, b: Row) => b.date - a.date || a.name.localeCompare(b.name);
  const by = (row: Row) => row.name;
  const feed = (rows: Row[]) => {
    const calls: [number, number][] = [];
    const read = async (start: number, size: number) => {
      calls.push([start, size]);
      return rows.slice(start, start + size);
    };
    return { read, calls };
  };
  const make = (prefix: string, count: number, step: number, offset = 0): Row[] =>
    Array.from({ length: count }, (_, i) => ({
      name: `${prefix}${String(i).padStart(3, '0')}`,
      date: 1000 - offset - i * step,
    }));

  it('keeps the merged order across pages', async () => {
    const a = make('a', 120, 2);
    const b = make('b', 40, 5, 1);
    const fetch = mergeSources([feed(a).read, feed(b).read], newest, by);
    const list = new PagedList<Row>();
    await list.loadFirst(fetch);
    await list.loadMore();
    await list.loadMore();
    await list.loadMore();

    expect(list.items()).toEqual([...a, ...b].sort(newest));
    expect(list.hasMore()).toBe(false);
  });

  it('asks only the sources that still have rows for more', async () => {
    const small = feed(make('s', 3, 1, 5000));
    const big = feed(make('b', 130, 1));
    const fetch = mergeSources([small.read, big.read], newest, by);
    await fetch(0, 50);
    await fetch(50, 50);
    await fetch(100, 50);

    expect(small.calls.length).toBe(1);
    expect(big.calls.length).toBeGreaterThan(1);
  });

  it('shows one row for a record two sources return', async () => {
    const shared = make('x', 5, 1);
    const fetch = mergeSources([feed(shared).read, feed(shared).read], newest, by);
    const page = await fetch(0, 50);

    expect(page.items.length).toBe(5);
    expect(page.more).toBe(false);
  });

  it('is empty with no rows, and reports the 51st row as more', async () => {
    expect((await mergeSources([feed([]).read], newest, by)(0, 50)).items).toEqual([]);
    const page = await mergeSources([feed(make('a', 51, 1)).read], newest, by)(0, 50);
    expect(page.items.length).toBe(50);
    expect(page.more).toBe(true);
  });
});
