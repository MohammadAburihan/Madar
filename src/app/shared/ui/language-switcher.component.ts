import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Language } from '../../core/i18n/language.service';

const ENDONYMS: Record<Language, string> = { en: 'English', ar: 'العربية' };

@Component({
  selector: 'app-language-switcher',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="md-btn md-btn--language"
      [attr.lang]="target()"
      [attr.aria-label]="'language.switchTo' | transloco: { language: endonyms[target()] }"
      (click)="languageChange.emit(target())"
    >
      {{ endonyms[target()] }}
    </button>
  `,
  styles: `
    :host {
      display: block;
    }

    button[lang='ar'] {
      font-family: 'Noto Sans Arabic Variable', system-ui, sans-serif;
    }

    button[lang='en'] {
      font-family: 'Inter Variable', system-ui, sans-serif;
    }
  `,
})
export class LanguageSwitcherComponent {
  readonly language = input.required<Language>();
  readonly languageChange = output<Language>();

  protected readonly endonyms = ENDONYMS;
  protected readonly target = computed<Language>(() => (this.language() === 'ar' ? 'en' : 'ar'));
}
