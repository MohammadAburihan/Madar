import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';
import { shareInFlight } from '../util/share-in-flight';

/**
 * ERPNext stores dates and timestamps as wall-clock time in the site's time zone, so "today",
 * due dates and "10 min ago" must be computed in that zone, not the device's.
 */
@Injectable({ providedIn: 'root' })
export class SiteClockService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly zone = signal<string | null>(null);
  private readonly loadZone = shareInFlight(() =>
    firstValueFrom(this.erpnext.get<{ time_zone: string }>('frappe.client.get_time_zone'))
      .then(({ time_zone }) => this.zone.set(time_zone || null))
      .catch(() => undefined),
  );

  readonly timeZone = this.zone.asReadonly();

  ensure(): Promise<void> {
    return this.zone() ? Promise.resolve() : this.loadZone();
  }

  /** The site's current wall-clock time, as a local Date with the same fields. */
  now(instant = new Date()): Date {
    return wallClock(instant, this.zone());
  }
}

export function wallClock(instant: Date, timeZone: string | null): Date {
  if (!timeZone) {
    return instant;
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value);
    return new Date(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
  } catch {
    return instant;
  }
}
