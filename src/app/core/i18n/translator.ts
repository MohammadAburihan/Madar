import { TranslocoService } from '@jsverse/transloco';

type HashMap = Record<string, unknown>;
import { Language } from './language.service';

export interface Translator {
  t(key: string, params?: HashMap): string;
  plural(key: string, count: number, params?: HashMap): string;
  isolate(value: unknown): string;
}

/** Unicode first-strong isolate: keeps a value's own direction inside text of the other direction. */
export const isolate = (value: unknown) => `\u2068${value}\u2069`;

const RTL_SCRIPTS =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
const LTR_OR_DIGIT =
  /\p{N}|(?![\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}])\p{L}/u;

/**
 * Arabic text keeps a value that is itself right-to-left unmarked: WebKit overlaps an isolated
 * Arabic run with the text after it. Anything with a left-to-right letter or a digit stays isolated.
 */
export function isolateFor(value: unknown, language: Language): string {
  const text = String(value);
  if (language === 'ar' && !LTR_OR_DIGIT.test(text) && RTL_SCRIPTS.test(text)) {
    return text;
  }
  return isolate(value);
}

/**
 * Picks `key.zero|one|two|few|many|other` with the language's plural rules (Arabic has six forms).
 * Every interpolated value is bidi-isolated, as the glossary requires for names, numbers and amounts.
 */
export function createTranslator(transloco: TranslocoService, language: Language): Translator {
  const isolateValue = (value: unknown) => isolateFor(value, language);
  const t = (key: string, params: HashMap = {}) =>
    transloco.translate(
      key,
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, isolateValue(v)])),
      language,
    );
  return {
    t,
    isolate: isolateValue,
    plural(key, count, params = {}) {
      const values = { count, ...params };
      const exact = `${key}.${new Intl.PluralRules(language).select(count)}`;
      const translated = t(exact, values);
      return translated === exact ? t(`${key}.other`, values) : translated;
    },
  };
}
