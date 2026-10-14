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
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { stopped } from '../data-access/purchase.models';
import { remainingQty } from '../data-access/receipt.store';
import { injectReceiptContext } from './receipt-context';
import {
  confirmLabel,
  partialDelivery,
  qtyLabel,
  receiveHeading,
  receiveLineCard,
  receiveRows,
  receiveStats,
  receivingRemainder,
  recordLabel,
  reviewMessage,
  stockNote,
} from './receipt-view';

/** "Receive items" for one purchase order: the warehouse and how much of each line arrived. */
@Component({
  selector: 'app-receipt-form',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SelectFieldComponent,
    StatCardComponent,
    StatusChipComponent,
    TextFieldComponent,
    TotalsCardComponent,
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
    @if (!ctx.session.capabilities().receiveGoods) {
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
      @let closed = notReceivable();
      <app-feedback-card
        [tone]="closed ? 'warning' : 'tint'"
        [title]="closed ? txt.notReceivable.title : txt.nothingOpen.title"
        [message]="closed ? txt.notReceivable.message : txt.nothingOpen.message"
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
        [label]="f.remainder ? txt.warehouseRemaining : txt.warehouse"
        [options]="warehouseOptions()"
        [placeholder]="txt.chooseWarehouse"
        [value]="ctx.store.warehouse()"
        (valueChange)="ctx.store.setWarehouse($event)"
      />
      @if (!f.remainder && f.partial) {
        <app-status-chip tone="warning" [label]="txt.partial" />
      }
      @for (line of f.lines; track line.row) {
        @if (!f.remainder) {
          <app-item-card
            [title]="line.card.title"
            [meta]="line.card.meta"
            [detail]="line.card.detail"
          />
        }
        <app-text-field
          [label]="line.label"
          inputmode="decimal"
          [ltr]="true"
          [suffix]="f.remainder ? null : line.uom"
          [error]="line.error"
          [value]="ctx.store.qtyInputs()[line.row] ?? ''"
          (valueChange)="ctx.store.setQty(line.row, $event)"
        />
      }
      @if (f.remainder) {
        <app-feedback-card [title]="txt.reviewTitle" [message]="f.review" />
      } @else {
        <app-stat-card [stats]="f.stats" />
        @if (f.rows.length) {
          <app-totals-card density="compact" [rows]="f.rows" />
        }
        <p class="muted">{{ f.note }}</p>
      }
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
        {{ ctx.store.state() === 'confirming' ? txt.recording : f.action }}
      </button>
      @if (f.remainder) {
        <button type="button" class="md-btn" (click)="ctx.openOrder()">{{ txt.cancel }}</button>
      }
      <p class="muted">{{ txt.reference }}</p>
    }
  `,
})
export class ReceiptFormContainer implements OnInit {
  /** Set when "Check result" found that a timed-out receipt was never recorded. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectReceiptContext();
  protected readonly loadFailed = signal(false);
  private readonly showNotCreated = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('sale.back'),
      warehouse: t('purchase.receive.warehouse'),
      warehouseRemaining: t('purchase.receive.warehouseRemaining'),
      chooseWarehouse: t('purchase.receive.chooseWarehouse'),
      partial: t('purchase.receive.partial'),
      reviewTitle: t('purchase.receive.reviewTitle'),
      recording: t('purchase.receive.recording'),
      cancel: t('purchase.receive.cancel'),
      reload: t('purchase.receive.reload'),
      openOrder: t('purchase.receipt.openOrder'),
      loading: t('purchase.loading'),
      retry: t('purchase.retry'),
      reference: t('purchase.review.reference', { reference: this.ctx.store.reference() }),
      noAccess: block('purchase.receive.noAccess'),
      loadFailed: block('purchase.detail.loadFailed'),
      nothingOpen: block('purchase.receive.nothingOpen'),
      notReceivable: block('purchase.receive.notReceivable'),
      noWarehouses: block('purchase.receive.noWarehouses'),
    };
  });

  protected readonly heading = computed(() => {
    const order = this.ctx.store.order();
    const { t } = this.ctx.i18n.tr();
    return order
      ? receiveHeading(order, this.ctx.i18n.tr())
      : { title: t('purchase.receive.title'), subtitle: this.ctx.store.orderName() ?? '' };
  });

  protected readonly notReceivable = computed(() => {
    const order = this.ctx.store.order();
    return !!order && stopped(order.progress);
  });

  protected readonly warehouseOptions = computed(() =>
    this.ctx.store.warehouses().map((w) => ({ value: w.id, label: w.name })),
  );

  protected readonly form = computed(() => {
    const store = this.ctx.store;
    const order = store.order();
    if (!order) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const lines = store.openLines();
    const quantities = store.quantities();
    const remainder = receivingRemainder(order);
    // Rates and values only for roles that see buying prices (docs/PERMISSIONS.md).
    const currency = this.ctx.session.capabilities().seeCosts ? order.currency : null;
    return {
      remainder,
      partial: partialDelivery(lines, quantities),
      lines: lines.map((l) => {
        const qty = quantities[l.row];
        const valid = Number.isFinite(qty) && qty >= 0 && qty <= remainingQty(l);
        return {
          row: l.row,
          uom: l.uom,
          card: receiveLineCard(l, currency, tr),
          label: qtyLabel(l, remainder, lines.length, tr),
          error: valid ? null : tr.t('purchase.receive.qtyError', { max: remainingQty(l) }),
        };
      }),
      stats: receiveStats(lines, quantities, tr),
      rows: currency === null ? [] : receiveRows(lines, quantities, currency),
      note: stockNote(lines, quantities, tr),
      review: reviewMessage(order, lines, quantities, tr),
      action: remainder ? confirmLabel(lines, quantities, tr) : recordLabel(lines, quantities, tr),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (failure && this.ctx.store.state() === 'failed') {
      return {
        title: t(`purchase.receive.failed.${failure}.title`),
        message: t(`purchase.receive.failed.${failure}.message`),
      };
    }
    return this.showNotCreated()
      ? {
          title: t('purchase.receive.notCreated.title'),
          message: t('purchase.receive.notCreated.message'),
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
