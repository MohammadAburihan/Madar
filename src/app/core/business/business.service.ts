import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';

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

  private pending?: Promise<Business | null>;

  /** Loads the active business once and shares the in-flight request between callers. */
  ensure(): Promise<Business | null> {
    const active = this.current();
    if (active) {
      return Promise.resolve(active);
    }
    this.pending ??= this.load().finally(() => (this.pending = undefined));
    return this.pending;
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
