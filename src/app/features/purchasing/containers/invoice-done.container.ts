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
import { InvoiceSummaryComponent } from '../components/invoice-summary.component';
import { SupplierInvoice } from '../data-access/purchase.models';
import { SupplierInvoiceApiService } from '../data-access/supplier-invoice-api.service';
import { injectInvoiceContext } from './invoice-context';
import { invoiceView } from './invoice-view';

/** The recorded supplier invoice: its status, what is owed, and the way back to the order. */
@Component({
  selector: 'app-invoice-done',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    InvoiceSummaryComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
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
    <app-back-link [label]="txt.back" (back)="ctx.openOrder()" />
    @if (view(); as v) {
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      <app-invoice-summary [chips]="v.chips" [totals]="v.totals" [payments]="v.payments" />
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
    @if (canPay()) {
      <button type="button" class="md-btn md-btn--primary" (click)="pay()">{{ txt.pay }}</button>
    }
    <button
      type="button"
      class="md-btn"
      [class.md-btn--primary]="!canPay()"
      (click)="ctx.openOrder()"
    >
      {{ txt.viewOrder }}
    </button>
  `,
})
export class InvoiceDoneContainer implements OnInit {
  protected readonly ctx = injectInvoiceContext();
  private readonly api = inject(SupplierInvoiceApiService);
  private readonly invoice = signal<SupplierInvoice | null>(null);
  protected readonly failed = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('purchase.invoice.recordedTitle'),
      viewOrder: t('purchase.invoice.viewOrder'),
      pay: t('purchase.invoice.pay'),
      loading: t('purchase.loading'),
      retry: t('purchase.retry'),
      loadFailed: {
        title: t('purchase.invoice.loadFailed.title'),
        message: t('purchase.invoice.loadFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const invoice = this.invoice();
    return invoice ? invoiceView(invoice, this.ctx.store.order(), true, this.ctx.i18n.tr()) : null;
  });

  protected readonly canPay = computed(
    () =>
      this.ctx.session.capabilities().paySuppliers &&
      !!this.invoice()?.submitted &&
      (this.invoice()?.outstanding ?? 0) > 0.005,
  );

  protected pay(): void {
    void this.ctx.router.navigate(['/purchases/invoice', this.ctx.store.result(), 'pay']);
  }

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
    if (!name) {
      return;
    }
    this.failed.set(false);
    try {
      this.invoice.set(await this.api.invoice(name));
    } catch {
      this.failed.set(true);
    }
  }
}
