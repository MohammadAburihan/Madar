import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { RuntimeConfigService } from '../../../core/config/runtime-config';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { Language, LanguageService } from '../../../core/i18n/language.service';
import { createTranslator } from '../../../core/i18n/translator';
import { ViewportService } from '../../../core/layout/viewport.service';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { BusinessBarComponent } from '../../../shared/ui/business-bar.component';
import {
  SignInCredentials,
  SignInFormComponent,
  SignInMessage,
} from '../components/sign-in-form.component';

type NoticeKey =
  'missing' | 'invalid' | 'offline' | 'error' | 'expired' | 'forgotMissing' | 'forgotSent';

@Component({
  selector: 'app-sign-in',
  imports: [BusinessBarComponent, LanguageSwitcherComponent, SignInFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ion-page', '[class.desktop]': "viewport() !== 'mobile'" },
  template: `
    <main class="page">
      <div class="body">
        <app-business-bar
          [businessName]="businessName()"
          [brand]="text().brand"
          [switchLabel]="businessName()"
        />
        <app-language-switcher [language]="language()" (languageChange)="changeLanguage($event)" />
        <app-sign-in-form
          [labels]="text().labels"
          [submitting]="submitting()"
          [notice]="notice()"
          (signIn)="signIn($event)"
          (forgotPassword)="forgotPassword($event)"
        />
      </div>
    </main>
  `,
  styles: `
    :host {
      background: var(--md-bg);
    }

    .page {
      block-size: 100%;
      overflow-y: auto;
      padding: calc(16px + env(safe-area-inset-top)) 20px 24px;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    :host(.desktop) .page {
      display: grid;
      place-items: center;
      padding: 40px;
    }

    :host(.desktop) .body {
      inline-size: min(480px, 100%);
      padding: 32px;
      border: 1px solid var(--md-line);
      border-radius: 12px;
      background: var(--md-surface);
    }
  `,
})
export class SignInContainer {
  // Bound from query params; absent params arrive as undefined.
  readonly expired = input<string | undefined>();
  readonly returnUrl = input<string | undefined>();

  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  private readonly config = inject(RuntimeConfigService);
  private readonly languages = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly language = this.languages.language;
  protected readonly submitting = signal(false);
  private readonly noticeKey = signal<NoticeKey | null>(null);
  private readonly forgotEmail = signal('');
  private readonly tr = computed(() => createTranslator(this.transloco, this.language()));

  protected readonly host = computed(() => this.config.erpnextHost() ?? location.host);
  protected readonly businessName = computed(() => this.business.lastKnownName() ?? this.host());

  protected readonly text = computed(() => {
    const { t } = this.tr();
    const known = this.business.lastKnownName();
    return {
      brand: t('app.name'),
      labels: {
        title: t('signIn.title'),
        subtitle: known
          ? t('signIn.subtitle', { business: known })
          : t('signIn.subtitleNoBusiness'),
        email: t('signIn.email'),
        password: t('signIn.password'),
        submit: t('signIn.submit'),
        submitting: t('signIn.submitting'),
        forgot: t('signIn.forgot'),
        footer: t('signIn.connectedTo', { host: this.host() }),
      },
    };
  });

  protected readonly notice = computed<SignInMessage | null>(() => {
    const key = this.noticeKey() ?? (this.expired() ? 'expired' : null);
    if (!key) {
      return null;
    }
    const { t } = this.tr();
    switch (key) {
      case 'offline':
        return {
          tone: 'warning',
          title: t('state.offline.title'),
          message: t('state.offline.message'),
        };
      case 'error':
        return {
          tone: 'danger',
          title: t('signIn.error.title'),
          message: t('signIn.error.message'),
        };
      case 'expired':
        return {
          tone: 'warning',
          title: t('state.expired.title'),
          message: t('state.expired.message', { business: this.businessName() }),
        };
      case 'forgotSent':
        return {
          tone: 'tint',
          title: t('signIn.forgotSent.title'),
          message: t('signIn.forgotSent.message', { email: this.forgotEmail() }),
        };
      default:
        return {
          tone: key === 'forgotMissing' ? 'warning' : 'danger',
          title: t(`signIn.${key}.title`),
          message: t(`signIn.${key}.message`),
        };
    }
  });

  constructor() {
    // Ionic keeps this page cached, so clear the previous visit's notice when it is opened again.
    effect(() => {
      this.expired();
      untracked(() => this.noticeKey.set(null));
    });
  }

  protected changeLanguage(language: Language): void {
    void this.languages.use(language);
  }

  protected async signIn({ email, password }: SignInCredentials): Promise<void> {
    if (!email || !password) {
      this.noticeKey.set('missing');
      return;
    }
    this.submitting.set(true);
    this.noticeKey.set(null);
    try {
      await this.session.signIn(email, password);
      await this.business.load().catch(() => null);
      await this.router.navigateByUrl(this.safeReturnUrl());
    } catch (error) {
      const kind = ErpnextError.from(error).kind;
      this.noticeKey.set(
        kind === 'offline' ? 'offline' : kind === 'unauthorized' ? 'invalid' : 'error',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected async forgotPassword(email: string): Promise<void> {
    if (!email) {
      this.noticeKey.set('forgotMissing');
      return;
    }
    await this.session.requestPasswordReset(email);
    this.forgotEmail.set(email);
    this.noticeKey.set('forgotSent');
  }

  private safeReturnUrl(): string {
    const url = this.returnUrl() ?? '/';
    return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/sign-in') ? url : '/';
  }
}
