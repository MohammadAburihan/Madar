import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/** Another business's Madar address, saved on this device. */
export interface KnownBusiness {
  /** Its origin, e.g. https://padel.example.com. */
  address: string;
}

const KEY = 'madar.businesses';

/**
 * Each business has its own Madar web address, with its own ERPNext behind it, so switching business means
 * opening another address. This keeps the user's other addresses on this device, for this one.
 */
@Injectable({ providedIn: 'root' })
export class KnownBusinessesService {
  private readonly document = inject(DOCUMENT);
  private readonly saved = signal<KnownBusiness[]>(this.read());

  /** This Madar's own address. */
  readonly current = this.document.location.origin;
  readonly businesses = computed(() => this.saved().filter((b) => b.address !== this.current));

  /** The address as an origin, or null when it isn't an http(s) address. */
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

  /** Saves the address; 'invalid', 'current' (this business) or 'known' when it isn't added. */
  add(value: string): 'added' | 'invalid' | 'current' | 'known' {
    const address = KnownBusinessesService.origin(value);
    if (address === this.current) {
      return 'current';
    }
    // A business's address is a domain name, not a bare host like "localhost".
    if (!address || !new URL(address).hostname.includes('.')) {
      return 'invalid';
    }
    if (this.saved().some((b) => b.address === address)) {
      return 'known';
    }
    this.write([...this.saved(), { address }]);
    return 'added';
  }

  remove(address: string): void {
    this.write(this.saved().filter((b) => b.address !== address));
  }

  private read(): KnownBusiness[] {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      return Array.isArray(value)
        ? value.filter((b): b is KnownBusiness => typeof b?.address === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private write(businesses: KnownBusiness[]): void {
    this.saved.set(businesses);
    localStorage.setItem(KEY, JSON.stringify(businesses));
  }
}
