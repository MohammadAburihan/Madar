import { TranslocoService } from '@jsverse/transloco';

type HashMap = Record<string, unknown>;
import { Language } from './language.service';

export interface Translator {
  t(key: string, params?: HashMap): string;
  plural(key: string, count: number, params?: HashMap): string;
}

/** Picks `key.zero|one|two|few|many|other` with the language's plural rules (Arabic has six forms). */
export function createTranslator(transloco: TranslocoService, language: Language): Translator {
  const t = (key: string, params?: HashMap) => transloco.translate(key, params, language);
  return {
    t,
    plural(key, count, params = {}) {
      const values = { count, ...params };
      const exact = `${key}.${new Intl.PluralRules(language).select(count)}`;
      const translated = t(exact, values);
      return translated === exact ? t(`${key}.other`, values) : translated;
    },
  };
}
