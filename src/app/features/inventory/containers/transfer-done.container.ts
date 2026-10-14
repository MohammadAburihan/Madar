import { ChangeDetectionStrategy, Component, OnInit, computed } from '@angular/core';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { qtyText } from './inventory-view';
import { injectTransferContext } from './transfer-context';
import { doneRows } from './transfer-view';

@Component({
  selector: 'app-transfer-done',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    StatusChipComponent,
    TotalsCardComponent,
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
      <app-status-chip [label]="v.confirmed" />
      <app-feedback-card [title]="v.moved" [message]="v.movedMessage" />
      <app-totals-card density="compact" [rows]="v.rows" />
      <button type="button" class="md-btn md-btn--primary" (click)="history(v.item)">
        {{ v.history }}
      </button>
      <button type="button" class="md-btn" (click)="more()">{{ v.more }}</button>
    }
  `,
})
export class TransferDoneContainer implements OnInit {
  protected readonly ctx = injectTransferContext();

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
      title: t('transfer.doneTitle'),
      subtitle: t('transfer.doneSubtitle', { entry: result.entry }),
      confirmed: t('transfer.confirmed'),
      moved: t('transfer.moved', { qty: qtyText(sent.qty, item.uom, tr), item: item.name }),
      movedMessage: t('transfer.movedMessage'),
      rows: doneRows(
        result,
        item,
        this.ctx.warehouseName(sent.from),
        this.ctx.warehouseName(sent.to),
        this.ctx.i18n.language(),
        tr,
      ),
      item: item.code,
      history: t('transfer.history'),
      more: t('transfer.more'),
    };
  });

  ngOnInit(): void {
    if (!this.ctx.store.result()) {
      void this.ctx.go('', { replaceUrl: true });
      return;
    }
    this.ctx.store.resultShown.set(true);
  }

  protected history(item: string): void {
    void this.ctx.router.navigate(['/inventory'], { queryParams: { item } });
  }

  protected more(): void {
    this.ctx.store.start();
    void this.ctx.go('');
  }
}
