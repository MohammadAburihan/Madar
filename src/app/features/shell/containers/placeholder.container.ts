import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Language, LanguageService } from '../../../core/i18n/language.service';
import { createTranslator } from '../../../core/i18n/translator';
import { ViewportService } from '../../../core/layout/viewport.service';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';

/** Stand-in for areas that are designed but not built yet, so navigation never dead-ends. */
@Component({
  selector: 'app-placeholder',
  imports: [FeedbackCardComponent, LanguageSwitcherComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': "viewport() !== 'mobile'" },
  template: `
    <app-language-switcher [language]="language()" (languageChange)="changeLanguage($event)" />
    <h1>{{ area() }}</h1>
    <app-feedback-card [title]="text().title" [message]="text().message" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 20px 20px 24px;
    }

    :host(.desktop) {
      gap: 28px;
      padding: 40px;
    }

    h1 {
      color: var(--md-ink);
      font: 600 28px / var(--md-lh) var(--md-font);
    }

    :host(.desktop) h1 {
      font-size: 32px;
    }
  `,
})
export class PlaceholderContainer {
  /** Translation key of the area name, from route data. */
  readonly titleKey = input<string>('');
  /** Quick-action id, from the `task/:action` route. */
  readonly action = input<string>('');

  private readonly languages = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly language = this.languages.language;
  private readonly tr = computed(() => createTranslator(this.transloco, this.language()));

  protected readonly area = computed(() =>
    this.tr().t(this.action() ? `home.actions.${this.action()}` : this.titleKey()),
  );
  protected readonly text = computed(() => ({
    title: this.tr().t('placeholder.title', { area: this.area() }),
    message: this.tr().t('placeholder.message'),
  }));

  protected changeLanguage(language: Language): void {
    void this.languages.use(language);
  }
}
