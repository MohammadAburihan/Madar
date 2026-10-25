import { vi } from 'vitest';
import { NativeSpeechInput } from './native-speech-input';

type Listener = (event: never) => void;

function fakePlugin(permission: 'granted' | 'denied' = 'granted') {
  const listeners = new Map<string, Listener>();
  const removed: string[] = [];
  const plugin = {
    available: vi.fn().mockResolvedValue({ available: true }),
    checkPermissions: vi.fn().mockResolvedValue({ speechRecognition: 'prompt' }),
    requestPermissions: vi.fn().mockResolvedValue({ speechRecognition: permission }),
    addListener: vi.fn(async (name: string, listener: Listener) => {
      listeners.set(name, listener);
      return { remove: async () => void removed.push(name) };
    }),
    start: vi.fn().mockResolvedValue({}),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const emit = (name: string, event: unknown = {}) => listeners.get(name)?.(event as never);
  return { plugin, emit, removed };
}

function run(fake = fakePlugin()) {
  const input = new NativeSpeechInput(fake.plugin as never);
  const events: string[] = [];
  const start = (lang = 'en-US') =>
    input.start(
      lang,
      (text) => events.push(`partial:${text}`),
      () => events.push('end'),
      (problem) => events.push(`error:${problem}`),
    );
  return { input, events, start, ...fake };
}

describe('NativeSpeechInput', () => {
  it('is supported when the device recognizer is available, and not when asking fails', async () => {
    const { input, plugin } = run();
    expect(await input.supported()).toBe(true);
    plugin.available.mockRejectedValueOnce(
      new Error('"SpeechRecognition" plugin is not implemented'),
    );
    expect(await input.supported()).toBe(false);
  });

  it('asks for the permission on first use, then listens with partial results in the given language', async () => {
    const { start, plugin } = run();
    await start('ar-SA');
    expect(plugin.requestPermissions).toHaveBeenCalled();
    expect(plugin.start).toHaveBeenCalledWith({
      language: 'ar-SA',
      maxResults: 1,
      partialResults: true,
      popup: false,
    });
  });

  it('does not ask again once the permission is granted', async () => {
    const fake = fakePlugin();
    fake.plugin.checkPermissions.mockResolvedValue({ speechRecognition: 'granted' });
    await run(fake).start();
    expect(fake.plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it('reports a refused permission as denied and never starts', async () => {
    const { start, plugin, events } = run(fakePlugin('denied'));
    await start();
    expect(events).toEqual(['error:denied', 'end']);
    expect(plugin.start).not.toHaveBeenCalled();
  });

  it('passes the best match of each partial result, and ends once when listening stops', async () => {
    const { start, emit, events, removed } = run();
    await start();
    emit('partialResults', { matches: ['who owes', 'who owe'] });
    emit('partialResults', { matches: ['who owes money'] });
    emit('listeningState', { state: 'stopped' });
    emit('listeningState', { status: 'stopped' });
    expect(events).toEqual(['partial:who owes', 'partial:who owes money', 'end']);
    expect(removed.sort()).toEqual(['error', 'listeningState', 'partialResults']);
  });

  it('stops on request without calling it silence', async () => {
    const { input, start, emit, events, plugin } = run();
    await start();
    input.stop();
    expect(plugin.stop).toHaveBeenCalled();
    emit('listeningState', { state: 'stopped' });
    expect(events).toEqual(['end']);
  });

  it('reports a recognizer error and an ending without words', async () => {
    const failed = run();
    await failed.start();
    failed.emit('error', { code: 'x', message: 'busy' });
    failed.emit('listeningState', { state: 'stopped' });
    expect(failed.events).toEqual(['error:nospeech', 'end']);
    const silent = run();
    await silent.start();
    silent.emit('listeningState', { state: 'stopped' });
    expect(silent.events).toEqual(['error:nospeech', 'end']);
  });

  it('ends with a problem when starting fails', async () => {
    const fake = fakePlugin();
    fake.plugin.start.mockRejectedValue(new Error('Ongoing speech recognition'));
    const { start, events } = run(fake);
    await start();
    expect(events).toEqual(['error:nospeech', 'end']);
  });
});
