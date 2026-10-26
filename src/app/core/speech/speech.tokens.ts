import { InjectionToken, inject } from '@angular/core';
import { NATIVE_PLATFORM } from '../platform/native-platform';
import { NativeSpeechInput } from './native-speech-input';
import { NativeSpeechOutput } from './native-speech-output';
import { SpeechInput, SpeechOutput } from './speech.models';
import { WebSpeechInput } from './web-speech-input';
import { WebSpeechOutput } from './web-speech-output';

export const SPEECH_INPUT = new InjectionToken<SpeechInput>('SPEECH_INPUT', {
  providedIn: 'root',
  factory: () =>
    inject(NATIVE_PLATFORM) === 'web' ? new WebSpeechInput() : new NativeSpeechInput(),
});

export const SPEECH_OUTPUT = new InjectionToken<SpeechOutput>('SPEECH_OUTPUT', {
  providedIn: 'root',
  factory: () =>
    inject(NATIVE_PLATFORM) === 'web' ? new WebSpeechOutput() : new NativeSpeechOutput(),
});
