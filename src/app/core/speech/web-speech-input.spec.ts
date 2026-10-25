import { vi } from 'vitest';
import { WebSpeechInput } from './web-speech-input';

class FakeRecognition {
  static last: FakeRecognition;
  lang = '';
  continuous = true;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  static failStart = false;
  start = vi.fn(() => {
    if (FakeRecognition.failStart) {
      throw new Error('already started');
    }
  });
  stop = vi.fn(() => this.onend?.());
  constructor() {
    FakeRecognition.last = this;
  }
  say(...parts: string[]) {
    this.onresult?.({ results: parts.map((transcript) => [{ transcript }]) });
  }
}

function run(host: object = { webkitSpeechRecognition: FakeRecognition }) {
  const input = new WebSpeechInput(host);
  const events: string[] = [];
  const start = (lang = 'en-US') =>
    input.start(
      lang,
      (text) => events.push(`partial:${text}`),
      () => events.push('end'),
      (problem) => events.push(`error:${problem}`),
    );
  return { input, events, start };
}

describe('WebSpeechInput', () => {
  it('is supported with either the standard or the webkit recognizer, and not without', async () => {
    expect(await run({ SpeechRecognition: FakeRecognition }).input.supported()).toBe(true);
    expect(await run().input.supported()).toBe(true);
    expect(await run({}).input.supported()).toBe(false);
  });

  it('listens once, with interim results, in the language it is given', async () => {
    const { start } = run();
    await start('ar-SA');
    const recognition = FakeRecognition.last;
    expect(recognition.lang).toBe('ar-SA');
    expect(recognition.continuous).toBe(false);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.start).toHaveBeenCalled();
  });

  it('passes the whole text heard so far on every result, then ends', async () => {
    const { start, events } = run();
    await start();
    const recognition = FakeRecognition.last;
    recognition.say('who owes');
    recognition.say('who owes', ' money  today');
    recognition.onend?.();
    expect(events).toEqual(['partial:who owes', 'partial:who owes money today', 'end']);
  });

  it('stops on request and keeps what was heard, without calling it an error', async () => {
    const { input, start, events } = run();
    await start();
    FakeRecognition.last.stop.mockImplementationOnce(() => FakeRecognition.last.onend?.());
    input.stop();
    expect(events).toEqual(['end']);
  });

  it('reports silence when nothing was heard', async () => {
    const { start, events } = run();
    await start();
    FakeRecognition.last.onerror?.({ error: 'no-speech' });
    FakeRecognition.last.onend?.();
    expect(events).toEqual(['error:nospeech', 'end']);
  });

  it('reports an ending without any words as silence, once', async () => {
    const { start, events } = run();
    await start();
    FakeRecognition.last.onend?.();
    expect(events).toEqual(['error:nospeech', 'end']);
  });

  it('reports a refused microphone as denied', async () => {
    const { start, events } = run();
    await start();
    FakeRecognition.last.onerror?.({ error: 'not-allowed' });
    FakeRecognition.last.onend?.();
    expect(events).toEqual(['error:denied', 'end']);
  });

  it('ends with a problem when the recognizer cannot start', async () => {
    const { start, events } = run();
    FakeRecognition.failStart = true;
    await start();
    FakeRecognition.failStart = false;
    expect(events).toEqual(['error:nospeech', 'end']);
  });
});
