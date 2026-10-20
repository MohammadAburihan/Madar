import { minutesSince } from '../../../core/format/format';
import { Translator } from '../../../core/i18n/translator';

/** "10 min ago", "3 h ago", "2 days ago" for an ERPNext timestamp. */
export function ago(timestamp: string, now: Date, tr: Translator): string {
  const minutes = minutesSince(timestamp, now);
  if (minutes < 1) {
    return tr.t('home.relative.justNow');
  }
  if (minutes < 60) {
    return tr.plural('home.relative.minutes', minutes);
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24
    ? tr.plural('home.relative.hours', hours)
    : tr.plural('home.relative.days', Math.floor(hours / 24));
}
