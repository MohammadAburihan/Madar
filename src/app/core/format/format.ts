import { Language } from '../i18n/language.service';

const DAY = 86_400_000;

// The glossary requires Western digits and comma grouping in both languages.
export function formatMoney(amount: number, currency: string, decimals: 0 | 2 = 2): string {
  const value = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return `${currency} ${value}`;
}

export function formatLongDate(date: Date, language: Language): string {
  const locale = language === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options).format(date);
  return `${part({ weekday: 'long' })}${language === 'ar' ? '، ' : ', '}${part({ day: 'numeric' })} ${part({ month: 'long' })}`;
}

/** An ERPNext `YYYY-MM-DD` date as "11 Oct 2026" / "11 أكتوبر 2026". */
export function formatShortDate(isoDate: string, language: Language): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const locale = language === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
  const month = new Intl.DateTimeFormat(locale, { month: language === 'ar' ? 'long' : 'short' });
  return `${d} ${month.format(date)} ${y}`;
}

/** Calendar days from `today` to an ERPNext `YYYY-MM-DD` date (negative when overdue). */
export function daysUntil(isoDate: string, today: Date): number {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - start) / DAY);
}

export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses Frappe's `YYYY-MM-DD HH:mm:ss.ffffff` timestamps as local time. */
export function parseErpnextTimestamp(value: string): Date {
  return new Date(value.replace(' ', 'T').slice(0, 19));
}

export function minutesSince(timestamp: string, now: Date): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - parseErpnextTimestamp(timestamp).getTime()) / 60_000),
  );
}
