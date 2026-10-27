import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { STABLE_PROMPT } from '../src/prompt.js';
import { createSelfCheck, type CheckState } from '../src/self-check.js';
import type { AnthropicLike } from '../src/server.js';
import { toolRegistry } from '../src/tools.js';
import { fakeMessage, startHarness, type Harness } from './helpers.js';

const clientWith = (results: (Error | null)[]) => {
  const params: Anthropic.MessageStreamParams[] = [];
  const client: AnthropicLike = {
    messages: {
      stream(p) {
        params.push(p);
        const failure = results.length > 1 ? results.shift()! : results[0]!;
        return {
          on: () => undefined,
          abort: () => undefined,
          finalMessage: async () => {
            if (failure) throw failure;
            return fakeMessage();
          },
        };
      },
    },
  };
  return { client, params };
};

const tooMany = () =>
  new Anthropic.BadRequestError(
    400,
    {
      type: 'error',
      error: { type: 'invalid_request_error', message: 'too many optional parameters (25)' },
    },
    undefined,
    new Headers(),
  );

afterEach(() => vi.useRealTimers());

describe('self-check', () => {
  it('sends one minimal request with every tool and the real system prompt, then reports ok', async () => {
    const { client, params } = clientWith([null]);
    const logs: string[] = [];
    const check = createSelfCheck({ client, model: 'm', log: (l) => logs.push(l) });
    expect(check.state()).toEqual({ status: 'starting' });
    await check.run();
    expect(check.state()).toEqual({ status: 'ok' });
    expect(logs).toEqual(['self-check ok']);
    expect(params).toHaveLength(1);
    const p = params[0]!;
    expect(p.max_tokens).toBe(1);
    expect(p.output_config).toEqual({ effort: 'low' });
    expect(p.messages).toEqual([{ role: 'user', content: 'ping' }]);
    expect((p.tools ?? []).map((t) => ('name' in t ? t.name : ''))).toEqual(
      Object.keys(toolRegistry),
    );
    expect(JSON.stringify(p.system)).toContain(JSON.stringify(STABLE_PROMPT).slice(1, 40));
  });

  it('records a failure with its status and message', async () => {
    const { client } = clientWith([tooMany()]);
    const logs: string[] = [];
    const check = createSelfCheck({ client, model: 'm', log: (l) => logs.push(l) });
    await check.run();
    expect(check.state()).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('too many optional parameters'),
    });
    expect(logs[0]).toMatch(/^self-check failed: 400 .*too many optional parameters/);
  });

  it('retries while failing and stops once it passes', async () => {
    vi.useFakeTimers();
    const { client, params } = clientWith([tooMany(), tooMany(), null]);
    const check = createSelfCheck({ client, model: 'm', log: () => {}, retryMs: 600_000 });
    check.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(check.state().status).toBe('failed');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(check.state().status).toBe('failed');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(check.state()).toEqual({ status: 'ok' });
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(params).toHaveLength(3);
    check.stop();
  });
});

describe('health check with the self-check', () => {
  let h: Harness;
  afterEach(() => h.close());

  it('says starting, then ok, and 503 with the reason after a failure', async () => {
    let state: CheckState = { status: 'starting' };
    h = await startHarness({ selfCheck: { state: () => state } });
    const get = () => fetch(`${h.url}/assistant/healthz`);
    let res = await get();
    expect([res.status, await res.text()]).toEqual([200, 'starting\n']);
    state = { status: 'ok' };
    res = await get();
    expect([res.status, await res.text()]).toEqual([200, 'ok\n']);
    state = { status: 'failed', message: 'too many optional parameters' };
    res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      code: 'self_check_failed',
      message: 'too many optional parameters',
    });
  });
});

describe('config', () => {
  const env = { ANTHROPIC_API_KEY: 'k', ERPNEXT_SITE_HOST: 'h' };

  it('runs the self-check unless ASSISTANT_SELF_CHECK is 0', () => {
    expect(loadConfig(env).selfCheck).toBe(true);
    expect(loadConfig({ ...env, ASSISTANT_SELF_CHECK: '1' }).selfCheck).toBe(true);
    expect(loadConfig({ ...env, ASSISTANT_SELF_CHECK: '0' }).selfCheck).toBe(false);
  });
});
