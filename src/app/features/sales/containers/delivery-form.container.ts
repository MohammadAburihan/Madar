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
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { orderOpen } from '../data-access/sales-order.models';
import { injectDeliveryContext } from './delivery-context';
import {
  deliveryHeading,
  deliveryLineCard,
  deliveryQtyError,
  deliveryQtyLabel,
  deliveryReview,
} from './delivery-view';

/** "Deliver order": the warehouse and how much of each line leaves now. */
@Component({
  selector: 'app-delivery-form',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SelectFieldComponent,
    TextFieldComponent,
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
    @if (!ctx.session.capabilities().deliverOrders) {
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
    } @else if (!ctx.store.openLines().length) {
      @let closed = notDeliverable();
      <app-feedback-card
        [tone]="closed ? 'warning' : 'tint'"
        [title]="closed ? txt.notDeliverable.title : txt.nothingOpen.title"
        [message]="closed ? txt.notDeliverable.message : txt.nothingOpen.message"
      />
      <button type="button" class="md-btn md-btn--primary" (click)="ctx.openOrder()">
        {{ txt.openOrder }}
      </button>
    } @else if (!ctx.store.warehouses().length) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noWarehouses.title"
        [message]="txt.noWarehouses.message"
      />
    } @else if (form(); as f) {
      <app-select-field
        [label]="txt.warehouse"
        [options]="warehouseOptions()"
        [placeholder]="txt.chooseWarehouse"
        [value]="ctx.store.warehouse()"
        (valueChange)="ctx.store.setWarehouse($event)"
      />
      @for (line of f.lines; track line.row) {
        <app-item-card
          [title]="line.card.title"
          [meta]="line.card.meta"
          [detail]="line.card.detail"
        />
        <app-text-field
          [label]="line.label"
          inputmode="decimal"
          [ltr]="true"
          [suffix]="line.uom"
          [error]="line.error"
          [value]="ctx.store.qtyInputs()[line.row] ?? ''"
          (valueChange)="ctx.store.setQty(line.row, $event)"
        />
      }
      <app-feedback-card [title]="txt.reviewTitle" [message]="f.review" />
      @if (notice(); as n) {
        <app-feedback-card tone="danger" [title]="n.title" [message]="n.message" />
        @if (ctx.store.failure() === 'changed') {
          <button type="button" class="md-btn" (click)="load()">{{ txt.reload }}</button>
        }
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="!ctx.store.ready()"
        (click)="confirm()"
      >
        {{ ctx.store.state() === 'confirming' ? txt.confirming : txt.confirm }}
      </button>
      <p class="muted">{{ txt.reference }}</p>
    }
  `,
})
export class DeliveryFormContainer implements OnInit {
  /** Set when "Check result" found that a timed-out delivery was never recorded. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectDeliveryContext();
  protected readonly loadFailed = signal(false);
  private readonly showNotCreated = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('sales.quote.back'),
      warehouse: t('sales.deliver.warehouse'),
      chooseWarehouse: t('sales.deliver.chooseWarehouse'),
      reviewTitle: t('sales.deliver.reviewTitle'),
      confirm: t('sales.deliver.confirm'),
      confirming: t('sales.deliver.confirming'),
      reload: t('sales.deliver.reload'),
      openOrder: t('sales.quote.openOrder'),
      loading: t('sales.records.loading'),
      retry: t('sales.records.retry'),
      reference: t('sale.checking.reference', { reference: this.ctx.store.reference() }),
      noAccess: block('sales.deliver.noAccess'),
      loadFailed: block('sales.order.loadFailed'),
      nothingOpen: block('sales.deliver.nothingOpen'),
      notDeliverable: block('sales.deliver.notDeliverable'),
      noWarehouses: block('sales.deliver.noWarehouses'),
    };
  });

  protected readonly heading = computed(() => {
    const order = this.ctx.store.order();
    const tr = this.ctx.i18n.tr();
    return order
      ? deliveryHeading(order, tr)
      : { title: tr.t('sales.deliver.title'), subtitle: this.ctx.store.orderName() ?? '' };
  });

  protected readonly notDeliverable = computed(() => {
    const order = this.ctx.store.order();
    return !!order && !orderOpen(order);
  });

  protected readonly warehouseOptions = computed(() =>
    this.ctx.store.warehouses().map((w) => ({ value: w.id, label: w.name })),
  );

  protected readonly form = computed(() => {
    const store = this.ctx.store;
    if (!store.order()) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const lines = store.openLines();
    const quantities = store.quantities();
    const warehouse = this.ctx.warehouseName(store.warehouse());
    const goodsCount = lines.filter((l) => l.isStock).length;
    return {
      lines: lines.map((l) => {
        const available = store.available(l);
        return {
          row: l.row,
          uom: l.uom,
          card: deliveryLineCard(l, available, quantities[l.row], tr),
          label: deliveryQtyLabel(l, goodsCount, tr),
          error: deliveryQtyError(store.qtyError(l), l, available, warehouse, tr),
        };
      }),
      review: deliveryReview(lines, quantities, warehouse, tr),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (failure && this.ctx.store.state() === 'failed') {
      return {
        title: t(`sales.deliver.failed.${failure}.title`),
        message: t(`sales.deliver.failed.${failure}.message`),
      };
    }
    return this.showNotCreated()
      ? {
          title: t('sales.deliver.notCreated.title'),
          message: t('sales.deliver.notCreated.message'),
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
      // The delivery was posted and shown (here by Back): this visit is a new delivery for the order.
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
      // The order moved on in ERPNext: start a clean task for it so the quantities come from the new state.
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
