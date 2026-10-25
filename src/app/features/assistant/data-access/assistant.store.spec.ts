import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SessionService } from '../../../core/auth/session.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AssistantApiService } from './assistant-api.service';
import { AssistantToolsService } from './assistant-tools.service';
import {
  ApiMessage,
  AssistantError,
  AssistantReply,
  ChatRequest,
  ContentBlock,
  RecordLink,
  ToolOutcome,
} from './assistant.models';
import { AssistantStore, MAX_TOOL_ROUNDS } from './assistant.store';

const CONTEXT = {
  business: 'Rehan Nursery',
  currency: 'ILS',
  today: '2026-10-25',
  persona: 'owner',
};

const text = (value: string): AssistantReply => ({
  content: [{ type: 'text', text: value }],
  stopReason: 'end_turn',
});
const toolUse = (id: string, name: string, input: unknown = {}): ContentBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const calls = (...blocks: ContentBlock[]): AssistantReply => ({
  content: blocks,
  stopReason: 'tool_use',
});
const outcome = (content: string, over: Partial<ToolOutcome> = {}): ToolOutcome => ({
  content,
  isError: false,
  forbidden: false,
  records: [],
  ...over,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  TestBed.resetTestingModule();
  const requests: ChatRequest[] = [];
  const api = { chat: vi.fn() };
  const tools = {
    prepare: vi
      .fn()
      .mockResolvedValue({ tools: ['get_today_summary', 'search_customers'], context: CONTEXT }),
    run: vi.fn().mockResolvedValue(outcome('{}')),
  };
  const session = { checkExpired: vi.fn().mockResolvedValue(false) };
  TestBed.configureTestingModule({
    providers: [
      { provide: AssistantApiService, useValue: api },
      { provide: AssistantToolsService, useValue: tools },
      { provide: SessionService, useValue: session },
      { provide: LanguageService, useValue: { language: () => 'ar' } },
    ],
  });
  const replies = (...next: (AssistantReply | Error)[]) => {
    for (const reply of next) {
      api.chat.mockImplementationOnce(async (request: ChatRequest) => {
        requests.push(structuredClone(request));
        if (reply instanceof Error) {
          throw reply;
        }
        return reply;
      });
    }
  };
  return { store: TestBed.inject(AssistantStore), api, tools, session, requests, replies };
}

describe('AssistantStore', () => {
  it('sends the question with the language, context and tools, and keeps the answer', async () => {
    const { store, requests, replies } = setup();
    replies(text('You sold ILS 100.'));
    await store.send('  How much did we sell?  ');
    expect(requests).toEqual([
      {
        language: 'ar',
        context: CONTEXT,
        tools: ['get_today_summary', 'search_customers'],
        messages: [{ role: 'user', content: 'How much did we sell?' }],
      },
    ]);
    expect(store.messages()).toEqual([
      { role: 'user', content: 'How much did we sell?' },
      { role: 'assistant', content: [{ type: 'text', text: 'You sold ILS 100.' }] },
    ]);
    expect(store.state()).toBe('idle');
    expect(store.problem()).toBeNull();
  });

  it('ignores blank text and a send while one is running', async () => {
    const { store, api, replies } = setup();
    await store.send('   ');
    expect(api.chat).not.toHaveBeenCalled();
    const gate = deferred<AssistantReply>();
    api.chat.mockReturnValueOnce(gate.promise);
    const first = store.send('One');
    await store.send('Two');
    expect(api.chat).toHaveBeenCalledTimes(1);
    expect(store.messages()).toHaveLength(1);
    gate.resolve(text('Done'));
    await first;
    replies(text('Again'));
    await store.send('Three');
    expect(store.messages()).toHaveLength(4);
  });

  it('streams text into `streaming` and clears it once the reply is kept', async () => {
    const { store, api } = setup();
    const seen: string[] = [];
    api.chat.mockImplementationOnce(
      async (_request: ChatRequest, _signal: AbortSignal, onText: (delta: string) => void) => {
        onText('Hel');
        onText('lo');
        seen.push(store.streaming());
        return text('Hello');
      },
    );
    await store.send('Hi');
    expect(seen).toEqual(['Hello']);
    expect(store.streaming()).toBe('');
  });

  it('runs the tools the assistant asks for and resends with the results', async () => {
    const { store, tools, requests, replies } = setup();
    const thinking: ContentBlock = {
      type: 'thinking',
      thinking: 'I need the figures',
      signature: 'sig',
    };
    replies(
      calls(thinking, { type: 'text', text: 'Let me check.' }, toolUse('t1', 'get_today_summary')),
      text('Sales today: ILS 100.'),
    );
    tools.run.mockResolvedValueOnce(outcome('{"sales_total":100}'));
    await store.send('How much did we sell?');

    expect(tools.run).toHaveBeenCalledWith('get_today_summary', {});
    expect(requests).toHaveLength(2);
    expect(requests[1].messages).toEqual([
      { role: 'user', content: 'How much did we sell?' },
      {
        role: 'assistant',
        content: [
          thinking,
          { type: 'text', text: 'Let me check.' },
          toolUse('t1', 'get_today_summary'),
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"sales_total":100}' }],
      },
    ]);
    expect(store.messages().at(-1)).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Sales today: ILS 100.' }],
    });
    expect(store.state()).toBe('idle');
  });

  it('shows which lookups are running, then goes back to sending', async () => {
    const { store, tools, replies } = setup();
    replies(calls(toolUse('t1', 'search_customers', { query: 'Lina' })), text('Done'));
    const gate = deferred<ToolOutcome>();
    tools.run.mockReturnValueOnce(gate.promise);
    const sending = store.send('Who is Lina?');
    await vi.waitFor(() => expect(store.state()).toBe('running-tool'));
    expect(store.activeTools()).toEqual(['search_customers']);
    expect(store.busy()).toBe(true);
    gate.resolve(outcome('{}'));
    await sending;
    expect(store.activeTools()).toEqual([]);
    expect(store.state()).toBe('idle');
  });

  it('runs parallel tool calls together and answers them in ONE user message, errors flagged', async () => {
    const { store, tools, requests, replies } = setup();
    replies(
      calls(toolUse('a', 'get_today_summary'), toolUse('b', 'search_customers', { query: 'x' })),
      text('Done'),
    );
    const first = deferred<ToolOutcome>();
    const second = deferred<ToolOutcome>();
    tools.run.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const sending = store.send('Both please');
    await vi.waitFor(() => expect(tools.run).toHaveBeenCalledTimes(2));
    second.resolve(outcome('lookup failed', { isError: true }));
    first.resolve(outcome('{"ok":true}'));
    await sending;

    expect(requests[1].messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'a', content: '{"ok":true}' },
        { type: 'tool_result', tool_use_id: 'b', content: 'lookup failed', is_error: true },
      ],
    });
    expect(requests[1].messages.filter((m) => m.role === 'user')).toHaveLength(2);
  });

  it('allows six rounds of lookups, then gives up rather than loop on', async () => {
    const { store, tools, api, replies } = setup();
    replies(
      ...Array.from({ length: MAX_TOOL_ROUNDS + 1 }, (_, i) =>
        calls(toolUse(`t${i}`, 'get_today_summary')),
      ),
    );
    await store.send('Keep going');
    expect(tools.run).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(api.chat).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
    expect(store.state()).toBe('failed');
    expect(store.problem()).toBe('unavailable');
    expect(JSON.stringify(store.messages().at(-1))).toContain('tool_result');
  });

  it('answers on the sixth round without a problem', async () => {
    const { store, tools, replies } = setup();
    replies(
      ...Array.from({ length: MAX_TOOL_ROUNDS }, (_, i) =>
        calls(toolUse(`t${i}`, 'get_today_summary')),
      ),
      text('Finally'),
    );
    await store.send('Keep going');
    expect(tools.run).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(store.state()).toBe('idle');
    expect(store.problem()).toBeNull();
  });

  it('keeps the records the lookups returned for the reply that follows them', async () => {
    const { store, tools, replies } = setup();
    const link: RecordLink = { kind: 'invoice', id: 'SI-1', label: 'SI-1', mentions: ['SI-1'] };
    replies(calls(toolUse('t1', 'find_invoices')), text('SI-1 is unpaid'));
    tools.run.mockResolvedValueOnce(outcome('{}', { records: [link] }));
    await store.send('Unpaid?');
    expect(store.links()).toEqual({ 3: [link] });
    expect(store.messages()[3].role).toBe('assistant');
  });

  describe('stopping', () => {
    it('keeps the text that had streamed, and no problem', async () => {
      const { store, api } = setup();
      api.chat.mockImplementationOnce(
        (_request: ChatRequest, signal: AbortSignal, onText: (delta: string) => void) =>
          new Promise((_resolve, reject) => {
            onText('Half an ans');
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      );
      const sending = store.send('Tell me');
      await vi.waitFor(() => expect(store.streaming()).toBe('Half an ans'));
      store.stop();
      await sending;
      expect(store.messages()).toEqual([
        { role: 'user', content: 'Tell me' },
        { role: 'assistant', content: [{ type: 'text', text: 'Half an ans' }] },
      ]);
      expect(store.streaming()).toBe('');
      expect(store.state()).toBe('idle');
      expect(store.problem()).toBeNull();
    });

    it('takes back an unanswered tool call and ignores the lookup that finishes late', async () => {
      const { store, tools, api, replies } = setup();
      replies(calls(toolUse('t1', 'get_today_summary')));
      const gate = deferred<ToolOutcome>();
      tools.run.mockReturnValueOnce(gate.promise);
      const sending = store.send('Sales?');
      await vi.waitFor(() => expect(store.state()).toBe('running-tool'));
      store.stop();
      gate.resolve(outcome('{}'));
      await sending;
      expect(store.messages()).toEqual([{ role: 'user', content: 'Sales?' }]);
      expect(api.chat).toHaveBeenCalledTimes(1);
      expect(store.state()).toBe('idle');
      expect(store.problem()).toBeNull();
    });

    it('lets the next question go out as a valid conversation', async () => {
      const { store, requests, replies, api } = setup();
      replies(calls(toolUse('t1', 'get_today_summary')));
      const gate = deferred<ToolOutcome>();
      const { tools } = {
        tools: TestBed.inject(AssistantToolsService) as unknown as {
          run: ReturnType<typeof vi.fn>;
        },
      };
      tools.run.mockReturnValueOnce(gate.promise);
      const sending = store.send('Sales?');
      await vi.waitFor(() => expect(store.state()).toBe('running-tool'));
      store.stop();
      gate.resolve(outcome('{}'));
      await sending;
      replies(text('Answer'));
      await store.send('Again');
      expect(api.chat).toHaveBeenCalledTimes(2);
      const sent: ApiMessage[] = requests[1].messages;
      expect(sent.some((m) => JSON.stringify(m).includes('tool_use'))).toBe(false);
    });

    it('does nothing when nothing is running', () => {
      const { store } = setup();
      expect(() => store.stop()).not.toThrow();
      expect(store.state()).toBe('idle');
    });
  });

  describe('clear', () => {
    it('empties the conversation', async () => {
      const { store, replies } = setup();
      replies(text('Hi'));
      await store.send('Hello');
      store.clear();
      expect(store.messages()).toEqual([]);
      expect(store.links()).toEqual({});
      expect(store.state()).toBe('idle');
    });

    it('cancels a running answer, which then changes nothing', async () => {
      const { store, tools, api, replies } = setup();
      replies(calls(toolUse('t1', 'get_today_summary')));
      const gate = deferred<ToolOutcome>();
      tools.run.mockReturnValueOnce(gate.promise);
      const sending = store.send('Sales?');
      await vi.waitFor(() => expect(store.state()).toBe('running-tool'));
      store.clear();
      gate.resolve(outcome('{}'));
      await sending;
      expect(store.messages()).toEqual([]);
      expect(store.state()).toBe('idle');
      expect(api.chat).toHaveBeenCalledTimes(1);
    });

    it('lets a new question start while the old answer is still unwinding', async () => {
      const { store, api, replies } = setup();
      const gate = deferred<AssistantReply>();
      api.chat.mockReturnValueOnce(gate.promise);
      const old = store.send('Old');
      await vi.waitFor(() => expect(api.chat).toHaveBeenCalledTimes(1));
      store.clear();
      replies(text('New answer'));
      await store.send('New');
      gate.resolve(text('Old answer'));
      await old;
      expect(store.messages()).toEqual([
        { role: 'user', content: 'New' },
        { role: 'assistant', content: [{ type: 'text', text: 'New answer' }] },
      ]);
    });
  });

  describe('problems', () => {
    it.each(['busy', 'rate_limited', 'unavailable', 'refusal'] as const)(
      'shows %s and keeps the conversation',
      async (kind) => {
        const { store, replies } = setup();
        replies(new AssistantError(kind));
        await store.send('Question');
        expect(store.state()).toBe('failed');
        expect(store.problem()).toBe(kind);
        expect(store.messages()).toEqual([{ role: 'user', content: 'Question' }]);
        expect(store.busy()).toBe(false);
      },
    );

    it('treats any other failure as unavailable', async () => {
      const { store, replies } = setup();
      replies(new Error('boom'));
      await store.send('Question');
      expect(store.problem()).toBe('unavailable');
    });

    it('treats a business that will not load as unavailable', async () => {
      const { store, tools, api } = setup();
      tools.prepare.mockRejectedValue(new Error('No business'));
      await store.send('Question');
      expect(store.problem()).toBe('unavailable');
      expect(api.chat).not.toHaveBeenCalled();
    });

    it('drops a tool call a failure left unanswered, and goes on after a problem', async () => {
      const { store, replies } = setup();
      replies(calls(toolUse('t1', 'get_today_summary')), new AssistantError('busy'));
      await store.send('Sales?');
      expect(store.problem()).toBe('busy');
      expect(store.messages().map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
      expect(JSON.stringify(store.messages().at(-1))).toContain('tool_result');

      replies(text('Here you go'));
      await store.send('Try again');
      expect(store.problem()).toBeNull();
      expect(store.state()).toBe('idle');
    });

    it('checks the session when the service says unauthorized, and shows nothing if it ended', async () => {
      const { store, session, replies } = setup();
      session.checkExpired.mockResolvedValue(true);
      replies(new AssistantError('unauthorized'));
      await store.send('Question');
      expect(session.checkExpired).toHaveBeenCalledTimes(1);
      expect(store.problem()).toBeNull();
      expect(store.state()).toBe('idle');
    });

    it('says unavailable when unauthorized but the session is still good', async () => {
      const { store, session, replies } = setup();
      session.checkExpired.mockResolvedValue(false);
      replies(new AssistantError('unauthorized'));
      await store.send('Question');
      expect(store.problem()).toBe('unavailable');
      expect(store.state()).toBe('failed');
    });

    it('checks the session after a refused lookup, and stops if it ended', async () => {
      const { store, tools, session, api, replies } = setup();
      session.checkExpired.mockResolvedValue(true);
      replies(calls(toolUse('t1', 'get_today_summary')), text('never'));
      tools.run.mockResolvedValueOnce(
        outcome('not allowed for your role', { isError: true, forbidden: true }),
      );
      await store.send('Sales?');
      expect(session.checkExpired).toHaveBeenCalledTimes(1);
      expect(api.chat).toHaveBeenCalledTimes(1);
      expect(store.state()).toBe('idle');
      expect(store.problem()).toBeNull();
    });

    it('carries on after a refused lookup when the session is fine, telling the assistant', async () => {
      const { store, tools, session, requests, replies } = setup();
      session.checkExpired.mockResolvedValue(false);
      replies(calls(toolUse('t1', 'find_purchase_orders')), text('You cannot see those.'));
      tools.run.mockResolvedValueOnce(
        outcome('not allowed for your role', { isError: true, forbidden: true }),
      );
      await store.send('Orders?');
      expect(requests[1].messages.at(-1)).toEqual({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't1',
            content: 'not allowed for your role',
            is_error: true,
          },
        ],
      });
      expect(store.state()).toBe('idle');
    });

    it('does not check the session when no lookup was refused', async () => {
      const { store, session, replies } = setup();
      replies(calls(toolUse('t1', 'get_today_summary')), text('ok'));
      await store.send('Sales?');
      expect(session.checkExpired).not.toHaveBeenCalled();
    });
  });
});
