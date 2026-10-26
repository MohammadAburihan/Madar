import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NATIVE_ERPNEXT_URLS, NATIVE_PLATFORM } from '../platform/native-platform';

export interface RuntimeConfig {
  /** Empty means same origin: the web build reaches ERPNext through the nginx/dev-server proxy. */
  erpnextUrl: string;
  /** This business's ERPNext Desk address; empty hides "Open ERPNext". */
  deskUrl: string;
}

const DEFAULT_CONFIG: RuntimeConfig = { erpnextUrl: '', deskUrl: '' };

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly http = inject(HttpClient);
  private readonly platform = inject(NATIVE_PLATFORM);
  private readonly nativeUrls = inject(NATIVE_ERPNEXT_URLS);
  private readonly config = signal<RuntimeConfig>(DEFAULT_CONFIG);
  private readonly nativeDeskUrl = signal('');

  // Native apps have no same-origin proxy: they use the business address the user connected to, or in dev
  // builds the per-platform default. A business's Madar address proxies /api to its ERPNext. Connecting
  // reloads the app, so reading the stored address once is enough.
  readonly erpnextUrl = computed(() =>
    normalizeUrl(
      this.platform === 'web'
        ? this.config().erpnextUrl
        : localStorage.getItem('madar.connection') ||
            this.config().erpnextUrl ||
            this.nativeUrls[this.platform] ||
            '',
    ),
  );
  /** The Desk address, or empty. Native apps take it from the connected business's own config.json. */
  readonly deskUrl = computed(() =>
    this.platform === 'web' ? this.config().deskUrl : this.nativeDeskUrl(),
  );
  /** Host of the configured ERPNext, or null when requests go to the same origin. */
  readonly erpnextHost = computed(() => {
    const url = this.erpnextUrl();
    return url ? new URL(url).host : null;
  });

  async load(): Promise<void> {
    try {
      const loaded = await firstValueFrom(this.http.get<Partial<RuntimeConfig>>('config.json'));
      const erpnextUrl: unknown = loaded?.erpnextUrl ?? '';
      if (typeof erpnextUrl === 'string') {
        this.config.set({ erpnextUrl, deskUrl: parseDeskUrl(loaded?.deskUrl) });
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
    void this.loadNativeDesk();
  }

  /** The apps' bundled config has no Desk address: ask the connected business, once. Failures hide the row. */
  async loadNativeDesk(): Promise<void> {
    const address = this.erpnextUrl();
    if (this.platform === 'web' || !address) {
      return;
    }
    try {
      const remote = await firstValueFrom(
        this.http.get<Partial<RuntimeConfig>>(`${address}/config.json`),
      );
      this.nativeDeskUrl.set(parseDeskUrl(remote?.deskUrl));
    } catch {
      this.nativeDeskUrl.set('');
    }
  }
}

function parseDeskUrl(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    try {
      const url = new URL(value.trim());
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return `${url.origin}${url.pathname}${url.search}`.replace(/\/+$/, '');
      }
    } catch {
      // falls through to the warning
    }
  }
  console.warn('config.json deskUrl must be an http(s) address; hiding Open ERPNext', value);
  return '';
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
