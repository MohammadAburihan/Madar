import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { KnownBusinessesService } from '../../../core/business/known-businesses.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';

/** "Your businesses": this one, and the other businesses' Madar addresses saved on this device. */
@Component({
  selector: 'app-businesses',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    .business {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .business .md-btn {
      align-self: stretch;
    }
  `,
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="router.navigate(['/settings'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    <app-feedback-card [title]="txt.current.title" [message]="txt.current.message" />
    @for (business of known.businesses(); track business.address) {
      <section class="business" [attr.aria-label]="business.address">
        <app-feedback-card
          tone="tint"
          [title]="host(business.address)"
          [message]="business.address"
        />
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="openTasks.any()"
          (click)="open(business.address)"
        >
          {{ txt.open(host(business.address)) }}
        </button>
        <button type="button" class="md-btn" (click)="known.remove(business.address)">
          {{ txt.remove(host(business.address)) }}
        </button>
      </section>
    }
    @if (openTasks.any() && known.businesses().length) {
      <app-feedback-card
        tone="warning"
        [title]="txt.openTask.title"
        [message]="txt.openTask.message"
      />
    }
    @if (adding()) {
      <app-text-field
        [label]="txt.address"
        type="text"
        inputmode="url"
        autocomplete="url"
        [ltr]="true"
        [hint]="txt.hint"
        [error]="addError() ? txt.errors[addError()!] : null"
        [value]="address()"
        (valueChange)="address.set($event); addError.set(null)"
      />
      <button type="button" class="md-btn md-btn--primary" (click)="save()">{{ txt.save }}</button>
      <button type="button" class="md-btn" (click)="adding.set(false)">{{ txt.cancel }}</button>
    } @else {
      <button type="button" class="md-btn" (click)="adding.set(true)">{{ txt.add }}</button>
    }
    <p class="muted">{{ txt.note }}</p>
  `,
})
export class BusinessesContainer {
  private readonly business = inject(BusinessService);
  private readonly session = inject(SessionService);
  private readonly document = inject(DOCUMENT);
  protected readonly known = inject(KnownBusinessesService);
  protected readonly openTasks = inject(OpenTasksService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly adding = signal(false);
  protected readonly address = signal('');
  protected readonly addError = signal<'invalid' | 'current' | 'known' | null>(null);

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    const business = this.business.active();
    return {
      back: t('contacts.back'),
      title: t('businesses.title'),
      subtitle: t('businesses.subtitle'),
      current: {
        title: business?.name ?? '',
        message: t('businesses.current', {
          role: t(`home.role.${this.session.persona()}`),
          currency: business?.currency ?? '',
        }),
      },
      open: (host: string) => t('businesses.open', { business: host }),
      remove: (host: string) => t('businesses.remove', { business: host }),
      add: t('businesses.add'),
      address: t('businesses.address'),
      hint: t('businesses.hint'),
      save: t('businesses.save'),
      cancel: t('businesses.cancel'),
      note: t('businesses.note'),
      openTask: block('settings.openTask'),
      errors: {
        invalid: t('businesses.errors.invalid'),
        current: t('businesses.errors.current'),
        known: t('businesses.errors.known'),
      },
    };
  });

  constructor() {
    void this.business.ensure().catch(() => undefined);
  }

  protected host(address: string): string {
    return new URL(address).host;
  }

  protected save(): void {
    const result = this.known.add(this.address());
    if (result === 'added') {
      this.address.set('');
      this.adding.set(false);
    } else {
      this.addError.set(result);
    }
  }

  /** Each business is its own Madar: switching opens its address (and its own sign-in). */
  protected open(address: string): void {
    // Leaving reloads the app: an open confirmation's reference would be lost.
    if (!this.openTasks.any()) {
      this.document.location.assign(address);
    }
  }
}
