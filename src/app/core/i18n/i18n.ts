import { computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Language, LanguageService } from './language.service';
import { createTranslator } from './translator';

/** Language state, a translator that follows it, and a switch action, for containers. */
export function injectI18n() {
  const languages = inject(LanguageService);
  const transloco = inject(TranslocoService);
  const language = languages.language;
  return {
    language,
    tr: computed(() => createTranslator(transloco, language())),
    use: (next: Language) => void languages.use(next),
  };
}
