import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NATIVE_PLATFORM } from '../platform/native-platform';

export interface RuntimeConfig {
  /** Empty means same origin: the web build reaches ERPNext through the nginx/dev-server proxy. */
  erpnextUrl: string;
}

const DEFAULT_CONFIG: RuntimeConfig = { erpnextUrl: '' };

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly http = inject(HttpClient);
  private readonly platform = inject(NATIVE_PLATFORM);
  private readonly config = signal<RuntimeConfig>(DEFAULT_CONFIG);

  // Native apps have no same-origin proxy, so they fall back to the build's per-platform default.
  readonly erpnextUrl = computed(() =>
    normalizeUrl(this.config().erpnextUrl || environment.nativeErpnextUrl[this.platform] || ''),
  );
  /** Host of the configured ERPNext, or null when requests go to the same origin. */
  readonly erpnextHost = computed(() => {
    const url = this.erpnextUrl();
    return url ? new URL(url).host : null;
  });

  async load(): Promise<void> {
    try {
      const loaded = await firstValueFrom(this.http.get<Partial<RuntimeConfig>>('config.json'));
      const erpnextUrl = loaded?.erpnextUrl ?? '';
      if (typeof erpnextUrl !== 'string') {
        console.warn(
          'config.json erpnextUrl must be a string; using same-origin ERPNext',
          erpnextUrl,
        );
      }
      this.config.set({ erpnextUrl: typeof erpnextUrl === 'string' ? erpnextUrl : '' });
    } catch (error) {
      console.warn('config.json is missing or invalid; using same-origin ERPNext', error);
      this.config.set(DEFAULT_CONFIG);
    }
  }
}

/** Accepts `erp.example.com` as well as full URLs; anything unparseable falls back to same origin. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    console.warn(`Ignoring invalid erpnextUrl "${value}"`);
    return '';
  }
}
