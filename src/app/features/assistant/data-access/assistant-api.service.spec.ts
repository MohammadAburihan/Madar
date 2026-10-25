import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { RuntimeConfigService } from '../../../core/config/runtime-config';
import { NATIVE_PLATFORM, NativePlatform } from '../../../core/platform/native-platform';
import { AssistantApiService } from './assistant-api.service';
import { AssistantError, ChatRequest } from './assistant.models';

const REQUEST: ChatRequest = {
  language: 'en',
  context: { business: 'Rehan Nursery', currency: 'ILS', today: '2026-10-25', persona: 'owner' },
  tools: ['get_today_summary'],
  messages: [{ role: 'user', content: 'Hi' }],
};

const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const MESSAGE = event('message', {
  content: [{ type: 'text', text: 'Hello there' }],
  stop_reason: 'end_turn',
});

const streamOf = (chunks: string[], type = 'text/event-stream') =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': type } },
  );

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup(platform: NativePlatform = 'web', erpnextUrl = '') {
  TestBed.resetTestingModule();
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  TestBed.configureTestingModule({
    providers: [
      { provide: NATIVE_PLATFORM, useValue: platform },
      { provide: RuntimeConfigService, useValue: { erpnextUrl: () => erpnextUrl } },
    ],
  });
  const api = TestBed.inject(AssistantApiService);
  const texts: string[] = [];
  const chat = (signal = new AbortController().signal) =>
    api.chat(REQUEST, signal, (delta) => texts.push(delta));
  return { fetchMock, texts, chat };
}

const kindOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AssistantError);
  return (error as AssistantError).kind;
};

afterEach(() => vi.unstubAllGlobals());

describe('AssistantApiService', () => {
  it('posts the conversation with the headers the service requires, with cookies', async () => {
    const { fetchMock, chat } = setup('web', 'https://madar.example');
    fetchMock.mockResolvedValue(streamOf([MESSAGE]));
    await chat();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://madar.example/assistant/chat');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Madar-Assistant': '1',
    });
    expect(JSON.parse(init.body as string)).toEqual(REQUEST);
  });

  it('uses the same origin when no address is configured', async () => {
    const { fetchMock, chat } = setup();
    fetchMock.mockResolvedValue(streamOf([MESSAGE]));
    await chat();
    expect(fetchMock.mock.calls[0][0]).toBe('/assistant/chat');
  });

  it('streams text as it arrives and returns the whole reply, whatever the chunk boundaries', async () => {
    const { fetchMock, texts, chat } = setup();
    const body = event('text', { text: 'Hel' }) + event('text', { text: 'lo' }) + MESSAGE;
    fetchMock.mockResolvedValue(streamOf([body.slice(0, 20), body.slice(20, 61), body.slice(61)]));
    expect(await chat()).toEqual({
      content: [{ type: 'text', text: 'Hello there' }],
      stopReason: 'end_turn',
    });
    expect(texts).toEqual(['Hel', 'lo']);
  });

  it('keeps tool_use and thinking blocks exactly as sent', async () => {
    const { fetchMock, chat } = setup();
    const content = [
      { type: 'thinking', thinking: 'hm', signature: 'sig' },
      { type: 'tool_use', id: 't1', name: 'search_customers', input: { query: 'Lina' } },
    ];
    fetchMock.mockResolvedValue(streamOf([event('message', { content, stop_reason: 'tool_use' })]));
    expect(await chat()).toEqual({ content, stopReason: 'tool_use' });
  });

  it('decodes multi-byte text split across chunks', async () => {
    const { fetchMock, texts, chat } = setup();
    const bytes = new TextEncoder().encode(event('text', { text: 'مرحبا' }) + MESSAGE);
    const cut = 30;
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, cut));
            controller.enqueue(bytes.slice(cut));
            controller.close();
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    await chat();
    expect(texts).toEqual(['مرحبا']);
  });

  it('reads the whole body at once in the native apps, whose HTTP layer cannot stream', async () => {
    const { fetchMock, texts, chat } = setup('android', 'https://madar.example');
    const response = streamOf([event('text', { text: 'Hi' }) + MESSAGE]);
    const read = vi.spyOn(response, 'text');
    fetchMock.mockResolvedValue(response);
    expect((await chat()).stopReason).toBe('end_turn');
    expect(read).toHaveBeenCalled();
    expect(texts).toEqual(['Hi']);
  });

  it.each([
    [401, { code: 'unauthorized' }, 'unauthorized'],
    [429, { code: 'busy' }, 'busy'],
    [429, { code: 'rate_limited' }, 'rate_limited'],
    [429, {}, 'rate_limited'],
    [403, { code: 'forbidden' }, 'unavailable'],
    [400, { code: 'bad_request' }, 'unavailable'],
    [413, { code: 'bad_request' }, 'unavailable'],
    [503, { code: 'unavailable' }, 'unavailable'],
    [500, { code: 'unavailable' }, 'unavailable'],
    [404, '<html>Not found</html>', 'unavailable'],
  ])('maps a %i answer %j to %s', async (status, body, kind) => {
    const { fetchMock, chat } = setup();
    fetchMock.mockResolvedValue(json(status, body));
    expect(await kindOf(chat())).toBe(kind);
  });

  it('treats a lost connection as unavailable', async () => {
    const { fetchMock, chat } = setup();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await kindOf(chat())).toBe('unavailable');
  });

  it('treats a page that is not an event stream (no service behind the address) as unavailable', async () => {
    const { fetchMock, chat } = setup();
    fetchMock.mockResolvedValue(streamOf(['<!doctype html>'], 'text/html'));
    expect(await kindOf(chat())).toBe('unavailable');
  });

  it('reports a refusal and any other stream error, after the text that came before it', async () => {
    const refusal = setup();
    refusal.fetchMock.mockResolvedValue(
      streamOf([event('text', { text: 'No' }), event('error', { code: 'refusal' })]),
    );
    expect(await kindOf(refusal.chat())).toBe('refusal');
    expect(refusal.texts).toEqual(['No']);

    const other = setup();
    other.fetchMock.mockResolvedValue(streamOf([event('error', { code: 'unavailable' })]));
    expect(await kindOf(other.chat())).toBe('unavailable');
  });

  it('treats a stream that ends without a reply, or with a broken one, as unavailable', async () => {
    const empty = setup();
    empty.fetchMock.mockResolvedValue(streamOf([event('text', { text: 'Hi' })]));
    expect(await kindOf(empty.chat())).toBe('unavailable');

    const broken = setup();
    broken.fetchMock.mockResolvedValue(streamOf([event('message', { content: 'nope' })]));
    expect(await kindOf(broken.chat())).toBe('unavailable');
  });

  it('lets an abort through as it is, not as a problem', async () => {
    const { fetchMock, chat } = setup();
    const controller = new AbortController();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      controller.abort();
      return Promise.reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    });
    const error = await chat(controller.signal).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(AssistantError);
    expect((error as Error).name).toBe('AbortError');
  });
});
