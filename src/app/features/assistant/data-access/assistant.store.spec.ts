import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { SpeechInput } from '../../../core/speech/speech.models';
import { SPEECH_INPUT } from '../../../core/speech/speech.tokens';
import { AssistantApiService } from './assistant-api.service';
import { AssistantToolsService } from './assistant-tools.service';
import {
  ApiMessage,
  AssistantError,
  AssistantReply,
  ChatRequest,
  ContentBlock,
  Proposal,
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

function fakeSpeech() {
  const session: {
    lang: string;
    partial: (text: string) => void;
    end: () => void;
    fail: (problem: 'denied' | 'nospeech') => void;
  }[] = [];
  const speech = {
    supported: vi.fn().mockResolvedValue(true),
    start: vi.fn(async (lang, partial, end, fail) => {
      session.push({ lang, partial, end, fail });
    }),
    stop: vi.fn(),
  } satisfies SpeechInput;
  return { speech, session };
}

function setup(language = 'ar') {
  TestBed.resetTestingModule();
  const { speech, session: recognitions } = fakeSpeech();
  const requests: ChatRequest[] = [];
  const api = { chat: vi.fn() };
  const tools = {
    prepare: vi
      .fn()
      .mockResolvedValue({ tools: ['get_today_summary', 'search_customers'], context: CONTEXT }),
    run: vi.fn().mockResolvedValue(outcome('{}')),
  };
  const user = signal<{ id: string } | null>({ id: 'lina@rehan.example' });
  const business = signal<{ name: string } | null>({ name: 'Rehan Nursery' });
  const session = { checkExpired: vi.fn().mockResolvedValue(false), user };
  TestBed.configureTestingModule({
    providers: [
      { provide: AssistantApiService, useValue: api },
      { provide: AssistantToolsService, useValue: tools },
      { provide: SessionService, useValue: session },
      { provide: BusinessService, useValue: { active: business } },
      { provide: LanguageService, useValue: { language: () => language } },
      { provide: SPEECH_INPUT, useValue: speech },
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
  return {
    store: TestBed.inject(AssistantStore),
    api,
    tools,
    session,
    user,
    business,
    requests,
    replies,
    speech,
    recognitions,
  };
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

    it('drops blank text from a reply that asks for a lookup, keeping the rest in order', async () => {
      const { store, replies } = setup();
      replies(
        calls(
          { type: 'text', text: '  ' },
          { type: 'thinking', thinking: 'hm', signature: 's' } as ContentBlock,
          { type: 'text', text: 'Checking.' },
          toolUse('t1', 'get_today_summary'),
        ),
        text('Done'),
      );
      await store.send('Hi');
      expect(store.messages()[1]).toEqual({
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'hm', signature: 's' },
          { type: 'text', text: 'Checking.' },
          toolUse('t1', 'get_today_summary'),
        ],
      });
    });

    it('does nothing when nothing is running', () => {
      const { store } = setup();
      expect(() => store.stop()).not.toThrow();
      expect(store.state()).toBe('idle');
    });
  });

  describe('who the conversation belongs to', () => {
    it("starts empty for another user, and never sends the first user's messages", async () => {
      const { store, user, requests, replies } = setup();
      TestBed.tick();
      replies(text('Lina owes 50.'), text('Hello'));
      await store.send('What does Lina owe?');
      user.set({ id: 'sam@rehan.example' });
      TestBed.tick();
      expect(store.messages()).toEqual([]);
      await store.send('Hi');
      expect(requests[1].messages).toEqual([{ role: 'user', content: 'Hi' }]);
    });

    it('clears on sign-out and stops a running answer', async () => {
      const { store, user, api } = setup();
      TestBed.tick();
      const gate = deferred<AssistantReply>();
      api.chat.mockReturnValueOnce(gate.promise);
      const running = store.send('Hello');
      await Promise.resolve();
      user.set(null);
      TestBed.tick();
      gate.resolve(text('Late'));
      await running;
      expect(store.messages()).toEqual([]);
      expect(store.state()).toBe('idle');
    });

    it('clears when the active business changes, but not when it first loads', async () => {
      const { store, business, replies } = setup();
      business.set(null);
      TestBed.tick();
      replies(text('Hi'));
      await store.send('Hello');
      business.set({ name: 'Rehan Nursery' });
      TestBed.tick();
      expect(store.messages()).toHaveLength(2);
      business.set({ name: 'Other Shop' });
      TestBed.tick();
      expect(store.messages()).toEqual([]);
    });
  });

  describe('replies that cannot be kept as they are', () => {
    it('drops tool calls from a reply that is not asking for lookups, keeping its text', async () => {
      const { store, requests, replies } = setup();
      replies(
        {
          content: [
            { type: 'thinking', thinking: 'hm', signature: 's' },
            { type: 'text', text: 'Partly there' },
            toolUse('t1', 'get_today_summary'),
          ],
          stopReason: 'max_tokens',
        },
        text('Fine'),
      );
      await store.send('One');
      expect(store.messages().at(-1)).toEqual({
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'hm', signature: 's' },
          { type: 'text', text: 'Partly there' },
        ],
      });
      await store.send('Two');
      expect(JSON.stringify(requests[1].messages)).not.toContain('tool_use');
    });

    it('shows unavailable and keeps nothing when no text is left', async () => {
      const { store, requests, replies } = setup();
      replies(
        {
          content: [
            { type: 'thinking', thinking: 'hm', signature: 's' },
            toolUse('t1', 'get_today_summary'),
          ],
          stopReason: 'max_tokens',
        },
        text('Fine'),
      );
      await store.send('One');
      expect(store.problem()).toBe('unavailable');
      expect(store.messages()).toEqual([{ role: 'user', content: 'One' }]);
      await store.send('Two');
      expect(JSON.stringify(requests[1].messages)).not.toContain('tool_use');
      expect(JSON.stringify(requests[1].messages)).not.toContain('thinking');
    });

    it.each([[[]], [[{ type: 'text', text: '  ' }]]])(
      'does not store an empty reply (%j)',
      async (content) => {
        const { store, replies } = setup();
        replies({ content, stopReason: 'end_turn' });
        await store.send('One');
        expect(store.problem()).toBe('unavailable');
        expect(store.messages().filter((m) => m.role === 'assistant')).toEqual([]);
      },
    );

    it('shows the refusal notice for a refusal', async () => {
      const { store, replies } = setup();
      replies({ content: [], stopReason: 'refusal' });
      await store.send('One');
      expect(store.problem()).toBe('refusal');
      expect(store.messages()).toEqual([{ role: 'user', content: 'One' }]);
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

  describe('proposals and choices', () => {
    const PROPOSAL: Proposal = {
      id: 'PRP-1',
      kind: 'quick_sale',
      party: 'Lina Haddad',
      item: null,
      lines: [{ name: 'Olive tree', qty: 2, amount: 170 }],
      total: 170,
      amount: null,
      due: null,
      from: null,
      to: null,
      record: null,
      request: {
        kind: 'quick_sale',
        payload: { customer: 'Lina Haddad', lines: [{ item_code: 'OLV-20', qty: 2 }] },
      },
    };
    const CHOICES = [
      { id: 'C-1', label: 'Lina Haddad' },
      { id: 'C-2', label: 'Lina Khoury' },
    ];

    it('keeps the card a proposal tool returned under the reply that follows it', async () => {
      const { store, tools, replies } = setup();
      tools.run.mockResolvedValue(outcome('{"proposal_id":"PRP-1"}', { proposals: [PROPOSAL] }));
      replies(
        calls(toolUse('t1', 'propose_quick_sale', { customer: 'Lina Haddad' })),
        text('Please review it.'),
      );
      await store.send('Sell 2 olive trees to Lina');
      expect(store.proposals()).toEqual({ 3: [PROPOSAL] });
      expect(store.choices()).toEqual({});
      expect(store.proposal('PRP-1')).toBe(PROPOSAL);
      expect(store.proposal('PRP-9')).toBeNull();
    });

    it('keeps every card made while answering one question', async () => {
      const { store, tools, replies } = setup();
      const second = { ...PROPOSAL, id: 'PRP-2' };
      tools.run
        .mockResolvedValueOnce(outcome('{}', { proposals: [PROPOSAL] }))
        .mockResolvedValueOnce(outcome('{}', { proposals: [second] }));
      replies(
        calls(toolUse('t1', 'propose_quick_sale')),
        calls(toolUse('t2', 'propose_quick_sale')),
        text('Review both.'),
      );
      await store.send('Two sales');
      expect(store.proposals()[5]!.map((p) => p.id)).toEqual(['PRP-1', 'PRP-2']);
    });

    it('keeps the matches a name had under the reply that asks which one', async () => {
      const { store, tools, replies } = setup();
      tools.run.mockResolvedValue(outcome('{"needs_choice":true}', { choices: CHOICES }));
      replies(calls(toolUse('t1', 'propose_quick_sale')), text('Which Lina?'));
      await store.send('Sell 2 olive trees to Lina');
      expect(store.choices()).toEqual({ 3: CHOICES });
      expect(store.proposals()).toEqual({});
    });

    it('offers only the last question asked in the turn', async () => {
      const { store, tools, replies } = setup();
      tools.run
        .mockResolvedValueOnce(outcome('{}', { choices: CHOICES }))
        .mockResolvedValueOnce(outcome('{}', { choices: [{ id: 'I-1', label: 'Olive tree' }] }))
        .mockResolvedValueOnce(outcome('{}'));
      replies(
        calls(toolUse('t1', 'propose_quick_sale')),
        calls(toolUse('t2', 'propose_quick_sale')),
        calls(toolUse('t3', 'search_items')),
        text('Which item?'),
      );
      await store.send('Sell');
      expect(store.choices()).toEqual({ 7: [{ id: 'I-1', label: 'Olive tree' }] });
    });

    it('keeps nothing for a reply that failed', async () => {
      const { store, tools, replies } = setup();
      tools.run.mockResolvedValue(outcome('{}', { proposals: [PROPOSAL], choices: CHOICES }));
      replies(calls(toolUse('t1', 'propose_quick_sale')), new AssistantError('unavailable'));
      await store.send('Sell');
      expect(store.proposals()).toEqual({});
      expect(store.choices()).toEqual({});
    });

    it('clears them with the conversation, and when the user or business changes', async () => {
      const { store, tools, replies, user, business } = setup();
      tools.run.mockResolvedValue(outcome('{}', { proposals: [PROPOSAL], choices: CHOICES }));
      replies(calls(toolUse('t1', 'propose_quick_sale')), text('Review it.'));
      await store.send('Sell');
      store.clear();
      expect(store.proposals()).toEqual({});
      expect(store.choices()).toEqual({});
      expect(store.proposal('PRP-1')).toBeNull();

      replies(calls(toolUse('t2', 'propose_quick_sale')), text('Review it.'));
      await store.send('Sell again');
      TestBed.tick();
      user.set({ id: 'sami@rehan.example' });
      TestBed.tick();
      expect(store.proposals()).toEqual({});
      replies(calls(toolUse('t3', 'propose_quick_sale')), text('Review it.'));
      await store.send('Sell once more');
      business.set({ name: 'Other Business' });
      TestBed.tick();
      expect(store.proposals()).toEqual({});
      expect(store.choices()).toEqual({});
    });

    it('sends the user’s pick back like any other message', async () => {
      const { store, tools, replies, requests } = setup();
      tools.run.mockResolvedValue(outcome('{}', { choices: CHOICES }));
      replies(calls(toolUse('t1', 'propose_quick_sale')), text('Which Lina?'), text('Done.'));
      await store.send('Sell 2 olive trees to Lina');
      await store.send('Lina Khoury');
      expect(requests[2].messages.at(-1)).toEqual({ role: 'user', content: 'Lina Khoury' });
    });
  });

  describe('voice', () => {
    it('knows whether the device can recognise speech', async () => {
      const { store, speech } = setup();
      await Promise.resolve();
      expect(store.voiceSupported()).toBe(true);
      speech.supported.mockResolvedValue(false);
      TestBed.resetTestingModule();
    });

    it('listens in the language of the app: Arabic as ar-SA, English as en-US', async () => {
      const arabic = setup('ar');
      await arabic.store.listen(vi.fn());
      expect(arabic.recognitions[0].lang).toBe('ar-SA');
      const english = setup('en');
      await english.store.listen(vi.fn());
      expect(english.recognitions[0].lang).toBe('en-US');
    });

    it('passes what is heard on while listening, and stops listening when it ends', async () => {
      const { store, recognitions } = setup();
      const heard: string[] = [];
      await store.listen((text) => heard.push(text));
      expect(store.listening()).toBe(true);
      recognitions[0].partial('who owes');
      recognitions[0].end();
      expect(heard).toEqual(['who owes']);
      expect(store.listening()).toBe(false);
    });

    it('keeps a second press from starting a second recording, and stops on request', async () => {
      const { store, speech, recognitions } = setup();
      await store.listen(vi.fn());
      await store.listen(vi.fn());
      expect(recognitions).toHaveLength(1);
      store.stopListening();
      expect(speech.stop).toHaveBeenCalledTimes(1);
      expect(store.listening()).toBe(true);
    });

    it('keeps the problem for the notice and clears it on the next try', async () => {
      const { store, recognitions } = setup();
      await store.listen(vi.fn());
      recognitions[0].fail('denied');
      recognitions[0].end();
      expect(store.voiceProblem()).toBe('denied');
      await store.listen(vi.fn());
      expect(store.voiceProblem()).toBeNull();
    });

    it('stops listening before it sends, and drops words that arrive later', async () => {
      const { store, speech, recognitions, replies } = setup();
      const heard = vi.fn();
      await store.listen(heard);
      replies(text('Done'));
      await store.send('Who owes money?');
      expect(speech.stop).toHaveBeenCalled();
      expect(store.listening()).toBe(false);
      recognitions[0].partial('late words');
      recognitions[0].end();
      expect(heard).not.toHaveBeenCalled();
    });

    it('stops listening when the conversation is cleared and when the user signs out', async () => {
      const { store, speech, user, recognitions } = setup();
      TestBed.tick();
      await store.listen(vi.fn());
      store.clear();
      expect(speech.stop).toHaveBeenCalledTimes(1);
      expect(store.listening()).toBe(false);
      await store.listen(vi.fn());
      user.set(null);
      TestBed.tick();
      expect(speech.stop).toHaveBeenCalledTimes(2);
      expect(store.listening()).toBe(false);
      expect(recognitions).toHaveLength(2);
    });
  });
});
