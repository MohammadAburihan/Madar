import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../public/i18n/ar.json';
import en from '../../public/i18n/en.json';
import { Language } from '../app/core/i18n/language.service';
import { createTranslator, Translator } from '../app/core/i18n/translator';

const FILES: Record<Language, unknown> = { en, ar };

export const translocoTesting = () =>
  TranslocoTestingModule.forRoot({
    langs: { en, ar },
    translocoConfig: { availableLangs: ['en', 'ar'], defaultLang: 'en' },
    preloadLangs: true,
  });

/** A translator over the real translation files, without needing TestBed. */
export function realTranslator(language: Language): Translator {
  const lookup = (
    key: string,
    params: Record<string, unknown> = {},
    lang: Language = language,
  ): string => {
    const value = key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        FILES[lang],
      );
    return typeof value === 'string'
      ? value.replace(/{{\s*(\w+)\s*}}/g, (_, name: string) => String(params[name] ?? ''))
      : key;
  };
  return createTranslator({ translate: lookup } as unknown as TranslocoService, language);
}
