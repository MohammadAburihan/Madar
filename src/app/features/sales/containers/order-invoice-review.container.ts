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
import { injectOrderInvoiceContext } from './order-invoice-context';
import { invoiceReview } from './order-invoice-view';

/** "Review order invoice": what invoicing the order bills now, before it is confirmed. */
@Component({
  selector: 'app-order-invoice-review',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
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
    <app-page-heading [title]="heading().title" [subtitle]="heading().subtitle" />
    @if (!ctx.session.capabilities().invoiceOrders) {
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
    } @else if (!ctx.store.order()) {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else if (review(); as r) {
      <app-feedback-card [title]="r.cardTitle" [message]="r.cardMessage" />
      @if (notice(); as n) {
        <app-feedback-card tone="danger" [title]="n.title" [message]="n.message" />
        @if (ctx.store.failure() === 'changed') {
          <button type="button" class="md-btn" (click)="load()">{{ txt.reload }}</button>
        }
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="!ctx.store.ready() || ctx.store.failure() === 'changed'"
        (click)="confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? txt.confirming : txt.confirm }}
      </button>
      <button type="button" class="md-btn" (click)="ctx.openOrder()">{{ txt.cancel }}</button>
      <p class="muted">{{ txt.reference }}</p>
    } @else {
      <app-feedback-card tone="tint" [title]="txt.nothing.title" [message]="txt.nothing.message" />
      <button type="button" class="md-btn md-btn--primary" (click)="ctx.openOrder()">
        {{ txt.openOrder }}
      </button>
    }
  `,
})
export class OrderInvoiceReviewContainer implements OnInit {
  /** Set when "Check result" found that a timed-out invoice was never recorded. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectOrderInvoiceContext();
  protected readonly loadFailed = signal(false);
  private readonly showNotCreated = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('sales.quote.back'),
      confirm: t('sales.orderInvoice.confirm'),
      confirming: t('sales.orderInvoice.confirming'),
      cancel: t('sales.orderInvoice.cancel'),
      reload: t('sales.orderInvoice.reload'),
      openOrder: t('sales.quote.openOrder'),
      loading: t('sales.records.loading'),
      retry: t('sales.records.retry'),
      reference: t('sale.checking.reference', { reference: this.ctx.store.reference() }),
      noAccess: block('sales.orderInvoice.noAccess'),
      loadFailed: block('sales.order.loadFailed'),
      nothing: block('sales.orderInvoice.nothing'),
    };
  });

  protected readonly heading = computed(() => {
    const order = this.ctx.store.order();
    const { t } = this.ctx.i18n.tr();
    return {
      title: t('sales.orderInvoice.reviewTitle'),
      subtitle: order
        ? t('sales.orderInvoice.subtitle', { order: order.name, customer: order.customerName })
        : (this.ctx.store.orderName() ?? ''),
    };
  });

  protected readonly review = computed(() => {
    const order = this.ctx.store.order();
    const preview = this.ctx.store.preview();
    return order && preview
      ? invoiceReview(order, preview, this.ctx.currency(), this.ctx.i18n.tr())
      : null;
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (failure && failure !== 'nothing' && this.ctx.store.state() === 'failed') {
      return {
        title: t(`sales.orderInvoice.failed.${failure}.title`),
        message: t(`sales.orderInvoice.failed.${failure}.message`),
      };
    }
    return this.showNotCreated()
      ? {
          title: t('sales.orderInvoice.notCreated.title'),
          message: t('sales.orderInvoice.notCreated.message'),
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
      // Invoiced and shown (here by Back): this visit reviews what the order still has to bill.
      store.start(store.orderName() ?? '');
    }
    if (!store.order()) {
      void this.load();
    }
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    const store = this.ctx.store;
    if (store.failure() === 'changed') {
      store.start(store.orderName() ?? '');
    }
    try {
      await store.load();
    } catch {
      this.loadFailed.set(true);
    }
  }

  protected async confirm(): Promise<void> {
    this.showNotCreated.set(false);
    await this.ctx.store.confirm();
    const state = this.ctx.store.state();
    if (state === 'confirmed') {
      void this.ctx.go('done', { replaceUrl: true });
    } else if (state === 'unresolved') {
      void this.ctx.go('checking', { replaceUrl: true });
    }
  }
}
