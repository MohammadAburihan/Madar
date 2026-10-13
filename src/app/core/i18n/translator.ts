import { TranslocoService } from '@jsverse/transloco';

type HashMap = Record<string, unknown>;
import { Language } from './language.service';

export interface Translator {
  t(key: string, params?: HashMap): string;
  plural(key: string, count: number, params?: HashMap): string;
}

/** Unicode first-strong isolate: keeps a value's own direction inside text of the other direction. */
export const isolate = (value: unknown) => `\u2068${value}\u2069`;

const isolateAll = (params: HashMap = {}) =>
  Object.fromEntries(Object.entries(params).map(([key, value]) => [key, isolate(value)]));

/**
 * Picks `key.zero|one|two|few|many|other` with the language's plural rules (Arabic has six forms).
 * Every interpolated value is bidi-isolated, as the glossary requires for names, numbers and amounts.
 */
export function createTranslator(transloco: TranslocoService, language: Language): Translator {
  const t = (key: string, params?: HashMap) =>
    transloco.translate(key, isolateAll(params), language);
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
