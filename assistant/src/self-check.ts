import { describeApiError } from './errors.js';
import { buildSystem } from './prompt.js';
import type { AnthropicLike } from './server.js';
import { selectTools, toolRegistry } from './tools.js';

export type CheckState =
  { status: 'starting' } | { status: 'ok' } | { status: 'failed'; message: string };

export interface SelfCheck {
  state(): CheckState;
  run(): Promise<void>;
  start(): void;
  stop(): void;
}

export const RETRY_MS = 10 * 60 * 1000;

export function createSelfCheck(deps: {
  client: AnthropicLike;
  model: string;
  log?: (line: string) => void;
  retryMs?: number;
}): SelfCheck {
  const log = deps.log ?? ((line: string) => console.log(line));
  let current: CheckState = { status: 'starting' };
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  async function run(): Promise<void> {
    try {
      const stream = deps.client.messages.stream({
        model: deps.model,
        max_tokens: 1,
        output_config: { effort: 'low' },
        system: buildSystem(
          { business: 'self-check', currency: 'USD', today: '2026-01-01', persona: 'owner' },
          'en',
        ),
        messages: [{ role: 'user', content: 'ping' }],
        tools: selectTools(Object.keys(toolRegistry)),
        tool_choice: { type: 'auto' },
      });
      await stream.finalMessage();
      current = { status: 'ok' };
      log('self-check ok');
    } catch (error) {
      const { status, message } = describeApiError(error);
      current = { status: 'failed', message };
      log(`self-check failed: ${status} ${message}`);
    }
  }

  function cycle(): void {
    void run().finally(() => {
      if (current.status !== 'failed' || stopped) return;
      timer = setTimeout(cycle, deps.retryMs ?? RETRY_MS);
      timer.unref();
    });
  }

  return {
    state: () => current,
    run,
    start() {
      stopped = false;
      cycle();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
