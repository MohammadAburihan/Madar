import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ConnectResult, ConnectionService } from '../../../core/business/connection.service';
import { Language } from '../../../core/i18n/language.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BusinessBarComponent } from '../../../shared/ui/business-bar.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';

/** "Connect your business": the business's Madar address, typed once on the web and in the apps. */
@Component({
  selector: 'app-connect',
  imports: [
    BusinessBarComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ion-page', '[class.desktop]': "viewport() !== 'mobile'" },
  template: `
    @let txt = text();
    <main class="page">
      <div class="body">
        <app-business-bar [businessName]="txt.setup" [brand]="txt.brand" [interactive]="false" />
        <app-language-switcher [language]="i18n.language()" (languageChange)="use($event)" />
        <h1>{{ txt.title }}</h1>
        <p class="muted">{{ txt.subtitle }}</p>
        <p class="wordmark">{{ txt.wordmark }}</p>
        <app-text-field
          [label]="txt.address"
          type="text"
          inputmode="url"
          autocomplete="url"
          [ltr]="true"
          [hint]="txt.hint"
          [error]="error() ? txt.errors[error()!] : null"
          [value]="address()"
          (valueChange)="address.set($event); error.set(null)"
        />
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="connecting()"
          (click)="connect()"
        >
          {{ connecting() ? txt.connecting : txt.connect }}
        </button>
        <app-feedback-card [title]="txt.help.title" [message]="txt.help.message" />
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

    h1 {
      margin: 0;
      color: var(--md-ink);
      font: 700 28px / var(--md-lh) var(--md-font);
    }

    p {
      margin: 0;
    }

    .wordmark {
      color: var(--md-primary);
      font: 700 32px / var(--md-lh) var(--md-font);
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
export class ConnectContainer implements OnInit {
  /** Set when another business's Madar sent the user here with the address they typed there. */
  readonly confirm = input<string | undefined>();

  private readonly connection = inject(ConnectionService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly address = signal(
    this.connection.connected() ? (this.connection.address() ?? '') : '',
  );
  protected readonly connecting = signal(false);
  protected readonly error = signal<Exclude<ConnectResult, 'connected' | 'elsewhere'> | null>(null);

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      setup: t('connect.setup'),
      brand: t('app.name'),
      title: t('connect.title'),
      subtitle: t('connect.subtitle'),
      // The mock shows both scripts whatever the language.
      wordmark: 'Madar / مدار',
      address: t('connect.address'),
      hint: t('connect.hint'),
      connect: t('connect.connect'),
      connecting: t('connect.connecting'),
      help: { title: t('connect.help.title'), message: t('connect.help.message') },
      errors: {
        invalid: t('connect.errors.invalid'),
        insecure: t('connect.errors.insecure'),
        unreachable: t('connect.errors.unreachable'),
      },
    };
  });

  ngOnInit(): void {
    // Typed at another business's Madar, which sent the user here: that was this address, so it is confirmed.
    if (this.confirm()) {
      this.address.set(this.document.location.origin);
      void this.connect();
    }
  }

  protected use(language: Language): void {
    this.i18n.use(language);
  }

  protected async connect(): Promise<void> {
    if (this.connecting()) {
      return;
    }
    this.connecting.set(true);
    this.error.set(null);
    const result = await this.connection.connect(this.address());
    this.connecting.set(false);
    if (result === 'connected') {
      if (this.connection.native) {
        // A fresh start, so nothing read from the previous business stays in memory.
        this.document.location.assign('/sign-in');
      } else {
        void this.router.navigate(['/sign-in'], { replaceUrl: true });
      }
    } else if (result === 'elsewhere') {
      const target = ConnectionService.origin(this.address())!;
      this.document.location.assign(`${target}/connect?confirm=1`);
    } else {
      this.error.set(result);
    }
  }
}
