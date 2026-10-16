import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { RuntimeConfigService } from '../../../core/config/runtime-config';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { injectI18n } from '../../../core/i18n/i18n';
import { Language } from '../../../core/i18n/language.service';
import { ViewportService } from '../../../core/layout/viewport.service';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { SettingsApiService } from '../data-access/settings-api.service';
import { connectionFields } from './settings-view';

/** Connection settings: which business and server Madar works with, the language, and signing out. */
@Component({
  selector: 'app-settings',
  imports: [
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @for (field of fields(); track field.label) {
      <app-text-field
        [label]="field.label"
        [value]="field.value"
        [readonly]="true"
        [ltr]="field.label === txt.addressLabel"
      />
    }
    <app-select-field
      [label]="txt.language"
      [options]="txt.languages"
      [value]="i18n.language()"
      (valueChange)="useLanguage($event)"
    />
    <app-feedback-card [title]="txt.separate.title" [message]="txt.separate.message" />
    @if (signOutFailed(); as reason) {
      <app-feedback-card
        tone="danger"
        [title]="txt.signOutFailed[reason].title"
        [message]="txt.signOutFailed[reason].message"
      />
    }
    <button type="button" class="md-btn" [disabled]="signingOut()" (click)="signOut()">
      {{ signingOut() ? txt.signingOut : txt.signOut }}
    </button>
  `,
})
export class SettingsContainer {
  private readonly api = inject(SettingsApiService);
  private readonly business = inject(BusinessService);
  private readonly session = inject(SessionService);
  private readonly config = inject(RuntimeConfigService);
  private readonly document = inject(DOCUMENT);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  private readonly currencyName = signal<string | null>(null);
  protected readonly signingOut = signal(false);
  protected readonly signOutFailed = signal<'offline' | 'error' | null>(null);

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      title: t('settings.title'),
      subtitle: t('settings.subtitle', {
        business: this.business.active()?.name ?? '',
        role: t(`home.role.${this.session.persona()}`),
      }),
      addressLabel: t('settings.address'),
      language: t('settings.language'),
      languages: [
        { value: 'en', label: 'English' },
        { value: 'ar', label: 'العربية' },
      ],
      separate: block('settings.separate'),
      signOut: t('settings.signOut'),
      signingOut: t('settings.signingOut'),
      signOutFailed: {
        offline: block('settings.signOutFailed.offline'),
        error: block('settings.signOutFailed.error'),
      },
    };
  });

  protected readonly fields = computed(() => {
    const business = this.business.active();
    return connectionFields(
      {
        business: business?.name ?? '',
        // The web app reaches ERPNext through its own origin; native apps through the configured server.
        address: this.config.erpnextUrl() || this.document.location.origin,
        currency: business?.currency ?? '',
        currencyName: this.currencyName(),
      },
      this.i18n.tr(),
    );
  });

  constructor() {
    effect(() => {
      const currency = this.business.active()?.currency;
      if (currency) {
        untracked(
          () => void this.api.currencyName(currency).then((name) => this.currencyName.set(name)),
        );
      }
    });
    void this.business.ensure().catch(() => undefined);
  }

  protected useLanguage(language: string | null): void {
    if (language === 'en' || language === 'ar') {
      this.i18n.use(language as Language);
    }
  }

  protected async signOut(): Promise<void> {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    this.signOutFailed.set(null);
    try {
      await this.session.signOut();
      // A fresh start, so nothing of this user's half-done work stays in memory for the next one.
      this.document.location.assign('/sign-in');
    } catch (error) {
      this.signOutFailed.set(ErpnextError.from(error).kind === 'offline' ? 'offline' : 'error');
      this.signingOut.set(false);
    }
  }
}
