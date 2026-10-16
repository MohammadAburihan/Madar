import { ChangeDetectionStrategy, Component, OnInit, computed } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { injectDeliveryContext } from './delivery-context';
import { deliveryDone } from './delivery-view';

/** The posted delivery: partly or fully delivered, and that invoicing and payment stay separate. */
@Component({
  selector: 'app-delivery-done',
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
    @if (view(); as v) {
      <app-language-switcher
        [language]="ctx.i18n.language()"
        (languageChange)="ctx.i18n.use($event)"
      />
      <app-back-link [label]="v.back" (back)="ctx.openOrder()" />
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      <app-feedback-card [title]="v.cardTitle" [message]="v.cardMessage" />
      <button type="button" class="md-btn md-btn--primary" (click)="ctx.openOrder()">
        {{ v.openOrder }}
      </button>
      @if (v.invoice) {
        <button type="button" class="md-btn" (click)="invoice()">{{ v.invoice }}</button>
      }
    }
  `,
})
export class DeliveryDoneContainer implements OnInit {
  protected readonly ctx = injectDeliveryContext();

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const order = store.order();
    const sent = store.sent();
    if (!store.result() || !order || !sent) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const billable =
      this.ctx.session.capabilities().invoiceOrders && order.billingStatus !== 'Fully Billed';
    return {
      ...deliveryDone(order, sent, this.ctx.warehouseName(sent.warehouse), tr),
      back: tr.t('sales.quote.back'),
      openOrder: tr.t('sales.quote.openOrder'),
      invoice: billable ? tr.t('sales.deliver.reviewInvoice') : null,
    };
  });

  protected invoice(): void {
    void this.ctx.router.navigate(['/sales/orders', this.ctx.store.orderName(), 'invoice']);
  }

  ngOnInit(): void {
    if (!this.ctx.store.result()) {
      void this.ctx.go('', { replaceUrl: true });
      return;
    }
    this.ctx.store.resultShown.set(true);
  }
}
