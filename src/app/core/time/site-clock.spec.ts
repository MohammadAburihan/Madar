import { wallClock } from './site-clock.service';

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
