import { formatShortDate, daysUntil, formatLongDate, formatMoney, minutesSince } from './format';

describe('format', () => {
  it('formats money with Western digits and the currency code first', () => {
    expect(formatMoney(1280, 'ILS')).toBe('ILS 1,280.00');
    expect(formatMoney(1280, 'ILS', 0)).toBe('ILS 1,280');
  });

  it('formats the home date like the design in both languages', () => {
    const date = new Date(2026, 9, 11);
    expect(formatLongDate(date, 'en')).toBe('Sunday, 11 October');
    expect(formatLongDate(date, 'ar')).toBe('الأحد، 11 أكتوبر');
  });

  it('counts calendar days to a due date', () => {
    const today = new Date(2026, 9, 13, 23, 30);
    expect(daysUntil('2026-10-13', today)).toBe(0);
    expect(daysUntil('2026-10-14', today)).toBe(1);
    expect(daysUntil('2026-10-10', today)).toBe(-3);
  });

  it('measures minutes since an ERPNext timestamp', () => {
    const now = new Date(2026, 9, 13, 10, 30);
    expect(minutesSince('2026-10-13 10:20:00.123456', now)).toBe(10);
  });

  it('formats a short date with the month name for each language', () => {
    expect(formatShortDate('2026-10-11', 'en')).toBe('11 Oct 2026');
    expect(formatShortDate('2026-10-11', 'ar')).toBe('11 أكتوبر 2026');
  });
});
