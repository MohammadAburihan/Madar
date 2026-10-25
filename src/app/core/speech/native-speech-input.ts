import { PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { SpeechInput, SpeechInputProblem } from './speech.models';

interface Session {
  cancelled: boolean;
  listening: boolean;
  stopped: boolean;
}

const DENIED = new Set(['INSUFFICIENT_PERMISSIONS', 'MICROPHONE_PERMISSION_DENIED']);
const NETWORK = new Set([
  'NETWORK',
  'NETWORK_TIMEOUT',
  'SERVER_DISCONNECTED',
  'SERVER',
  'RECOGNIZER_UNAVAILABLE',
]);
const NO_MICROPHONE = new Set(['AUDIO', 'AUDIO_SESSION_FAILED', 'AUDIO_ENGINE_START_FAILED']);

const problemFor = (code: string | undefined): SpeechInputProblem => {
  if (code && DENIED.has(code)) {
    return 'denied';
  }
  if (code && NETWORK.has(code)) {
    return 'network';
  }
  return code && NO_MICROPHONE.has(code) ? 'nomicrophone' : 'nospeech';
};

/** The phone's own recognizer (Apple's on iOS, Google's or the device's on Android). */
export class NativeSpeechInput implements SpeechInput {
  private session: Session | null = null;

  constructor(private readonly plugin: typeof SpeechRecognition = SpeechRecognition) {}

  async supported(): Promise<boolean> {
    try {
      return (await this.plugin.available()).available;
    } catch {
      return false;
    }
  }

  async start(
    lang: string,
    onPartial: (text: string) => void,
    onEnd: () => void,
    onError: (problem: SpeechInputProblem) => void,
  ): Promise<void> {
    const handles: PluginListenerHandle[] = [];
    const session: Session = { cancelled: false, listening: false, stopped: false };
    this.session = session;
    let heard = false;
    let failed = false;
    let ended = false;
    const end = () => {
      if (ended) {
        return;
      }
      ended = true;
      session.listening = false;
      for (const handle of handles) {
        void handle.remove();
      }
      if (!heard && !failed && !session.stopped && !session.cancelled) {
        onError('nospeech');
      }
      onEnd();
    };
    const fail = (problem: SpeechInputProblem) => {
      failed = true;
      if (!ended && !(heard && problem === 'nospeech')) {
        onError(problem);
      }
    };
    try {
      let permission = await this.plugin.checkPermissions();
      if (session.cancelled) {
        return end();
      }
      if (permission.speechRecognition !== 'granted') {
        permission = await this.plugin.requestPermissions();
        if (session.cancelled) {
          return end();
        }
      }
      if (permission.speechRecognition !== 'granted') {
        fail('denied');
        end();
        return;
      }
      const listeners: [string, (event: never) => void][] = [
        [
          'partialResults',
          (event: { matches?: string[] }) => {
            const text = event.matches?.[0]?.trim();
            if (text && !ended) {
              heard = true;
              onPartial(text);
            }
          },
        ],
        [
          'error',
          (event: { code?: string }) => {
            fail(problemFor(event?.code));
          },
        ],
        [
          'listeningState',
          (event: { state?: string; status?: string }) => {
            if (event.state === 'stopped' || event.status === 'stopped') {
              end();
            }
          },
        ],
      ];
      for (const [name, listener] of listeners) {
        handles.push(await this.plugin.addListener(name as 'error', listener as never));
        if (session.cancelled) {
          return end();
        }
      }
      session.listening = true;
      await this.plugin.start({
        language: lang,
        maxResults: 1,
        partialResults: true,
        popup: false,
      });
    } catch {
      if (!session.cancelled) {
        fail('nospeech');
      }
      end();
    }
  }

  stop(): void {
    const session = this.session;
    if (!session) {
      return;
    }
    session.stopped = true;
    if (session.listening) {
      void this.plugin.stop().catch(() => undefined);
    } else {
      session.cancelled = true;
    }
  }
}
