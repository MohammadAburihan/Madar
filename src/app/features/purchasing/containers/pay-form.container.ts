import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { injectPayContext } from './pay-context';
import {
  allocationText,
  invoiceOptions,
  payConfirmLabel,
  payHeading,
  payReview,
} from './payment-view';

/** "Pay supplier": which invoice, how much, and from which account. */
@Component({
  selector: 'app-pay-form',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher
      [language]="ctx.i18n.language()"
      (languageChange)="ctx.i18n.use($event)"
    />
    <app-back-link [label]="txt.back" (back)="ctx.openInvoice()" />
    <app-page-heading [title]="heading().title" [subtitle]="heading().subtitle" />
    @if (!ctx.session.capabilities().paySuppliers) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (loadFailed()) {
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else if (!ctx.store.invoice()) {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else if (!ctx.store.unpaid().length) {
      <app-feedback-card [title]="txt.nothingToPay.title" [message]="txt.nothingToPay.message" />
      <button type="button" class="md-btn md-btn--primary" (click)="ctx.openInvoice()">
        {{ txt.viewInvoice }}
      </button>
    } @else if (!ctx.store.accounts().length) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccounts.title"
        [message]="txt.noAccounts.message"
      />
    } @else if (form(); as f) {
      @if (ctx.store.openedNotPayable()) {
        <app-feedback-card
          tone="warning"
          [title]="txt.notPayable.title"
          [message]="txt.notPayable.message"
        />
      }
      <app-select-field
        [label]="txt.invoice"
        [options]="f.invoices"
        [placeholder]="txt.chooseInvoice"
        [value]="ctx.store.selected()"
        (valueChange)="ctx.store.selectInvoice($event)"
      />
      <app-text-field
        [label]="txt.amount"
        inputmode="decimal"
        [ltr]="true"
        [suffix]="ctx.currency()"
        [error]="f.amountError"
        [value]="ctx.store.amountInput()"
        (valueChange)="ctx.store.setAmount($event)"
      />
      <app-select-field
        [label]="txt.from"
        [options]="f.accounts"
        [placeholder]="txt.chooseAccount"
        [value]="ctx.store.account()"
        (valueChange)="ctx.store.setAccount($event)"
      />
      <app-text-field [label]="txt.allocation" [value]="f.allocation" [readonly]="true" />
      @if (f.review) {
        <app-feedback-card [title]="txt.reviewTitle" [message]="f.review" />
      }
      @if (notice(); as n) {
        <app-feedback-card [tone]="n.tone" [title]="n.title" [message]="n.message" />
        @if (ctx.store.failure() === 'changed') {
          <button type="button" class="md-btn" (click)="reload()">{{ txt.reload }}</button>
        }
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="!ctx.store.ready() || ctx.store.savingDraft()"
        (click)="confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? txt.confirming : f.confirm }}
      </button>
      <button
        type="button"
        class="md-btn"
        [disabled]="!ctx.store.ready() || ctx.store.savingDraft()"
        (click)="saveDraft()"
      >
        {{ ctx.store.savingDraft() ? txt.savingDraft : txt.saveDraft }}
      </button>
      <p class="muted">{{ txt.reference }}</p>
    }
  `,
})
export class PayFormContainer implements OnInit {
  /** Set when "Check result" found that a timed-out payment was never recorded. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectPayContext();
  protected readonly loadFailed = signal(false);
  private readonly showNotCreated = signal(false);
  private readonly savedDraft = signal<string | null>(null);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const block = (key: string, params?: Record<string, string>) => ({
      title: t(`${key}.title`),
      message: t(`${key}.message`, params),
    });
    return {
      back: t('sale.back'),
      invoice: t('purchase.pay.invoice'),
      amount: t('purchase.pay.amount'),
      from: t('purchase.pay.from'),
      chooseAccount: t('purchase.pay.chooseAccount'),
      allocation: t('purchase.pay.allocation'),
      reviewTitle: t('purchase.pay.reviewTitle'),
      confirming: t('purchase.pay.confirming'),
      saveDraft: t('purchase.pay.saveDraft'),
      savingDraft: t('purchase.pay.savingDraft'),
      reload: t('purchase.pay.reload'),
      viewInvoice: t('purchase.payment.viewInvoice'),
      loading: t('purchase.loading'),
      retry: t('purchase.retry'),
      reference: t('purchase.review.reference', { reference: this.ctx.store.reference() }),
      noAccess: block('purchase.pay.noAccess'),
      loadFailed: block('purchase.invoice.loadFailed'),
      nothingToPay: block('purchase.pay.nothingToPay', { currency: this.ctx.currency() }),
      noAccounts: block('purchase.pay.noAccounts'),
      notPayable: block('purchase.pay.notPayable', { currency: this.ctx.currency() }),
      chooseInvoice: t('purchase.pay.chooseInvoice'),
    };
  });

  protected readonly heading = computed(() => {
    const invoice = this.ctx.store.invoice();
    const { t } = this.ctx.i18n.tr();
    return invoice
      ? payHeading(invoice, this.ctx.i18n.tr())
      : { title: t('purchase.pay.title'), subtitle: this.ctx.store.invoiceName() ?? '' };
  });

  protected readonly form = computed(() => {
    const store = this.ctx.store;
    const tr = this.ctx.i18n.tr();
    const currency = this.ctx.currency();
    const invoice = store.selectedInvoice();
    const account = store.chosenAccount();
    const amount = store.amount();
    return {
      invoices: invoiceOptions(store.unpaid(), currency, tr),
      accounts: store.accounts().map((a) => ({ value: a.mode, label: a.label })),
      allocation: invoice ? allocationText(amount, invoice.name, currency, tr) : '',
      amountError:
        invoice && !store.amountValid()
          ? tr.t('purchase.pay.amountError', { max: invoice.outstanding.toFixed(2) })
          : null,
      review:
        invoice && account && store.amountValid()
          ? payReview(amount, invoice.outstanding, account.label, currency, tr)
          : null,
      confirm: payConfirmLabel(amount, currency, tr),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (failure && this.ctx.store.state() === 'failed') {
      return {
        tone: 'danger' as const,
        title: t(`purchase.pay.failed.${failure}.title`),
        message: t(`purchase.pay.failed.${failure}.message`),
      };
    }
    if (this.showNotCreated()) {
      return {
        tone: 'danger' as const,
        title: t('purchase.pay.notCreated.title'),
        message: t('purchase.pay.notCreated.message'),
      };
    }
    const draft = this.savedDraft();
    return draft
      ? {
          tone: 'tint' as const,
          title: t('purchase.pay.draftSaved.title'),
          message: t('purchase.pay.draftSaved.message', { payment: draft }),
        }
      : null;
  });

  constructor() {
    effect(() => {
      const flag = !!this.notCreated();
      untracked(() => this.showNotCreated.set(flag));
    });
  }

  ngOnInit(): void {
    const store = this.ctx.store;
    if (store.busy()) {
      void this.ctx.go('checking', { replaceUrl: true });
      return;
    }
    if (store.state() === 'confirmed' && !store.resultShown()) {
      void this.ctx.go('done', { replaceUrl: true });
      return;
    }
    if (store.state() === 'confirmed') {
      // The payment was recorded and shown (here by Back): this visit is a new payment.
      store.start(store.invoiceName() ?? '');
    }
    if (!store.invoice()) {
      void this.load();
    }
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    try {
      await this.ctx.store.load(this.ctx.session.capabilities().paymentModes);
    } catch {
      this.loadFailed.set(true);
    }
  }

  /** After "an earlier payment was recorded": start a clean task so the invoice shows what it owes now. */
  protected reload(): void {
    this.ctx.store.start(this.ctx.store.invoiceName() ?? '');
    void this.load();
  }

  protected async confirm(): Promise<void> {
    this.showNotCreated.set(false);
    this.savedDraft.set(null);
    await this.ctx.store.confirm();
    const state = this.ctx.store.state();
    if (state === 'confirmed') {
      void this.ctx.go('done', { replaceUrl: true });
    } else if (state === 'unresolved') {
      void this.ctx.go('checking', { replaceUrl: true });
    }
  }

  protected async saveDraft(): Promise<void> {
    this.showNotCreated.set(false);
    this.savedDraft.set(await this.ctx.store.saveDraft());
  }
}
