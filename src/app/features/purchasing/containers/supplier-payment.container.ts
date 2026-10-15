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
import { SessionService } from '../../../core/auth/session.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { PaymentDetailComponent } from '../components/payment-detail.component';
import { SupplierInvoice, SupplierPayment } from '../data-access/purchase.models';
import { SupplierInvoiceApiService } from '../data-access/supplier-invoice-api.service';
import { SupplierPaymentApiService } from '../data-access/supplier-payment-api.service';
import { paymentResult } from './payment-view';

/** One supplier payment: what it paid, the invoice it belongs to, and the account it came from. */
@Component({
  selector: 'app-supplier-payment',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    PaymentDetailComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="back()" />
    @if (!caps().seeCosts) {
      <app-page-heading [title]="txt.title" />
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (view(); as v) {
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      <app-payment-detail [view]="v" [paidFromLabel]="txt.paidFrom" />
      <button type="button" class="md-btn md-btn--primary" (click)="openInvoice()">
        {{ txt.viewInvoice }}
      </button>
      <button type="button" class="md-btn" (click)="workspace()">{{ txt.workspace }}</button>
    } @else if (failed()) {
      <app-page-heading [title]="txt.title" [subtitle]="name()" />
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load(name())">{{ txt.retry }}</button>
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class SupplierPaymentContainer {
  readonly name = input.required<string>();
  /** The invoice the page was opened from; a payment made in Desk may pay several. */
  readonly invoice = input<string | undefined>();

  private readonly payments = inject(SupplierPaymentApiService);
  private readonly invoices = inject(SupplierInvoiceApiService);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  private readonly payment = signal<SupplierPayment | null>(null);
  private readonly paid = signal<SupplierInvoice | null>(null);
  protected readonly failed = signal(false);
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('purchase.payment.pageTitle'),
      paidFrom: t('purchase.payment.paidFrom'),
      viewInvoice: t('purchase.payment.viewInvoice'),
      workspace: t('purchase.payment.workspace'),
      loading: t('purchase.loading'),
      retry: t('purchase.retry'),
      noAccess: {
        title: t('purchase.invoice.viewNoAccess.title'),
        message: t('purchase.invoice.viewNoAccess.message'),
      },
      loadFailed: {
        title: t('purchase.payment.loadFailed.title'),
        message: t('purchase.payment.loadFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const payment = this.payment();
    const invoice = this.paid();
    return payment && invoice ? paymentResult(payment, invoice, false, this.i18n.tr()) : null;
  });

  constructor() {
    effect(() => {
      const name = this.name();
      if (this.caps().seeCosts) {
        untracked(() => void this.load(name));
      }
    });
  }

  protected async load(name: string): Promise<void> {
    const run = ++this.run;
    this.payment.set(null);
    this.paid.set(null);
    this.failed.set(false);
    try {
      const payment = await this.payments.payment(name);
      const from = this.invoiceName();
      const chosen = payment.invoices.find((i) => i.invoice === from) ?? payment.invoices[0];
      if (!chosen) {
        throw new Error('The payment pays no supplier invoice');
      }
      const invoice = await this.invoices.invoice(chosen.invoice);
      if (run === this.run) {
        this.payment.set(payment);
        this.paid.set(invoice);
      }
    } catch {
      if (run === this.run) {
        this.failed.set(true);
      }
    }
  }

  private invoiceName(): string | undefined {
    return this.invoice();
  }

  protected openInvoice(): void {
    const invoice = this.paid();
    if (invoice) {
      void this.router.navigate(['/purchases/invoice', invoice.name]);
    }
  }

  protected workspace(): void {
    void this.router.navigate(['/purchases']);
  }

  protected back(): void {
    const invoice = this.paid();
    void this.router.navigate(invoice ? ['/purchases/invoice', invoice.name] : ['/purchases']);
  }
}
