import { Signal, signal } from '@angular/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { RECOGNITION_TAGS, SpeechLanguage, SpeechOutput } from './speech.models';

/** The phone's text-to-speech through a plugin; the Android WebView has no `speechSynthesis`. */
export class NativeSpeechOutput implements SpeechOutput {
  private readonly available = signal<readonly SpeechLanguage[]>([]);
  readonly languages: Signal<readonly SpeechLanguage[]> = this.available.asReadonly();
  private turn = 0;

  constructor(private readonly plugin: typeof TextToSpeech = TextToSpeech) {
    void this.detect();
  }

  speak(text: string, lang: SpeechLanguage, onEnd: () => void): void {
    if (!this.available().includes(lang) || !text.trim()) {
      return;
    }
    this.stop();
    const turn = this.turn;
    const done = () => {
      if (turn === this.turn) {
        onEnd();
      }
    };
    this.plugin.speak({ text, lang: RECOGNITION_TAGS[lang], category: 'ambient' }).then(done, done);
  }

  stop(): void {
    this.turn++;
    void this.plugin.stop().catch(() => undefined);
  }

  private async detect(): Promise<void> {
    const found: SpeechLanguage[] = [];
    for (const lang of ['ar', 'en'] as const) {
      try {
        const { supported } = await this.plugin.isLanguageSupported({
          lang: RECOGNITION_TAGS[lang],
        });
        if (supported) {
          found.push(lang);
        }
      } catch {
        // No voice engine answered: this language stays unavailable.
      }
    }
    this.available.set(found);
  }
}
