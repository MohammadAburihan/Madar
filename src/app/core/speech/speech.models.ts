import { Signal } from '@angular/core';

/** What went wrong while listening: the user said no to the microphone, or nothing usable was heard. */
export type SpeechInputProblem = 'denied' | 'nospeech';

export interface SpeechInput {
  /** Whether this device can turn speech into text at all. */
  supported(): Promise<boolean>;
  /**
   * Listens until the user stops, speech ends or something fails. `onPartial` gets the whole text heard so far.
   * `onEnd` is called exactly once, after any `onError`.
   */
  start(
    lang: string,
    onPartial: (text: string) => void,
    onEnd: () => void,
    onError: (problem: SpeechInputProblem) => void,
  ): Promise<void>;
  /** Ends listening; what was heard so far still arrives before `onEnd`. */
  stop(): void;
}

export type SpeechLanguage = 'ar' | 'en';

export interface SpeechOutput {
  /** The languages the device has a voice for; it can grow while voices load. */
  readonly languages: Signal<readonly SpeechLanguage[]>;
  /** Reads `text` aloud, replacing anything being read. `onEnd` is not called for a reading that was replaced. */
  speak(text: string, lang: SpeechLanguage, onEnd: () => void): void;
  stop(): void;
}

/** The tag each platform's recognizer is given for the language of the app. */
export const RECOGNITION_TAGS: Record<SpeechLanguage, string> = { ar: 'ar-SA', en: 'en-US' };
