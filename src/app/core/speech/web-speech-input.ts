import { SpeechInput, SpeechInputProblem } from './speech.models';

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => Recognition;

const DENIED = new Set(['not-allowed', 'service-not-allowed']);

/** The browser's recognizer, which may send the audio to the browser vendor. Firefox has none. */
export class WebSpeechInput implements SpeechInput {
  private current: Recognition | null = null;
  private stopped = false;

  constructor(private readonly host: object = window) {}

  async supported(): Promise<boolean> {
    return this.constructor_() !== null;
  }

  async start(
    lang: string,
    onPartial: (text: string) => void,
    onEnd: () => void,
    onError: (problem: SpeechInputProblem) => void,
  ): Promise<void> {
    const Recognizer = this.constructor_();
    if (!Recognizer) {
      onError('nospeech');
      onEnd();
      return;
    }
    this.current?.stop();
    const recognition = new Recognizer();
    this.current = recognition;
    this.stopped = false;
    let heard = false;
    let failed = false;
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        heard = true;
        onPartial(text);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted') {
        return;
      }
      failed = true;
      onError(
        DENIED.has(event.error)
          ? 'denied'
          : event.error === 'audio-capture'
            ? 'nomicrophone'
            : event.error === 'network'
              ? 'network'
              : 'nospeech',
      );
    };
    recognition.onend = () => {
      if (this.current === recognition) {
        this.current = null;
      }
      if (!heard && !failed && !this.stopped) {
        onError('nospeech');
      }
      onEnd();
    };
    try {
      recognition.start();
    } catch {
      this.current = null;
      onError('nospeech');
      onEnd();
    }
  }

  stop(): void {
    this.stopped = true;
    this.current?.stop();
  }

  private constructor_(): RecognitionConstructor | null {
    const host = this.host as Record<string, unknown>;
    return (host['SpeechRecognition'] ??
      host['webkitSpeechRecognition'] ??
      null) as RecognitionConstructor | null;
  }
}
