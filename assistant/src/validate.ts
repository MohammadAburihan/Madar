import type Anthropic from '@anthropic-ai/sdk';
import type { ChatContext } from './prompt.js';
import { toolRegistry } from './tools.js';

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_MESSAGES = 60;
export const MAX_TEXT_CHARS = 60_000;
export const PERSONAS = [
  'owner',
  'salesperson',
  'storeAssociate',
  'warehouse',
  'purchasing',
  'projectManager',
] as const;

export interface ChatRequest {
  language: 'en' | 'ar';
  context: ChatContext;
  tools: string[];
  messages: Anthropic.MessageParam[];
}

export type Validation = { ok: true; value: ChatRequest } | { ok: false; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Context is client-supplied and only shapes the caller's own session; nothing server-side trusts it.
// Fields are short single lines so they can't smuggle extra instructions into the prompt.
function line(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const text = v.trim();
  return text.length > 0 && text.length <= max && !/[\r\n]/.test(text) ? text : null;
}

export function validateChat(body: unknown): Validation {
  const fail = (reason: string): Validation => ({ ok: false, reason });
  if (!isObject(body)) return fail('body must be an object');
  const { language, context, tools, messages } = body;
  if (language !== 'en' && language !== 'ar') return fail('language must be en or ar');
  if (!isObject(context)) return fail('context is required');
  const business = line(context['business'], 80);
  const currency = line(context['currency'], 12);
  const persona = PERSONAS.find((p) => p === context['persona']) ?? null;
  const today =
    typeof context['today'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(context['today'])
      ? context['today']
      : null;
  if (!business || !currency || !persona || !today) return fail('context fields are invalid');
  if (!Array.isArray(tools) || tools.length > 50 || tools.some((t) => typeof t !== 'string')) {
    return fail('tools must be a list of names');
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return fail(`messages must hold 1 to ${MAX_MESSAGES} entries`);
  }
  const toolNames = new Set(tools as string[]);
  const clean: Anthropic.MessageParam[] = [];
  const budget = { chars: 0 };
  for (const [i, m] of messages.entries()) {
    if (!isObject(m) || (m['role'] !== 'user' && m['role'] !== 'assistant'))
      return fail('message role is invalid');
    const previous = clean[i - 1];
    const content = cleanContent(m['role'], m['content'], toolNames, previous, budget);
    if (content === null) return fail('message content is invalid');
    clean.push({ role: m['role'], content });
  }
  if (budget.chars > MAX_TEXT_CHARS) return fail('conversation is too long');
  if ((messages[0] as { role: string }).role !== 'user')
    return fail('first message must be from the user');
  if ((messages.at(-1) as { role: string }).role !== 'user')
    return fail('last message must be from the user');
  return {
    ok: true,
    value: {
      language,
      context: { business, currency, today, persona },
      tools: tools as string[],
      messages: clean,
    },
  };
}

type Budget = { chars: number };

function cleanContent(
  role: 'user' | 'assistant',
  content: unknown,
  toolNames: ReadonlySet<string>,
  previous: Anthropic.MessageParam | undefined,
  budget: Budget,
): Anthropic.MessageParam['content'] | null {
  if (typeof content === 'string') {
    budget.chars += content.length;
    return content;
  }
  if (!Array.isArray(content) || content.length === 0) return null;
  const answerable = new Set<string>();
  if (previous?.role === 'assistant' && Array.isArray(previous.content))
    for (const b of previous.content) if (b.type === 'tool_use') answerable.add(b.id);
  const out: Record<string, unknown>[] = [];
  for (const block of content) {
    if (!isObject(block)) return null;
    const type = block['type'];
    if (type === 'text' && typeof block['text'] === 'string') {
      budget.chars += block['text'].length;
      out.push({ type, text: block['text'] });
    } else if (role === 'user' && type === 'tool_result') {
      const id = block['tool_use_id'];
      if (typeof id !== 'string' || !answerable.has(id)) return null;
      const result = cleanResult(block['content'], budget);
      if (result === null) return null;
      const errored = block['is_error'];
      if (errored !== undefined && typeof errored !== 'boolean') return null;
      out.push({
        type,
        tool_use_id: id,
        ...(result !== undefined ? { content: result } : {}),
        ...(errored !== undefined ? { is_error: errored } : {}),
      });
    } else if (role === 'assistant' && (type === 'thinking' || type === 'redacted_thinking')) {
      if (typeof block['thinking'] === 'string') budget.chars += block['thinking'].length;
      const { cache_control: _dropped, ...rest } = block;
      out.push(rest);
    } else if (role === 'assistant' && type === 'tool_use') {
      const { id, name, input } = block;
      if (typeof id !== 'string' || typeof name !== 'string' || !isObject(input)) return null;
      if (!Object.hasOwn(toolRegistry, name) || !toolNames.has(name)) return null;
      out.push({ type, id, name, input });
    } else return null;
  }
  return out as unknown as Anthropic.MessageParam['content'];
}

function cleanResult(
  content: unknown,
  budget: Budget,
): string | Record<string, unknown>[] | null | undefined {
  if (content === undefined) return undefined;
  if (typeof content === 'string') {
    budget.chars += content.length;
    return content;
  }
  if (!Array.isArray(content)) return null;
  const out: Record<string, unknown>[] = [];
  for (const b of content) {
    if (!isObject(b) || b['type'] !== 'text' || typeof b['text'] !== 'string') return null;
    budget.chars += b['text'].length;
    out.push({ type: 'text', text: b['text'] });
  }
  return out;
}
