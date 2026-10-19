import { ChangeDetectionStrategy, Component, OnInit, computed } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { injectAddStockContext } from './add-stock-context';

/** The posted stock: what came in, and where. */
@Component({
  selector: 'app-add-stock-done',
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
      <app-back-link [label]="v.back" (back)="ctx.router.navigate(['/inventory'])" />
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      <app-feedback-card [status]="true" [title]="v.added" [message]="v.message" />
      <button
        type="button"
        class="md-btn md-btn--primary"
        (click)="ctx.router.navigate(['/inventory'])"
      >
        {{ v.openStock }}
      </button>
      <button type="button" class="md-btn" (click)="more()">{{ v.more }}</button>
    }
  `,
})
export class AddStockDoneContainer implements OnInit {
  protected readonly ctx = injectAddStockContext();

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const result = store.result();
    const sent = store.sent();
    if (!result || !sent) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const units = sent.lines.reduce((sum, l) => sum + l.qty, 0);
    return {
      back: tr.t('sale.back'),
      title: tr.t('addStock.doneTitle'),
      subtitle: `${result.entry} · ${tr.t(`addStock.reasons.${sent.reason}`)}`,
      added: tr.t('addStock.added'),
      message: tr.plural('addStock.doneMessage', sent.lines.length, {
        units: new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(units),
        warehouse: this.ctx.warehouseName(sent.warehouse),
      }),
      openStock: tr.t('adjust.openStock'),
      more: tr.t('addStock.more'),
    };
  });

  ngOnInit(): void {
    if (!this.ctx.store.result()) {
      void this.ctx.go('', { replaceUrl: true });
      return;
    }
    this.ctx.store.resultShown.set(true);
  }

  protected more(): void {
    this.ctx.store.start();
    void this.ctx.go('');
  }
}
