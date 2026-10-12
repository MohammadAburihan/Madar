import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface RuntimeConfig {
  /** Empty means same origin: the web build reaches ERPNext through the nginx/dev-server proxy. */
  erpnextUrl: string;
}

const DEFAULT_CONFIG: RuntimeConfig = { erpnextUrl: '' };

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly http = inject(HttpClient);
  private readonly config = signal<RuntimeConfig>(DEFAULT_CONFIG);

  readonly erpnextUrl = () => this.config().erpnextUrl.replace(/\/+$/, '');

  async load(): Promise<void> {
    try {
      const loaded = await firstValueFrom(this.http.get<Partial<RuntimeConfig>>('config.json'));
      this.config.set({ ...DEFAULT_CONFIG, ...loaded });
    } catch {
      this.config.set(DEFAULT_CONFIG);
    }
  }
}
