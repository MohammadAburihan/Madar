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
  const all: Map<string, Listener>[] = [];
  plugin.addListener.mockImplementation(async (name: string, listener: Listener) => {
    listeners.set(name, listener);
    const last = all[all.length - 1];
    if (!last || last.has(name)) {
      all.push(new Map());
    }
    all[all.length - 1].set(name, listener);
    return { remove: async () => void removed.push(name) };
  });
  const emitTo = (session: number, name: string, event: unknown = {}) =>
    all[session].get(name)?.(event as never);
  return { plugin, emit, emitTo, removed };
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

  it('stopped while the permission is pending, it never starts and reports nothing', async () => {
    const fake = fakePlugin();
    let grant!: (value: { speechRecognition: string }) => void;
    fake.plugin.requestPermissions.mockReturnValue(new Promise((resolve) => (grant = resolve)));
    const { input, start, events, plugin } = run(fake);
    const started = start();
    await Promise.resolve();
    await Promise.resolve();
    input.stop();
    grant({ speechRecognition: 'granted' });
    await started;
    expect(plugin.start).not.toHaveBeenCalled();
    expect(plugin.addListener).not.toHaveBeenCalled();
    expect(events).toEqual(['end']);
  });

  it('stopped while a listener is being added, removes the handles and never starts', async () => {
    const fake = fakePlugin();
    const { input, start, events, plugin, removed } = run(fake);
    plugin.addListener.mockImplementationOnce(async (name: string) => {
      input.stop();
      return { remove: async () => void removed.push(name) };
    });
    await start();
    expect(plugin.start).not.toHaveBeenCalled();
    expect(removed).toEqual(['partialResults']);
    expect(events).toEqual(['end']);
  });

  it("a previous session's late stopped event does not end the next one", async () => {
    const fake = fakePlugin();
    const { input, start, events, plugin, emitTo } = run(fake);
    await start();
    input.stop();
    await start();
    emitTo(0, 'listeningState', { state: 'stopped' });
    expect(events).toEqual(['end']);
    input.stop();
    expect(plugin.stop).toHaveBeenCalledTimes(2);
    emitTo(1, 'listeningState', { state: 'stopped' });
    expect(events).toEqual(['end', 'end']);
  });

  it('maps plugin error codes to what the user can act on', async () => {
    for (const [code, problem] of [
      ['AUDIO', 'nomicrophone'],
      ['AUDIO_SESSION_FAILED', 'nomicrophone'],
      ['AUDIO_ENGINE_START_FAILED', 'nomicrophone'],
      ['NETWORK', 'network'],
      ['SERVER', 'network'],
      ['RECOGNIZER_UNAVAILABLE', 'network'],
      ['SERVER_DISCONNECTED', 'network'],
      ['INSUFFICIENT_PERMISSIONS', 'denied'],
      ['NO_MATCH', 'nospeech'],
    ]) {
      const { start, emit, events } = run();
      await start();
      emit('error', { code, message: 'x' });
      emit('listeningState', { state: 'stopped' });
      expect(events).toEqual([`error:${problem}`, 'end']);
    }
  });

  it('does not report silence as a problem once words were heard', async () => {
    const { start, emit, events } = run();
    await start();
    emit('partialResults', { matches: ['two pots'] });
    emit('error', { code: 'NO_MATCH', message: 'x' });
    emit('listeningState', { state: 'stopped' });
    expect(events).toEqual(['partial:two pots', 'end']);
  });

  it('still reports a real problem after words were heard', async () => {
    const { start, emit, events } = run();
    await start();
    emit('partialResults', { matches: ['two pots'] });
    emit('error', { code: 'NETWORK', message: 'x' });
    expect(events).toEqual(['partial:two pots', 'error:network']);
  });

  it('ends with a problem when starting fails', async () => {
    const fake = fakePlugin();
    fake.plugin.start.mockRejectedValue(new Error('Ongoing speech recognition'));
    const { start, events } = run(fake);
    await start();
    expect(events).toEqual(['error:nospeech', 'end']);
  });
});
