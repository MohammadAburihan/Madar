import { ChangeDetectionStrategy, Component, OnInit, computed } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { injectReceiptContext } from './receipt-context';
import { receiptDone } from './receipt-view';

/** The posted receipt: partly or fully received, and what it did not create. */
@Component({
  selector: 'app-receipt-done',
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
      <button type="button" class="md-btn" (click)="ctx.router.navigate(['/purchases'])">
        {{ v.backToPurchases }}
      </button>
    }
  `,
})
export class ReceiptDoneContainer implements OnInit {
  protected readonly ctx = injectReceiptContext();

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const order = store.order();
    const sent = store.sent();
    if (!store.result() || !order || !sent) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    return {
      ...receiptDone(order, sent, this.ctx.warehouseName(sent.warehouse), tr),
      back: tr.t('sale.back'),
      openOrder: tr.t('purchase.receipt.openOrder'),
      backToPurchases: tr.t('purchase.receipt.backToPurchases'),
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
