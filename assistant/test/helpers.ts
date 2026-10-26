import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { createAuth } from '../src/auth.js';
import type { ErpRequester } from '../src/erpnext-http.js';
import { createLimits } from '../src/limits.js';
import { createApp, type AnthropicLike, type MessageStreamLike } from '../src/server.js';

export const body = (over: Record<string, unknown> = {}) => ({
  language: 'en',
  context: { business: 'Rehan Nursery', currency: 'ILS', today: '2026-10-25', persona: 'owner' },
  tools: ['get_today_summary'],
  messages: [{ role: 'user', content: 'How much did we sell today?' }],
  ...over,
});

export function fakeMessage(over: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: 'Hello there' }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...over,
  } as Anthropic.Message;
}

export interface Harness {
  url: string;
  server: Server;
  params: Anthropic.MessageStreamParams[];
  logs: string[];
  post(
    payload: unknown,
    cookie?: string | null,
    raw?: string,
    headers?: Record<string, string>,
  ): Promise<Response>;
  close(): Promise<void>;
}

export interface HarnessOptions {
  deltas?: string[];
  message?: Anthropic.Message;
  failWith?: Error;
  user?: string | null;
  ratePerMin?: number;
  dailyTokens?: number;
  globalDailyTokens?: number;
  events?: Anthropic.MessageStreamEvent[];
  hold?: (aborted: () => boolean) => Promise<void>;
  onAbort?: () => void;
  afterReserve?: () => void;
  request?: ErpRequester;
}

export async function startHarness(options: HarnessOptions = {}): Promise<Harness> {
  const params: Anthropic.MessageStreamParams[] = [];
  const logs: string[] = [];
  const client: AnthropicLike = {
    messages: {
      stream(p) {
        params.push(p);
        let listener: (d: string) => void = () => {};
        let events: (e: Anthropic.MessageStreamEvent) => void = () => {};
        let aborted = false;
        const stream: MessageStreamLike = {
          on(event: string, l: unknown) {
            if (event === 'text') listener = l as typeof listener;
            else events = l as typeof events;
            return stream;
          },
          async finalMessage() {
            for (const e of options.events ?? []) events(e);
            if (options.hold) await options.hold(() => aborted);
            if (aborted) throw new Anthropic.APIUserAbortError();
            if (options.failWith) throw options.failWith;
            for (const d of options.deltas ?? ['Hello', ' there']) listener(d);
            return options.message ?? fakeMessage();
          },
          abort() {
            aborted = true;
            options.onAbort?.();
          },
        };
        return stream;
      },
    },
  };
  const user = options.user === undefined ? 'owner@example.com' : options.user;
  const fakeRequest: ErpRequester =
    options.request ??
    (async (url) =>
      url.includes('get_logged_user')
        ? { status: user ? 200 : 403, body: JSON.stringify({ message: user ?? 'Guest' }) }
        : {
            status: 200,
            body: JSON.stringify({ message: [{ role: 'Sales User', name: 'Sales User' }] }),
          });
  const limits = createLimits({
    ratePerMin: options.ratePerMin ?? 20,
    dailyTokens: options.dailyTokens ?? 400000,
    globalDailyTokens: options.globalDailyTokens ?? 3000000,
  });
  const server: Server = createApp({
    config: { model: 'claude-haiku-5-5' },
    client,
    auth: createAuth({ upstream: 'http://erp', siteHost: 'site.test', request: fakeRequest }),
    limits: {
      reserve(u, estimate) {
        const result = limits.reserve(u, estimate);
        if (result.ok) options.afterReserve?.();
        return result;
      },
    },
    log: (l) => logs.push(l),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    server,
    params,
    logs,
    post: (payload, cookie = 'sid=abc', raw, headers = {}) =>
      fetch(`${url}/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Madar-Assistant': '1',
          ...headers,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: raw ?? JSON.stringify(payload),
      }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export function parseSse(text: string): { event: string; data: any }[] {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      return {
        event: lines[0]!.replace('event: ', ''),
        data: JSON.parse(lines[1]!.replace('data: ', '')),
      };
    });
}
