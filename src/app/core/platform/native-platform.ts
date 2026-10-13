import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Capacitor } from '@capacitor/core';

export type NativePlatform = 'web' | 'android' | 'ios';

export const NATIVE_PLATFORM = new InjectionToken<NativePlatform>('NATIVE_PLATFORM', {
  providedIn: 'root',
  factory: () => Capacitor.getPlatform() as NativePlatform,
});

/** Per-platform ERPNext URL used by native builds when config.json leaves it empty. */
export const NATIVE_ERPNEXT_URLS = new InjectionToken<Record<string, string>>(
  'NATIVE_ERPNEXT_URLS',
  {
    providedIn: 'root',
    factory: () => environment.nativeErpnextUrl,
  },
);
