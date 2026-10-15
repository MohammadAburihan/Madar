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
import { InvoiceSummaryComponent } from '../components/invoice-summary.component';
import { PurchaseApiService } from '../data-access/purchase-api.service';
import { OrderDetail, SupplierInvoice } from '../data-access/purchase.models';
import { SupplierInvoiceApiService } from '../data-access/supplier-invoice-api.service';
import { invoiceView } from './invoice-view';

/** One supplier invoice: its status, what is owed, the payments made, and its order. */
@Component({
  selector: 'app-supplier-invoice',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    InvoiceSummaryComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
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
      <app-invoice-summary [chips]="v.chips" [totals]="v.totals" [payments]="v.payments" />
      @let actions = primary();
      @if (actions.pay) {
        <button type="button" class="md-btn md-btn--primary" (click)="pay()">{{ txt.pay }}</button>
      }
      @if (actions.payment; as payment) {
        <button
          type="button"
          class="md-btn"
          [class.md-btn--primary]="!actions.pay"
          (click)="openPayment(payment)"
        >
          {{ txt.viewPayment }}
        </button>
      }
      @if (invoice()?.order; as order) {
        <button
          type="button"
          class="md-btn"
          [class.md-btn--primary]="!actions.pay && !actions.payment"
          (click)="openOrder(order)"
        >
          {{ txt.viewOrder }}
        </button>
      }
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
export class SupplierInvoiceContainer {
  readonly name = input.required<string>();

  private readonly api = inject(SupplierInvoiceApiService);
  private readonly orders = inject(PurchaseApiService);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  protected readonly invoice = signal<SupplierInvoice | null>(null);
  private readonly order = signal<OrderDetail | null>(null);
  protected readonly failed = signal(false);
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('purchase.invoice.title'),
      viewOrder: t('purchase.invoice.viewOrder'),
      pay: t('purchase.invoice.pay'),
      viewPayment: t('purchase.invoice.viewPayment'),
      loading: t('purchase.loading'),
      retry: t('purchase.retry'),
      noAccess: {
        title: t('purchase.invoice.viewNoAccess.title'),
        message: t('purchase.invoice.viewNoAccess.message'),
      },
      loadFailed: {
        title: t('purchase.invoice.loadFailed.title'),
        message: t('purchase.invoice.loadFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const invoice = this.invoice();
    return invoice ? invoiceView(invoice, this.order(), false, this.i18n.tr()) : null;
  });

  /** "Pay supplier" while something is owed (owner), and the latest payment's record once there is one. */
  protected readonly primary = computed(() => {
    const invoice = this.invoice();
    return {
      pay:
        !!invoice && !invoice.cancelled && invoice.outstanding > 0.005 && this.caps().paySuppliers,
      payment: invoice?.payments.at(-1)?.name ?? null,
    };
  });

  protected pay(): void {
    void this.router.navigate(['/purchases/invoice', this.name(), 'pay']);
  }

  protected openPayment(payment: string): void {
    void this.router.navigate(['/purchases/payment', payment]);
  }

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
    this.invoice.set(null);
    this.order.set(null);
    this.failed.set(false);
    try {
      const invoice = await this.api.invoice(name);
      if (run !== this.run) {
        return;
      }
      this.invoice.set(invoice);
      // The order chip is extra; the invoice stands without it.
      const order = invoice.order ? await this.orders.order(invoice.order).catch(() => null) : null;
      if (run === this.run) {
        this.order.set(order);
      }
    } catch {
      if (run === this.run) {
        this.failed.set(true);
      }
    }
  }

  protected openOrder(order: string): void {
    void this.router.navigate(['/purchases/order', order]);
  }

  protected back(): void {
    const order = this.invoice()?.order;
    void this.router.navigate(order ? ['/purchases/order', order] : ['/purchases']);
  }
}
