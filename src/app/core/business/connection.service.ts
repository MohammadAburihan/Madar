import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RuntimeConfigService } from '../config/runtime-config';
import { NATIVE_PLATFORM } from '../platform/native-platform';

const KEY = 'madar.connection';
const LAST_BUSINESS_KEY = 'madar.lastBusiness';

export type ConnectResult = 'connected' | 'elsewhere' | 'invalid' | 'insecure' | 'unreachable';

/**
 * Which business Madar works with. Each business has its own Madar address (with its own ERPNext behind it), and
 * the user types it once: the web app confirms it is this address (or goes to the other one); the apps keep it
 * and send their requests there.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private readonly document = inject(DOCUMENT);
  private readonly http = inject(HttpClient);
  private readonly platform = inject(NATIVE_PLATFORM);
  private readonly config = inject(RuntimeConfigService);
  private readonly stored = signal(localStorage.getItem(KEY));

  readonly native = this.platform !== 'web';
  /** The business's address: the one typed in the apps, this site's own on the web. */
  readonly address = computed(() =>
    // In the apps, the server they actually use: the connected address, else the build's configured one.
    this.native ? this.stored() || this.config.erpnextUrl() || null : this.document.location.origin,
  );
  /** The user has confirmed the business address on this device. */
  readonly connected = computed(() =>
    this.native ? !!this.address() : this.stored() === this.document.location.origin,
  );

  /** The typed address as an origin, or null when it isn't a business's web address. */
  static origin(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
      return /^https?:$/.test(url.protocol) ? url.origin : null;
    } catch {
      return null;
    }
  }

  /**
   * Connects to the business at the typed address. On the web another business's address is 'elsewhere': the
   * caller goes there. The apps first check a Madar answers at the address.
   */
  async connect(value: string): Promise<ConnectResult> {
    const address = ConnectionService.origin(value);
    if (!address) {
      return 'invalid';
    }
    const url = new URL(address);
    if (!this.native && url.host === new URL(this.document.location.origin).host) {
      this.remember(this.document.location.origin);
      return 'connected';
    }
    // A business's address is a domain name; local ERPNext (dev builds only) also runs on localhost or an IP.
    const ip = /^\d+(\.\d+){3}$/.test(url.hostname);
    const local = url.hostname === 'localhost' || ip;
    // Non-Latin names (rehan.السعودية) reach here in their xn-- form.
    const domain = /^([a-z0-9-]+\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/i.test(url.hostname) && !ip;
    if (!(domain || (local && environment.allowInsecureConnection))) {
      return 'invalid';
    }
    if (url.protocol !== 'https:' && !environment.allowInsecureConnection) {
      return 'insecure';
    }
    if (!this.native) {
      return 'elsewhere';
    }
    try {
      const answer = await firstValueFrom(
        this.http.get<{ message?: string }>(`${address}/api/method/ping`).pipe(timeout(15_000)),
      );
      if (answer?.message !== 'pong') {
        return 'unreachable';
      }
    } catch {
      return 'unreachable';
    }
    this.remember(address);
    return 'connected';
  }

  private remember(address: string): void {
    if (this.stored() !== address) {
      // The name shown before sign-in belongs to the previous business.
      localStorage.removeItem(LAST_BUSINESS_KEY);
    }
    localStorage.setItem(KEY, address);
    this.stored.set(address);
  }
}
