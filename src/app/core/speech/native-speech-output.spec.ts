import { vi } from 'vitest';
import { NativeSpeechOutput } from './native-speech-output';

function setup(supported: Record<string, boolean>) {
  const plugin = {
    isLanguageSupported: vi.fn(async ({ lang }: { lang: string }) => ({
      supported: supported[lang] ?? false,
    })),
    speak: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  return { plugin, output: new NativeSpeechOutput(plugin as never) };
}

describe('NativeSpeechOutput', () => {
  it('offers the languages the phone can speak', async () => {
    const { output } = setup({ 'ar-SA': true, 'en-US': false });
    await vi.waitFor(() => expect(output.languages()).toEqual(['ar']));
  });

  it('speaks in the language tag and calls back when done', async () => {
    const { output, plugin } = setup({ 'ar-SA': true, 'en-US': true });
    await vi.waitFor(() => expect(output.languages()).toEqual(['ar', 'en']));
    const ended = vi.fn();
    output.speak('مرحبا', 'ar', ended);
    expect(plugin.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'مرحبا', lang: 'ar-SA' }),
    );
    await vi.waitFor(() => expect(ended).toHaveBeenCalledTimes(1));
  });

  it('does not call back for a reading that was stopped or replaced, nor speak an unsupported language', async () => {
    const { output, plugin } = setup({ 'en-US': true });
    await vi.waitFor(() => expect(output.languages()).toEqual(['en']));
    const ended = vi.fn();
    output.speak('One', 'en', ended);
    output.stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(ended).not.toHaveBeenCalled();
    expect(plugin.stop).toHaveBeenCalled();
    output.speak('مرحبا', 'ar', ended);
    expect(plugin.speak).toHaveBeenCalledTimes(1);
  });
});
