import { ChangeDetectionStrategy, Component, OnInit, computed } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { injectAdjustContext } from './adjust-context';
import { doneMessage } from './adjust-view';

/** The posted count or write-off, with the balances ERPNext now reports. */
@Component({
  selector: 'app-adjust-done',
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
      <app-feedback-card [title]="v.posted" [message]="v.message" />
      <button type="button" class="md-btn md-btn--primary" (click)="openStock(v.item)">
        {{ v.openStock }}
      </button>
    }
  `,
})
export class AdjustDoneContainer implements OnInit {
  protected readonly ctx = injectAdjustContext();

  protected readonly view = computed(() => {
    const store = this.ctx.store;
    const result = store.result();
    const item = store.item();
    const sent = store.sent();
    if (!result || !item || !sent) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    return {
      back: t('sale.back'),
      title: t(this.ctx.key('doneTitle')),
      subtitle: t(this.ctx.key('doneSubtitle'), { entry: result.entry }),
      posted: t('adjust.posted'),
      message: doneMessage(this.ctx.kind, result, this.ctx.warehouseName(sent.warehouse), item, tr),
      item: item.code,
      openStock: t('adjust.openStock'),
    };
  });

  ngOnInit(): void {
    if (!this.ctx.store.result()) {
      void this.ctx.go('', { replaceUrl: true });
      return;
    }
    this.ctx.store.resultShown.set(true);
  }

  protected openStock(item: string): void {
    void this.ctx.router.navigate(['/inventory'], { queryParams: { item } });
  }
}
