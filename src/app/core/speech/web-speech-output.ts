import { Signal, signal } from '@angular/core';
import { SpeechLanguage, SpeechOutput } from './speech.models';

const PREFERRED: Record<SpeechLanguage, string> = { ar: 'ar-sa', en: 'en-us' };
const baseOf = (tag: string) => tag.toLowerCase().replace('_', '-').split('-')[0];

/** Reads aloud with the browser's `speechSynthesis`, hiding itself where there is none or no voice for a language. */
export class WebSpeechOutput implements SpeechOutput {
  private readonly available = signal<readonly SpeechLanguage[]>([]);
  readonly languages: Signal<readonly SpeechLanguage[]> = this.available.asReadonly();
  private current: SpeechSynthesisUtterance | null = null;

  constructor(private readonly synth: SpeechSynthesis | undefined = window.speechSynthesis) {
    if (synth) {
      this.refresh();
      // Chrome loads its voices after start-up and says so with this event.
      synth.addEventListener?.('voiceschanged', () => this.refresh());
    }
  }

  speak(text: string, lang: SpeechLanguage, onEnd: () => void): void {
    const synth = this.synth;
    const voice = this.voiceFor(lang);
    if (!synth || !voice || !text.trim()) {
      return;
    }
    this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    const done = () => {
      if (this.current === utterance) {
        this.current = null;
        onEnd();
      }
    };
    utterance.onend = done;
    utterance.onerror = done;
    this.current = utterance;
    synth.speak(utterance);
  }

  stop(): void {
    this.current = null;
    this.synth?.cancel();
  }

  private voices(): SpeechSynthesisVoice[] {
    return this.synth?.getVoices() ?? [];
  }

  private voiceFor(lang: SpeechLanguage): SpeechSynthesisVoice | undefined {
    const matches = this.voices().filter((voice) => baseOf(voice.lang) === lang);
    return (
      matches.find((voice) => voice.lang.toLowerCase().replace('_', '-') === PREFERRED[lang]) ??
      matches[0]
    );
  }

  private refresh(): void {
    const found = (['ar', 'en'] as const).filter((lang) => this.voiceFor(lang));
    const known = this.available();
    if (found.length !== known.length || found.some((lang, i) => lang !== known[i])) {
      this.available.set(found);
    }
  }
}
