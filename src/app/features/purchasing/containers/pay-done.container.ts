import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { PaymentDetailComponent } from '../components/payment-detail.component';
import { SupplierInvoice, SupplierPayment } from '../data-access/purchase.models';
import { SupplierInvoiceApiService } from '../data-access/supplier-invoice-api.service';
import { SupplierPaymentApiService } from '../data-access/supplier-payment-api.service';
import { injectPayContext } from './pay-context';
import { paymentResult } from './payment-view';

/** The recorded payment: what was paid, what the invoice still owes, and the account it came from. */
@Component({
  selector: 'app-pay-done',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    PaymentDetailComponent,
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
    <app-back-link [label]="txt.back" (back)="ctx.openInvoice(invoiceName())" />
    @if (view(); as v) {
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      <app-payment-detail [view]="v" [paidFromLabel]="txt.paidFrom" />
    } @else if (failed()) {
      <app-page-heading [title]="txt.title" [subtitle]="ctx.store.result() ?? ''" />
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
    <button type="button" class="md-btn md-btn--primary" (click)="ctx.openInvoice(invoiceName())">
      {{ txt.viewInvoice }}
    </button>
    <button type="button" class="md-btn" (click)="ctx.router.navigate(['/purchases'])">
      {{ txt.workspace }}
    </button>
  `,
})
export class PayDoneContainer implements OnInit {
  protected readonly ctx = injectPayContext();
  private readonly payments = inject(SupplierPaymentApiService);
  private readonly invoices = inject(SupplierInvoiceApiService);
  private readonly payment = signal<SupplierPayment | null>(null);
  private readonly invoice = signal<SupplierInvoice | null>(null);
  protected readonly failed = signal(false);

  /** The invoice the payment went to, which may differ from the one the task was opened from. */
  protected readonly invoiceName = computed(
    () => this.ctx.store.sent()?.invoice ?? this.ctx.store.invoiceName(),
  );

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('purchase.payment.recordedTitle'),
      paidFrom: t('purchase.payment.paidFrom'),
      viewInvoice: t('purchase.payment.viewInvoice'),
      workspace: t('purchase.payment.workspace'),
      loading: t('purchase.loading'),
      retry: t('purchase.retry'),
      loadFailed: {
        title: t('purchase.payment.loadFailed.title'),
        message: t('purchase.payment.loadFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const payment = this.payment();
    const invoice = this.invoice();
    return payment && invoice ? paymentResult(payment, invoice, true, this.ctx.i18n.tr()) : null;
  });

  ngOnInit(): void {
    if (!this.ctx.store.result()) {
      void this.ctx.go('', { replaceUrl: true });
      return;
    }
    this.ctx.store.resultShown.set(true);
    void this.load();
  }

  protected async load(): Promise<void> {
    const name = this.ctx.store.result();
    const invoice = this.invoiceName();
    if (!name || !invoice) {
      return;
    }
    this.failed.set(false);
    try {
      const [payment, paid] = await Promise.all([
        this.payments.payment(name),
        this.invoices.invoice(invoice),
      ]);
      this.payment.set(payment);
      this.invoice.set(paid);
    } catch {
      this.failed.set(true);
    }
  }
}
