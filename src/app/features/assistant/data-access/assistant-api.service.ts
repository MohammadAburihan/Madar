import { Injectable, inject } from '@angular/core';
import { RuntimeConfigService } from '../../../core/config/runtime-config';
import { NATIVE_PLATFORM } from '../../../core/platform/native-platform';
import {
  AssistantError,
  AssistantReply,
  ChatRequest,
  ContentBlock,
  ProblemKind,
} from './assistant.models';
import { SseEvent, SseParser } from './sse-parser';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** What a refused request means for the user, from the status and the service's error code. */
export function problemForResponse(status: number, code: unknown): AssistantError {
  if (status === 401) {
    return new AssistantError('unauthorized');
  }
  if (status === 429) {
    return new AssistantError(code === 'busy' ? 'busy' : 'rate_limited');
  }
  return new AssistantError('unavailable');
}

function problemForStreamError(code: unknown): ProblemKind {
  return code === 'refusal' ? 'refusal' : 'unavailable';
}

/** Talks to the assistant service behind madar-web's `/assistant/` proxy. */
@Injectable({ providedIn: 'root' })
export class AssistantApiService {
  private readonly config = inject(RuntimeConfigService);
  private readonly platform = inject(NATIVE_PLATFORM);

  /**
   * Sends the conversation and resolves with the assistant's whole reply. `onText` gets text as it streams;
   * the native apps' HTTP layer can't stream, so there it arrives in one go.
   */
  async chat(
    request: ChatRequest,
    signal: AbortSignal,
    onText: (delta: string) => void,
  ): Promise<AssistantReply> {
    let response: Response;
    try {
      response = await fetch(`${this.config.erpnextUrl()}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Madar-Assistant': '1' },
        body: JSON.stringify(request),
        credentials: 'include',
        signal,
      });
    } catch (error) {
      throw signal.aborted ? error : new AssistantError('unavailable');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw problemForResponse(response.status, isObject(body) ? body['code'] : null);
    }
    if (!(response.headers.get('content-type') ?? '').startsWith('text/event-stream')) {
      throw new AssistantError('unavailable');
    }

    const received: { reply: AssistantReply | null } = { reply: null };
    const handle = (event: SseEvent): void => {
      const data = parseJson(event.data);
      if (!isObject(data)) {
        return;
      }
      if (event.event === 'text' && typeof data['text'] === 'string') {
        onText(data['text']);
      } else if (event.event === 'message' && Array.isArray(data['content'])) {
        received.reply = {
          content: data['content'].filter(isObject) as ContentBlock[],
          stopReason: typeof data['stop_reason'] === 'string' ? data['stop_reason'] : null,
        };
      } else if (event.event === 'error') {
        throw new AssistantError(problemForStreamError(data['code']));
      }
    };

    const parser = new SseParser();
    try {
      if (this.platform === 'web' && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          parser.push(decoder.decode(value, { stream: true })).forEach(handle);
        }
        parser.push(decoder.decode()).forEach(handle);
      } else {
        parser.push(await response.text()).forEach(handle);
      }
      parser.end().forEach(handle);
    } catch (error) {
      if (error instanceof AssistantError || signal.aborted) {
        throw error;
      }
      throw new AssistantError('unavailable');
    }
    if (!received.reply) {
      throw new AssistantError('unavailable');
    }
    return received.reply;
  }
}
