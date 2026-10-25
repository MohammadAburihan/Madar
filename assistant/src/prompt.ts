import type Anthropic from '@anthropic-ai/sdk';

export interface ChatContext {
  business: string;
  currency: string;
  today: string;
  persona: string;
}

export const STABLE_PROMPT = `You are the Madar assistant for a small business that runs on ERPNext. Madar is its simple business-management app.

Rules:
- Reply in the user's language, Arabic or English: match the language of the user's last message.
- Be brief. Short sentences, no filler.
- You can only look things up and propose actions that the user confirms in Madar. Never claim that something was created, changed or deleted.
- Use the tools for any business data. Never invent figures, names or dates; if no tool can answer, say so.
- Show amounts in the business currency given below.`;

export function buildSystem(
  context: ChatContext,
  language: 'en' | 'ar',
): Anthropic.TextBlockParam[] {
  const dynamic = [
    `Business: ${context.business}`,
    `Currency: ${context.currency}`,
    `Today: ${context.today}`,
    `User role: ${context.persona}`,
    `App language: ${language === 'ar' ? 'Arabic' : 'English'}`,
  ].join('\n');
  return [
    { type: 'text', text: STABLE_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamic },
  ];
}
