import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AssistantApiService } from './assistant-api.service';
import { AssistantToolsService } from './assistant-tools.service';
import { ToolName, isToolName } from './assistant-tools';
import {
  ApiMessage,
  AssistantError,
  ContentBlock,
  TextBlock,
  ProblemKind,
  RecordLink,
  ToolResultBlock,
  ToolUseBlock,
} from './assistant.models';

export type AssistantState = 'idle' | 'sending' | 'running-tool' | 'failed';

/** Lookups the assistant may chain for one question, then it must answer. */
export const MAX_TOOL_ROUNDS = 6;

class Cancelled extends Error {}

const isToolUse = (block: ContentBlock): block is ToolUseBlock => block.type === 'tool_use';

/** What of a reply that is not asking for a lookup may be kept: its text, and thinking only alongside it. */
function answerOf(content: ContentBlock[]): ContentBlock[] {
  const texts = content.filter(
    (block) => block.type === 'text' && String((block as TextBlock).text ?? '').trim(),
  );
  if (!texts.length) {
    return [];
  }
  return content.filter(
    (block) =>
      block.type === 'thinking' || block.type === 'redacted_thinking' || texts.includes(block),
  );
}

const hasToolUse = (message: ApiMessage | undefined): boolean =>
  message?.role === 'assistant' &&
  Array.isArray(message.content) &&
  message.content.some(isToolUse);

/** The conversation with the assistant, kept while the user moves around the app. */
@Injectable({ providedIn: 'root' })
export class AssistantStore {
  private readonly api = inject(AssistantApiService);
  private readonly tools = inject(AssistantToolsService);
  private readonly session = inject(SessionService);
  private readonly languages = inject(LanguageService);
  private readonly business = inject(BusinessService);

  /** Exactly what the service is sent next: assistant replies keep their thinking and tool_use blocks. */
  readonly messages = signal<ApiMessage[]>([]);
  readonly state = signal<AssistantState>('idle');
  readonly problem = signal<ProblemKind | null>(null);
  /** The reply being written, as far as it has streamed. */
  readonly streaming = signal('');
  readonly activeTools = signal<ToolName[]>([]);
  /** Records the lookups returned for each assistant message, by its position in `messages`. */
  readonly links = signal<Record<number, readonly RecordLink[]>>({});
  readonly busy = computed(() => this.state() === 'sending' || this.state() === 'running-tool');

  private controller: AbortController | null = null;
  private turn = 0;

  constructor() {
    // A conversation holds one user's business data: it never carries over to another user or business.
    let user: string | null | undefined;
    let company: string | null = null;
    effect(() => {
      const nextUser = this.session.user()?.id ?? null;
      const nextCompany = this.business.active()?.name ?? null;
      const userChanged = user !== undefined && user !== nextUser;
      const companyChanged = company !== null && nextCompany !== null && company !== nextCompany;
      user = nextUser;
      company = nextCompany ?? company;
      if (userChanged || companyChanged) {
        this.clear();
      }
    });
  }

  async send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || this.busy()) {
      return;
    }
    const turn = ++this.turn;
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    const check = () => {
      if (signal.aborted) {
        throw new Cancelled();
      }
    };
    this.problem.set(null);
    this.streaming.set('');
    this.messages.update((messages) => [...messages, { role: 'user', content }]);
    this.state.set('sending');
    const records: RecordLink[] = [];
    try {
      const { tools, context } = await this.tools.prepare();
      check();
      for (let round = 0; ; round++) {
        const reply = await this.api.chat(
          { language: this.languages.language(), context, tools, messages: this.messages() },
          signal,
          (delta) => this.streaming.update((streamed) => streamed + delta),
        );
        check();
        this.streaming.set('');
        const calls = reply.content.filter(isToolUse);
        const asksForTools = reply.stopReason === 'tool_use' && calls.length > 0;
        if (!asksForTools) {
          if (reply.stopReason === 'refusal') {
            throw new AssistantError('refusal');
          }
          const answer = answerOf(reply.content);
          if (!answer.length) {
            throw new AssistantError('unavailable');
          }
          this.messages.update((messages) => [...messages, { role: 'assistant', content: answer }]);
          if (records.length) {
            const index = this.messages().length - 1;
            this.links.update((links) => ({ ...links, [index]: records }));
          }
          this.state.set('idle');
          return;
        }
        this.messages.update((messages) => [
          ...messages,
          {
            role: 'assistant',
            content: reply.content.filter(
              (block) => block.type !== 'text' || String((block as TextBlock).text ?? '').trim(),
            ),
          },
        ]);
        if (round >= MAX_TOOL_ROUNDS) {
          throw new AssistantError('unavailable');
        }
        this.state.set('running-tool');
        this.activeTools.set(
          calls.filter((call) => isToolName(call.name)).map((c) => c.name as ToolName),
        );
        const outcomes = await Promise.all(
          calls.map((call) => this.tools.run(call.name, call.input)),
        );
        check();
        if (outcomes.some((outcome) => outcome.forbidden) && (await this.session.checkExpired())) {
          throw new Cancelled();
        }
        check();
        records.push(...outcomes.flatMap((outcome) => outcome.records));
        const results: ToolResultBlock[] = calls.map((call, i) => ({
          type: 'tool_result',
          tool_use_id: call.id,
          content: outcomes[i].content,
          ...(outcomes[i].isError ? { is_error: true } : {}),
        }));
        this.messages.update((messages) => [...messages, { role: 'user', content: results }]);
        this.activeTools.set([]);
        this.state.set('sending');
      }
    } catch (error) {
      if (turn !== this.turn) {
        return;
      }
      this.dropUnansweredToolUse();
      if (signal.aborted || error instanceof Cancelled) {
        this.keepPartialReply();
        this.state.set('idle');
        return;
      }
      const kind = error instanceof AssistantError ? error.kind : 'unavailable';
      this.streaming.set('');
      if (kind === 'unauthorized') {
        const expired = await this.session.checkExpired().catch(() => false);
        if (turn !== this.turn) {
          return;
        }
        this.state.set(expired ? 'idle' : 'failed');
        this.problem.set(expired ? null : 'unavailable');
        return;
      }
      this.problem.set(kind);
      this.state.set('failed');
    } finally {
      if (turn === this.turn) {
        this.activeTools.set([]);
        if (this.controller === controller) {
          this.controller = null;
        }
      }
    }
  }

  /** Stops the answer being written: what has streamed so far stays in the conversation. */
  stop(): void {
    this.controller?.abort();
  }

  /** Starts a new conversation. */
  clear(): void {
    this.turn++;
    this.controller?.abort();
    this.controller = null;
    this.messages.set([]);
    this.links.set({});
    this.streaming.set('');
    this.activeTools.set([]);
    this.problem.set(null);
    this.state.set('idle');
  }

  /** The service refuses a tool_use that no tool_result follows, so a call cut short is taken back. */
  private dropUnansweredToolUse(): void {
    if (hasToolUse(this.messages().at(-1))) {
      this.messages.update((messages) => messages.slice(0, -1));
    }
  }

  private keepPartialReply(): void {
    const partial = this.streaming().trim();
    this.streaming.set('');
    if (partial && this.messages().at(-1)?.role === 'user') {
      this.messages.update((messages) => [
        ...messages,
        { role: 'assistant', content: [{ type: 'text', text: partial }] },
      ]);
    }
  }
}
