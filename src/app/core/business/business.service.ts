import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';
import { shareInFlight } from '../util/share-in-flight';

export interface Business {
  name: string;
  currency: string;
  abbr: string;
}

const LAST_BUSINESS_KEY = 'madar.lastBusiness';

@Injectable({ providedIn: 'root' })
export class BusinessService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly current = signal<Business | null>(null);
  private readonly lastKnown = signal(localStorage.getItem(LAST_BUSINESS_KEY));

  readonly active = this.current.asReadonly();
  /** Name shown before sign-in, when the server can't be asked yet. */
  readonly lastKnownName = this.lastKnown.asReadonly();

  private readonly loadShared = shareInFlight(() => this.load());

  /** Loads the active business once and shares the in-flight request between callers. */
  ensure(): Promise<Business | null> {
    const active = this.current();
    return active ? Promise.resolve(active) : this.loadShared();
  }

  /** Reloads after a sign-in, sharing the request with any concurrent ensure(). */
  refresh(): Promise<Business | null> {
    this.current.set(null);
    return this.loadShared();
  }

  async load(): Promise<Business | null> {
    const [company] = await firstValueFrom(
      this.erpnext.list<{ name: string; default_currency: string; abbr: string }>('Company', {
        fields: ['name', 'default_currency', 'abbr'],
        orderBy: 'creation asc',
        limit: 1,
      }),
    );
    const business = company
      ? { name: company.name, currency: company.default_currency, abbr: company.abbr }
      : null;
    this.current.set(business);
    if (business) {
      localStorage.setItem(LAST_BUSINESS_KEY, business.name);
      this.lastKnown.set(business.name);
    }
    return business;
  }
}
