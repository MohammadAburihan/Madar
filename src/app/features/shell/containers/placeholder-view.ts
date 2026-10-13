import { Translator } from '../../../core/i18n/translator';

export interface PlaceholderView {
  area: string;
  title: string;
  message: string;
}

/** `action` (a quick-action id) wins over `titleKey` (an area's translation key). */
export function buildPlaceholderView(
  titleKey: string,
  action: string,
  { t }: Translator,
): PlaceholderView {
  const area = t(action ? `home.actions.${action}` : titleKey);
  return { area, title: t('placeholder.title', { area }), message: t('placeholder.message') };
}
