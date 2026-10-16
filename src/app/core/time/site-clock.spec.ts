import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ErpnextClient } from '../erpnext/erpnext-client';
import { SiteClockService, wallClock } from './site-clock.service';

describe('wallClock', () => {
  it('shifts an instant to the site time zone', () => {
    // 22:30 UTC is already the next day in Hebron (UTC+3 in October).
    const site = wallClock(new Date(Date.UTC(2026, 9, 12, 22, 30)), 'Asia/Hebron');
    expect([
      site.getFullYear(),
      site.getMonth(),
      site.getDate(),
      site.getHours(),
      site.getMinutes(),
    ]).toEqual([2026, 9, 13, 1, 30]);
  });

  it('falls back to the instant when the zone is unknown or invalid', () => {
    const instant = new Date(2026, 9, 12, 10, 0);
    expect(wallClock(instant, null)).toBe(instant);
    expect(wallClock(instant, 'Not/AZone')).toBe(instant);
  });
});

describe('SiteClockService', () => {
  const setup = (get: () => Observable<unknown>) => {
    TestBed.configureTestingModule({
      providers: [{ provide: ErpnextClient, useValue: { get: vi.fn(get) } }],
    });
    return TestBed.inject(SiteClockService);
  };

  it("says when the site's time zone can't be read, and clears it once Retry reads it", async () => {
    let fail = true;
    const clock = setup(() =>
      fail ? throwError(() => new Error('offline')) : of({ time_zone: 'Asia/Hebron' }),
    );
    await clock.ensure();
    expect([clock.unknownZone(), clock.timeZone()]).toEqual([true, null]);
    clock.now();
    fail = false;
    await clock.retry();
    expect([clock.unknownZone(), clock.timeZone(), clock.recovered()]).toEqual([
      false,
      'Asia/Hebron',
      true,
    ]);
  });

  it("doesn't ask for a reload when no date was worked out from the device meanwhile", async () => {
    let fail = true;
    const clock = setup(() =>
      fail ? throwError(() => new Error('offline')) : of({ time_zone: 'Asia/Hebron' }),
    );
    await clock.ensure();
    fail = false;
    await clock.ensure();
    expect([clock.unknownZone(), clock.recovered()]).toEqual([false, false]);
  });
});
