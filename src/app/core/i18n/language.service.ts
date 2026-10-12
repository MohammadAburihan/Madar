import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

export type Language = 'en' | 'ar';

export const LANGUAGES: readonly Language[] = ['en', 'ar'];

const STORAGE_KEY = 'madar.language';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly current = signal<Language>('en');

  readonly language = this.current.asReadonly();

  async init(): Promise<void> {
    const stored = localStorage.getItem(STORAGE_KEY);
    await this.use(isLanguage(stored) ? stored : 'en');
  }

  async use(language: Language): Promise<void> {
    await firstValueFrom(this.transloco.load(language));
    this.transloco.setActiveLang(language);
    this.current.set(language);
    localStorage.setItem(STORAGE_KEY, language);

    const html = this.document.documentElement;
    html.lang = language;
    html.dir = language === 'ar' ? 'rtl' : 'ltr';
  }
}

function isLanguage(value: string | null): value is Language {
  return LANGUAGES.includes(value as Language);
}
