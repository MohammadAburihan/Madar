import type Anthropic from '@anthropic-ai/sdk';
import type { ChatContext } from './prompt.js';

export const MAX_BODY_BYTES = 200 * 1024;
export const MAX_MESSAGES = 60;

export interface ChatRequest {
  language: 'en' | 'ar';
  context: ChatContext;
  tools: string[];
  messages: Anthropic.MessageParam[];
}

export type Validation = { ok: true; value: ChatRequest } | { ok: false; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Context lands in the system prompt: one short line, so a field can't inject instructions.
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
  const business = line(context['business'], 120);
  const currency = line(context['currency'], 12);
  const persona = line(context['persona'], 40);
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
  for (const m of messages) {
    if (!isObject(m) || (m['role'] !== 'user' && m['role'] !== 'assistant'))
      return fail('message role is invalid');
    const content = m['content'];
    const blocks =
      Array.isArray(content) &&
      content.length > 0 &&
      content.every((b) => isObject(b) && typeof b['type'] === 'string');
    if (typeof content !== 'string' && !blocks) return fail('message content is invalid');
  }
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
      messages: messages as Anthropic.MessageParam[],
    },
  };
}
