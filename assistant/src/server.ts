import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import type { Auth } from './auth.js';
import type { Config } from './config.js';
import type { Limits } from './limits.js';
import { buildSystem } from './prompt.js';
import { selectTools } from './tools.js';
import { MAX_BODY_BYTES, validateChat } from './validate.js';

export type ErrorCode = 'refusal' | 'rate_limited' | 'unavailable' | 'bad_request' | 'unauthorized';

export interface MessageStreamLike {
  on(event: 'text', listener: (delta: string) => void): unknown;
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

export function errorCodeFor(error: unknown): ErrorCode {
  if (error instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (error instanceof Anthropic.BadRequestError) return 'bad_request';
  return 'unavailable';
}

class BodyTooLarge extends Error {}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers['content-length']);
  if (declared > MAX_BODY_BYTES) throw new BodyTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
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
    const user = await deps.auth.userFor(req.headers.cookie);
    if (!user) return sendError(res, 401, 'unauthorized');

    let body: unknown;
    try {
      body = await readBody(req);
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        res.setHeader('Connection', 'close');
        return sendError(res, 413, 'bad_request');
      }
      return sendError(res, 400, 'bad_request');
    }
    const parsed = validateChat(body);
    if (!parsed.ok) return sendError(res, 400, 'bad_request');
    const request = parsed.value;

    if (!deps.limits.check(user)) return sendError(res, 429, 'rate_limited');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const tools = selectTools(request.tools);
    const stream = deps.client.messages.stream({
      model: deps.config.model,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'low' },
      system: buildSystem(request.context, request.language),
      messages: request.messages,
      ...(tools.length > 0 ? { tools, tool_choice: { type: 'auto' as const } } : {}),
    });
    res.on('close', () => {
      if (!res.writableEnded) stream.abort();
    });
    stream.on('text', (delta) => sendEvent(res, 'text', { text: delta }));

    let stopReason = 'error';
    let usage = '';
    try {
      const message = await stream.finalMessage();
      stopReason = message.stop_reason ?? 'unknown';
      const u = message.usage;
      deps.limits.addOutputTokens(user, u.output_tokens);
      usage = `in=${u.input_tokens} out=${u.output_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0}`;
      if (message.stop_reason === 'refusal') sendEvent(res, 'error', { code: 'refusal' });
      else
        sendEvent(res, 'message', { content: message.content, stop_reason: message.stop_reason });
    } catch (error) {
      const code = errorCodeFor(error);
      stopReason = `error:${code}`;
      if (!res.writableEnded && !res.destroyed) sendEvent(res, 'error', { code });
    }
    res.end();
    log(
      `assistant user=${user} ${usage || 'in=0 out=0 cache_read=0 cache_write=0'} stop=${stopReason} ms=${now() - started}`,
    );
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
        log(`assistant error ${error instanceof Error ? error.message : 'unknown'}`);
        if (!res.headersSent) sendError(res, 500, 'unavailable');
        else res.end();
      });
      return;
    }
    sendJson(res, 404, { code: 'bad_request' });
  });
}
