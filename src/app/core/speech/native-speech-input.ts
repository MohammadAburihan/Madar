import { PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { SpeechInput, SpeechInputProblem } from './speech.models';

/** The phone's own recognizer (Apple's on iOS, Google's or the device's on Android). */
export class NativeSpeechInput implements SpeechInput {
  private listening = false;
  private stopped = false;

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
    let heard = false;
    let failed = false;
    let ended = false;
    this.stopped = false;
    const end = () => {
      if (ended) {
        return;
      }
      ended = true;
      this.listening = false;
      for (const handle of handles) {
        void handle.remove();
      }
      if (!heard && !failed && !this.stopped) {
        onError('nospeech');
      }
      onEnd();
    };
    const fail = (problem: SpeechInputProblem) => {
      failed = true;
      if (!ended) {
        onError(problem);
      }
    };
    try {
      let permission = await this.plugin.checkPermissions();
      if (permission.speechRecognition !== 'granted') {
        permission = await this.plugin.requestPermissions();
      }
      if (permission.speechRecognition !== 'granted') {
        fail('denied');
        end();
        return;
      }
      this.listening = true;
      handles.push(
        await this.plugin.addListener('partialResults', (event) => {
          const text = event.matches?.[0]?.trim();
          if (text && !ended) {
            heard = true;
            onPartial(text);
          }
        }),
        await this.plugin.addListener('error', () => fail('nospeech')),
        await this.plugin.addListener('listeningState', (event) => {
          if (event.state === 'stopped' || event.status === 'stopped') {
            end();
          }
        }),
      );
      await this.plugin.start({
        language: lang,
        maxResults: 1,
        partialResults: true,
        popup: false,
      });
    } catch {
      fail('nospeech');
      end();
    }
  }

  stop(): void {
    if (this.listening) {
      this.stopped = true;
      void this.plugin.stop().catch(() => undefined);
    }
  }
}
