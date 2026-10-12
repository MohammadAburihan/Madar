import { InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';

export type NativePlatform = 'web' | 'android' | 'ios';

export const NATIVE_PLATFORM = new InjectionToken<NativePlatform>('NATIVE_PLATFORM', {
  providedIn: 'root',
  factory: () => Capacitor.getPlatform() as NativePlatform,
});
