import { Page } from '@playwright/test';

export interface ChatBody {
  language: string;
  context: { business: string; currency: string; today: string; persona: string };
  tools: string[];
  messages: { role: string; content: unknown }[];
}

export type Reply = (body: ChatBody) => {
  status?: number;
  headers?: Record<string, string>;
  body: string;
};

export const sse = (...events: [string, unknown][]) =>
  events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');

export const answer = (content: string) =>
  sse(
    ['text', { text: content }],
    ['message', { content: [{ type: 'text', text: content }], stop_reason: 'end_turn' }],
  );

export const toolCall = (id: string, name: string, input: unknown, say = '') =>
  sse([
    'message',
    {
      content: [
        ...(say ? [{ type: 'text', text: say }] : []),
        { type: 'tool_use', id, name, input },
      ],
      stop_reason: 'tool_use',
    },
  ]);

export const problem = (status: number, code: string, headers: Record<string, string> = {}) => ({
  status,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify({ code }),
});

/** Answers POST /assistant/chat from a script, recording every request; no real model is called. */
export async function scriptAssistant(page: Page, replies: Reply[]): Promise<ChatBody[]> {
  // A browser with voices would add "Read aloud" to every reply; only the voice tests, which set the flag, want it.
  await page.addInitScript(() => {
    if (!(window as { __keepVoices?: boolean }).__keepVoices) {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    }
  });
  const requests: ChatBody[] = [];
  await page.route('**/assistant/chat', async (route) => {
    const body = route.request().postDataJSON() as ChatBody;
    requests.push(body);
    const reply = replies[Math.min(requests.length, replies.length) - 1](body);
    await route.fulfill({
      status: reply.status ?? 200,
      headers: reply.headers ?? { 'Content-Type': 'text/event-stream' },
      body: reply.body,
    });
  });
  return requests;
}

export const field = (page: Page) => page.locator('app-assistant-composer textarea');
export const bubbles = (page: Page, role: 'user' | 'assistant') =>
  page.locator(`app-assistant-message.${role}`);

export async function ask(page: Page, question: string) {
  await field(page).fill(question);
  await field(page).press('Enter');
}
