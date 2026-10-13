import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NATIVE_ERPNEXT_URLS, NATIVE_PLATFORM } from '../platform/native-platform';

export interface RuntimeConfig {
  /** Empty means same origin: the web build reaches ERPNext through the nginx/dev-server proxy. */
  erpnextUrl: string;
}

const DEFAULT_CONFIG: RuntimeConfig = { erpnextUrl: '' };

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly http = inject(HttpClient);
  private readonly platform = inject(NATIVE_PLATFORM);
  private readonly nativeUrls = inject(NATIVE_ERPNEXT_URLS);
  private readonly config = signal<RuntimeConfig>(DEFAULT_CONFIG);

  // Native apps have no same-origin proxy, so they fall back to the build's per-platform default.
  readonly erpnextUrl = computed(() =>
    (this.config().erpnextUrl || this.nativeUrls[this.platform] || '').replace(/\/+$/, ''),
  );

  async load(): Promise<void> {
    try {
      const loaded = await firstValueFrom(this.http.get<Partial<RuntimeConfig>>('config.json'));
      const erpnextUrl: unknown = loaded?.erpnextUrl ?? '';
      if (typeof erpnextUrl === 'string') {
        this.config.set({ erpnextUrl });
      } else {
        console.warn(
          'config.json erpnextUrl must be a string; using same-origin ERPNext',
          erpnextUrl,
        );
        this.config.set(DEFAULT_CONFIG);
      }
    } catch (error) {
      console.warn('config.json is missing or invalid; using same-origin ERPNext', error);
      this.config.set(DEFAULT_CONFIG);
    }
  }
}
