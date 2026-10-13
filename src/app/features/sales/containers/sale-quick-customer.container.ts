import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { injectSaleContext } from './sale-context';

@Component({
  selector: 'app-sale-quick-customer',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: './sale-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher
      [language]="ctx.i18n.language()"
      (languageChange)="ctx.i18n.use($event)"
    />
    <app-back-link [label]="txt.back" (back)="close()" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (failed()) {
      <app-feedback-card tone="danger" [title]="txt.failed.title" [message]="txt.failed.message" />
    }
    <form class="stack" (submit)="$event.preventDefault(); save()" novalidate>
      <app-text-field
        [label]="txt.name"
        autocomplete="name"
        [(value)]="name"
        [error]="showErrors() && !name().trim() ? txt.nameRequired : null"
      />
      <app-text-field
        [label]="txt.phone"
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        [ltr]="true"
        [(value)]="phone"
      />
      <app-text-field
        [label]="txt.email"
        type="email"
        inputmode="email"
        autocomplete="email"
        [ltr]="true"
        [(value)]="email"
      />
      <app-text-field [label]="txt.address" autocomplete="street-address" [(value)]="address" />
      <button type="submit" class="md-btn md-btn--primary" [disabled]="saving()">
        {{ saving() ? txt.saving : txt.save }}
      </button>
      <button type="button" class="md-btn" (click)="close()">{{ txt.cancel }}</button>
    </form>
  `,
})
export class SaleQuickCustomerContainer {
  /** Where to go after saving, so the new customer returns to the task that asked for it. */
  readonly return = input<string | undefined>();

  protected readonly ctx = injectSaleContext();
  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly address = signal('');
  protected readonly saving = signal(false);
  protected readonly failed = signal(false);
  protected readonly showErrors = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('sale.newCustomer.title'),
      subtitle: t('sale.newCustomer.subtitle'),
      name: t('sale.newCustomer.name'),
      phone: t('sale.newCustomer.phone'),
      email: t('sale.newCustomer.email'),
      address: t('sale.newCustomer.address'),
      save: t('sale.newCustomer.save'),
      saving: t('sale.newCustomer.saving'),
      cancel: t('sale.cancel'),
      nameRequired: t('sale.newCustomer.nameRequired'),
      failed: {
        title: t('sale.newCustomer.failed.title'),
        message: t('sale.newCustomer.failed.message'),
      },
    };
  });

  protected async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.showErrors.set(true);
    if (!this.name().trim()) {
      return;
    }
    this.saving.set(true);
    this.failed.set(false);
    try {
      await this.ctx.store.addCustomer({
        name: this.name(),
        phone: this.phone(),
        email: this.email(),
        address: this.address(),
      });
      void this.ctx.go(this.return() === 'customer' ? '' : 'items');
    } catch {
      this.failed.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    void this.ctx.go(this.ctx.store.hasCustomer() ? 'items' : '');
  }
}
