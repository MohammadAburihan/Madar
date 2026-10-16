import { ChangeDetectionStrategy, Component, OnInit, computed } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { injectOrderInvoiceContext } from './order-invoice-context';
import { invoiceDone } from './order-invoice-view';

/** The invoice made from the order: what is owed, and that it moved no stock and took no payment. */
@Component({
  selector: 'app-order-invoice-done',
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
      <button type="button" class="md-btn" (click)="ctx.router.navigate(['/sales'])">
        {{ v.backToSales }}
      </button>
    }
  `,
})
export class OrderInvoiceDoneContainer implements OnInit {
  protected readonly ctx = injectOrderInvoiceContext();

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const invoice = store.result();
    if (!invoice) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    return {
      ...invoiceDone(store.orderName() ?? '', invoice, this.ctx.currency(), tr),
      back: tr.t('sales.quote.back'),
      openOrder: tr.t('sales.quote.openOrder'),
      backToSales: tr.t('sales.quote.backToSales'),
    };
  });

  ngOnInit(): void {
    if (!this.ctx.store.result()) {
      void this.ctx.go('', { replaceUrl: true });
      return;
    }
    this.ctx.store.resultShown.set(true);
  }
}
