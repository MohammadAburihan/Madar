import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Language } from '../../../core/i18n/language.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { buildPlaceholderView } from './placeholder-view';

/** Stand-in for areas that are designed but not built yet, so navigation never dead-ends. */
@Component({
  selector: 'app-placeholder',
  imports: [FeedbackCardComponent, LanguageSwitcherComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': "viewport() !== 'mobile'" },
  template: `
    <app-language-switcher [language]="language()" (languageChange)="changeLanguage($event)" />
    <h1>{{ text().area }}</h1>
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

  protected readonly viewport = inject(ViewportService).viewport;
  private readonly i18n = injectI18n();
  protected readonly language = this.i18n.language;
  private readonly tr = this.i18n.tr;

  protected readonly text = computed(() =>
    buildPlaceholderView(this.titleKey(), this.action(), this.tr()),
  );

  protected changeLanguage(language: Language): void {
    this.i18n.use(language);
  }
}
