import { ChangeDetectionStrategy, Component, OnInit, computed } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { injectReturnContext } from './return-context';
import { returnDone } from './sales-return-view';

/** The posted return: the credit, the goods back in stock, and that no cash was refunded. */
@Component({
  selector: 'app-return-done',
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
      <app-back-link [label]="v.back" (back)="ctx.openInvoice()" />
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      <app-feedback-card [title]="v.cardTitle" [message]="v.cardMessage" />
      <button type="button" class="md-btn md-btn--primary" (click)="ctx.openInvoice()">
        {{ v.viewSale }}
      </button>
      <button type="button" class="md-btn" (click)="ctx.router.navigate(['/sales'])">
        {{ v.backToSales }}
      </button>
    }
  `,
})
export class ReturnDoneContainer implements OnInit {
  protected readonly ctx = injectReturnContext();

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const source = store.source();
    const sent = store.sent();
    const result = store.result();
    if (!source || !sent || !result) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    return {
      ...returnDone(
        source,
        sent,
        result,
        this.ctx.warehouseName(sent.warehouse),
        this.ctx.currency(),
        tr,
      ),
      back: tr.t('sales.quote.back'),
      viewSale: tr.t('sales.return.viewSale'),
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
