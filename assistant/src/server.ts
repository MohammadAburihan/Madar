import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { UpstreamError, type Auth } from './auth.js';
import type { Config } from './config.js';
import { billedTokens, emptyUsage, type Limits, type Usage } from './limits.js';
import { buildSystem } from './prompt.js';
import { selectTools } from './tools.js';
import { MAX_BODY_BYTES, validateChat } from './validate.js';

export type ErrorCode =
  | 'refusal'
  | 'rate_limited'
  | 'busy'
  | 'unavailable'
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden';

export interface MessageStreamLike {
  on(event: 'text', listener: (delta: string) => void): unknown;
  on(event: 'streamEvent', listener: (event: Anthropic.MessageStreamEvent) => void): unknown;
  finalMessage(): Promise<Anthropic.Message>;
  abort(): void;
}

export interface AnthropicLike {
  messages: { stream(params: Anthropic.MessageStreamParams): MessageStreamLike };
}

export interface Deps {
  config: Pick<Config, 'model'>;
  client: AnthropicLike;
  auth: Auth;
  limits: Limits;
  log?: (line: string) => void;
  now?: () => number;
}

const MAX_TOKENS = 4096;
const DAY_MS = 86_400_000;

export function errorCodeFor(error: unknown): ErrorCode {
  if (error instanceof Anthropic.BadRequestError) return 'bad_request';
  return 'unavailable';
}

const ALLOWED_ORIGINS = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost']);

function crossSite(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return false;
  if (ALLOWED_ORIGINS.has(origin)) return false;
  try {
    const parsed = new URL(origin);
    // Re-parsing the Host under the Origin's scheme drops that scheme's default port on both sides.
    return parsed.host !== new URL(`${parsed.protocol}//${req.headers.host}`).host;
  } catch {
    return true;
  }
}

function isJsonRequest(req: IncomingMessage): boolean {
  const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  return type === 'application/json' && req.headers['x-madar-assistant'] === '1';
}

const mergeUsage = (seen: Usage, next: Partial<Usage>): void => {
  seen.input = Math.max(seen.input, next.input ?? 0);
  seen.cacheWrite = Math.max(seen.cacheWrite, next.cacheWrite ?? 0);
  seen.cacheRead = Math.max(seen.cacheRead, next.cacheRead ?? 0);
  seen.output = Math.max(seen.output, next.output ?? 0);
};

function fromUsage(u: {
  input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  output_tokens?: number | null;
}): Usage {
  return {
    input: u.input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
  };
}

const describe = (u: Usage): string =>
  `in=${u.input} out=${u.output} cache_read=${u.cacheRead} cache_write=${u.cacheWrite}`;

// Only the class and status are logged: never headers, cookies or message content.
function describeError(error: unknown): string {
  const name = error instanceof Error ? error.constructor.name : 'unknown';
  const status = error instanceof Anthropic.APIError ? (error.status ?? 'none') : 'none';
  const throttled = error instanceof Anthropic.RateLimitError ? ' provider_rate_limited' : '';
  return ` error=${name} status=${status}${throttled}`;
}

class BodyTooLarge extends Error {}

async function readBody(req: IncomingMessage): Promise<{ value: unknown; bytes: number }> {
  const declared = Number(req.headers['content-length']);
  if (declared > MAX_BODY_BYTES) throw new BodyTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')), bytes: size };
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(JSON.stringify(body));
}

const sendError = (res: ServerResponse, status: number, code: ErrorCode): void =>
  sendJson(res, status, { code });

function sendEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createApp(deps: Deps): Server {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));

  async function chat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = now();
    let stream: MessageStreamLike | undefined;
    res.on('close', () => {
      if (stream && !res.writableEnded) stream.abort();
    });

    if (!isJsonRequest(req) || crossSite(req)) return sendError(res, 403, 'forbidden');
    let user: string | null;
    try {
      user = await deps.auth.userFor(req.headers.cookie);
    } catch (error) {
      if (error instanceof UpstreamError) return sendError(res, 503, 'unavailable');
      throw error;
    }
    if (!user) return sendError(res, 401, 'unauthorized');

    let body: { value: unknown; bytes: number };
    try {
      body = await readBody(req);
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        res.setHeader('Connection', 'close');
        return sendError(res, 413, 'bad_request');
      }
      return sendError(res, 400, 'bad_request');
    }
    const parsed = validateChat(body.value);
    if (!parsed.ok) return sendError(res, 400, 'bad_request');
    const request = parsed.value;

    const reserved = deps.limits.reserve(user, Math.ceil(body.bytes / 3) + MAX_TOKENS);
    if (!reserved.ok) {
      if (reserved.reason === 'busy')
        return sendJson(res, 429, { code: 'busy' }, { 'Retry-After': '2' });
      const wait = reserved.reason === 'rate' ? 60 : Math.ceil((DAY_MS - (now() % DAY_MS)) / 1000);
      return sendJson(res, 429, { code: 'rate_limited' }, { 'Retry-After': String(wait) });
    }
    const { reservation } = reserved;
    const seen = emptyUsage();
    let usageLine = 'in=0 out=0 cache_read=0 cache_write=0';
    let stopReason = 'error';
    let failure = '';
    try {
      if (req.socket.destroyed || res.destroyed || res.writableEnded) {
        stopReason = 'disconnected';
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const tools = selectTools(request.tools);
      stream = deps.client.messages.stream({
        model: deps.config.model,
        max_tokens: MAX_TOKENS,
        output_config: { effort: 'low' },
        cache_control: { type: 'ephemeral' },
        system: buildSystem(request.context, request.language),
        messages: request.messages,
        ...(tools.length > 0 ? { tools, tool_choice: { type: 'auto' as const } } : {}),
      });
      if (res.destroyed) stream.abort();
      stream.on('text', (delta) => sendEvent(res, 'text', { text: delta }));
      stream.on('streamEvent', (event) => {
        if (event.type === 'message_start') mergeUsage(seen, fromUsage(event.message.usage));
        else if (event.type === 'message_delta') mergeUsage(seen, fromUsage(event.usage));
      });

      try {
        const message = await stream.finalMessage();
        stopReason = message.stop_reason ?? 'unknown';
        mergeUsage(seen, fromUsage(message.usage));
        usageLine = describe(seen);
        if (message.stop_reason === 'refusal') sendEvent(res, 'error', { code: 'refusal' });
        else
          sendEvent(res, 'message', { content: message.content, stop_reason: message.stop_reason });
      } catch (error) {
        const code = errorCodeFor(error);
        stopReason = `error:${code}`;
        usageLine = describe(seen);
        failure = describeError(error);
        if (!res.writableEnded && !res.destroyed) sendEvent(res, 'error', { code });
      }
      res.end();
    } finally {
      reservation.settle(billedTokens(seen));
      log(`assistant user=${user} ${usageLine} stop=${stopReason}${failure} ms=${now() - started}`);
    }
  }

  return createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && path === '/assistant/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok\n');
      return;
    }
    if (path === '/assistant/chat') {
      if (req.method !== 'POST') return sendJson(res, 405, { code: 'bad_request' });
      chat(req, res).catch((error: unknown) => {
        log(`assistant error ${error instanceof Error ? error.name : 'unknown'}`);
        if (!res.headersSent) sendError(res, 500, 'unavailable');
        else res.end();
      });
      return;
    }
    sendJson(res, 404, { code: 'bad_request' });
  });
}
