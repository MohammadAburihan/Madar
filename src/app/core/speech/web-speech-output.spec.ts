import { vi } from 'vitest';
import { WebSpeechOutput } from './web-speech-output';

class FakeUtterance {
  voice: unknown = null;
  lang = '';
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

const voice = (lang: string) => ({ lang, name: lang }) as SpeechSynthesisVoice;

function fakeSynth(voices: SpeechSynthesisVoice[]) {
  const listeners: (() => void)[] = [];
  const spoken: FakeUtterance[] = [];
  const synth = {
    voices,
    getVoices: () => synth.voices,
    addEventListener: (_: string, listener: () => void) => listeners.push(listener),
    speak: vi.fn((utterance: FakeUtterance) => spoken.push(utterance)),
    cancel: vi.fn(),
  };
  return { synth, spoken, loaded: () => listeners.forEach((listener) => listener()) };
}

describe('WebSpeechOutput', () => {
  beforeEach(() => vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance));
  afterEach(() => vi.unstubAllGlobals());

  it('offers the languages that have a voice, and none without speechSynthesis', () => {
    const { synth } = fakeSynth([voice('en-GB'), voice('ar_EG')]);
    expect(new WebSpeechOutput(synth as never).languages()).toEqual(['ar', 'en']);
    expect(new WebSpeechOutput(undefined).languages()).toEqual([]);
    expect(new WebSpeechOutput(fakeSynth([voice('fr-FR')]).synth as never).languages()).toEqual([]);
  });

  it('adds languages when the voices load later', () => {
    const { synth, loaded } = fakeSynth([]);
    const output = new WebSpeechOutput(synth as never);
    expect(output.languages()).toEqual([]);
    synth.voices = [voice('ar-SA')];
    loaded();
    expect(output.languages()).toEqual(['ar']);
  });

  it('speaks with the preferred voice of the language, and calls back at the end', () => {
    const { synth, spoken } = fakeSynth([
      voice('ar-EG'),
      voice('ar-SA'),
      voice('en-GB'),
      voice('en-US'),
    ]);
    const output = new WebSpeechOutput(synth as never);
    const ended = vi.fn();
    output.speak('مرحبا', 'ar', ended);
    expect(spoken[0].text).toBe('مرحبا');
    expect(spoken[0].lang).toBe('ar-SA');
    expect(spoken[0].voice).toMatchObject({ lang: 'ar-SA' });
    spoken[0].onend?.();
    expect(ended).toHaveBeenCalledTimes(1);
    output.speak('Hello', 'en', ended);
    expect(spoken[1].lang).toBe('en-US');
  });

  it('falls back to any voice of the language', () => {
    const { synth, spoken } = fakeSynth([voice('en-AU')]);
    new WebSpeechOutput(synth as never).speak('Hello', 'en', vi.fn());
    expect(spoken[0].lang).toBe('en-AU');
  });

  it('replaces the reading in progress and ignores the end of the replaced one', () => {
    const { synth, spoken } = fakeSynth([voice('en-US')]);
    const output = new WebSpeechOutput(synth as never);
    const first = vi.fn();
    const second = vi.fn();
    output.speak('One', 'en', first);
    output.speak('Two', 'en', second);
    expect(synth.cancel).toHaveBeenCalledTimes(2);
    spoken[0].onend?.();
    expect(first).not.toHaveBeenCalled();
    spoken[1].onend?.();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops without calling back, and says nothing for a language with no voice', () => {
    const { synth, spoken } = fakeSynth([voice('en-US')]);
    const output = new WebSpeechOutput(synth as never);
    const ended = vi.fn();
    output.speak('One', 'en', ended);
    output.stop();
    spoken[0].onend?.();
    expect(ended).not.toHaveBeenCalled();
    output.speak('مرحبا', 'ar', ended);
    expect(spoken).toHaveLength(1);
  });
});
