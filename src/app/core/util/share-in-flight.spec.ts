import { shareInFlight } from './share-in-flight';

describe('shareInFlight', () => {
  it('shares one call between concurrent callers and allows a new one afterwards', async () => {
    let calls = 0;
    const load = shareInFlight(async () => ++calls);

    const [a, b] = await Promise.all([load(), load()]);
    expect([a, b, calls]).toEqual([1, 1, 1]);

    expect(await load()).toBe(2);
  });

  it('lets the next call retry after a failure', async () => {
    let fail = true;
    const load = shareInFlight(async () => {
      if (fail) {
        fail = false;
        throw new Error('down');
      }
      return 'ok';
    });

    await expect(load()).rejects.toThrow('down');
    expect(await load()).toBe('ok');
  });
});
