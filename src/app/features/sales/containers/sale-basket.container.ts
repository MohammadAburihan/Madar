import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { formatMoney } from '../../../core/format/format';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { LineRemoveComponent } from '../../../shared/ui/line-remove.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { QuantityStepperComponent } from '../../../shared/ui/quantity-stepper.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { basketLineView, stepSubtitle } from './quick-sale-view';
import { injectSaleContext } from './sale-context';

/** Step 3 on mobile. On desktop the workspace already shows the basket, so this redirects there. */
@Component({
  selector: 'app-sale-basket',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    LineRemoveComponent,
    PageHeadingComponent,
    QuantityStepperComponent,
    SelectFieldComponent,
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
    <app-back-link [label]="txt.back" (back)="ctx.go('items')" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (ctx.prefillNotice(); as proposal) {
      <app-feedback-card
        [tone]="proposal.tone"
        [title]="proposal.title"
        [message]="proposal.message"
      />
    }
    @if (draftNotice(); as notice) {
      <app-feedback-card [tone]="notice.tone" [title]="notice.title" [message]="notice.message" />
    }
    <app-select-field
      [label]="txt.stock"
      [options]="supplyOptions()"
      [placeholder]="txt.chooseWarehouse"
      [value]="ctx.store.warehouse()"
      (valueChange)="$event && ctx.store.setWarehouse($event)"
    />
    @for (line of ctx.store.lines(); track line.item.code; let i = $index) {
      @let card = lineCard(i);
      <app-item-card
        [interactive]="true"
        [title]="card.title"
        [meta]="card.meta"
        [detail]="card.detail"
        [kind]="card.kind"
        (selected)="ctx.go('line/' + i)"
      />
      @if (line.item.isStock) {
        <app-quantity-stepper
          [value]="line.qty"
          [label]="stepperLabel(line.item.name)"
          [decreaseLabel]="txt.decrease"
          [increaseLabel]="txt.increase"
          (changed)="setQty(i, $event)"
        />
      }
      <app-line-remove
        [label]="txt.remove"
        [name]="removeName(line.item.name)"
        (remove)="ctx.store.removeLine(i)"
      />
    }
    @if (ctx.store.lines().length) {
      <button
        type="button"
        class="md-btn"
        (click)="ctx.go('line/' + (ctx.store.lines().length - 1))"
      >
        {{ txt.priceOptions }}
      </button>
    }
    <p class="total">{{ txt.total }}</p>
    <p class="muted">{{ txt.note }}</p>
    <button
      type="button"
      class="md-btn md-btn--primary"
      [disabled]="!canContinue()"
      (click)="continue()"
    >
      {{ txt.continue }}
    </button>
    <button
      type="button"
      class="md-btn"
      [disabled]="!ctx.store.lines().length"
      (click)="saveDraft()"
    >
      {{ txt.saveDraft }}
    </button>
  `,
})
export class SaleBasketContainer implements OnInit {
  protected readonly ctx = injectSaleContext();
  protected readonly draftNotice = signal<{
    tone: 'tint' | 'danger';
    title: string;
    message: string;
  } | null>(null);
  protected readonly canContinue = computed(
    () => !!this.ctx.store.warehouse() && this.ctx.store.lines().length > 0,
  );

  protected readonly text = computed(() => {
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    return {
      back: t('sale.back'),
      title: t('sale.basket.title'),
      subtitle: stepSubtitle(3, this.ctx.customerLabel(), tr),
      stock: t('sale.basket.stock'),
      chooseWarehouse: t('sale.items.chooseWarehouse'),
      priceOptions: t('sale.basket.priceOptions'),
      total: t('sale.total', { amount: formatMoney(this.ctx.store.total(), this.ctx.currency()) }),
      note: t('sale.basket.note'),
      continue: t('sale.basket.continue'),
      saveDraft: t('sale.saveDraft'),
      decrease: t('sale.basket.decrease'),
      increase: t('sale.basket.increase'),
      remove: t('taskLines.remove'),
    };
  });

  protected readonly supplyOptions = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return this.ctx.store
      .warehouses()
      .map((w) => ({ value: w.id, label: t('sale.basket.supplyNow', { warehouse: w.name }) }));
  });

  ngOnInit(): void {
    if (!this.ctx.store.hasCustomer()) {
      void this.ctx.go('');
    } else if (this.ctx.desktop()) {
      void this.ctx.go('items', { replaceUrl: true });
    }
  }

  protected lineCard(index: number) {
    const line = this.ctx.store.lines()[index];
    return basketLineView(
      line,
      this.ctx.store.available(line.item),
      this.ctx.currency(),
      this.ctx.i18n.tr(),
    );
  }

  protected stepperLabel(item: string): string {
    return this.ctx.i18n.tr().t('sale.basket.quantity', { item });
  }

  protected removeName(item: string): string {
    return this.ctx.i18n.tr().t('taskLines.removeItem', { item });
  }

  protected setQty(index: number, qty: number): void {
    const line = this.ctx.store.lines()[index];
    if (qty > this.ctx.store.available(line.item)) {
      void this.ctx.go(`stock/${index}`, { queryParams: { qty } });
      return;
    }
    this.ctx.store.setQty(index, qty);
  }

  protected continue(): void {
    const index = this.ctx.store
      .lines()
      .findIndex((line) => line.qty > this.ctx.store.available(line.item));
    void (index >= 0
      ? this.ctx.go(`stock/${index}`, { queryParams: { qty: this.ctx.store.lines()[index].qty } })
      : this.ctx.go('review'));
  }

  protected async saveDraft(): Promise<void> {
    const { t } = this.ctx.i18n.tr();
    try {
      await this.ctx.store.saveDraft();
      this.draftNotice.set({
        tone: 'tint',
        title: t('sale.draft.title'),
        message: t('sale.draft.message'),
      });
    } catch {
      this.draftNotice.set({ tone: 'danger', title: t('sale.draft.failed'), message: '' });
    }
  }
}
