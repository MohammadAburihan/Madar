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
import { AS_SOLD } from '../data-access/sales-return.models';
import { injectReturnContext } from './return-context';
import { returnHeading, returnLineCard, returnQtyLabel, returnSummary } from './sales-return-view';

/** "Return from sale": how much of each line comes back, to which warehouse, and why. */
@Component({
  selector: 'app-return-form',
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
    <app-back-link [label]="txt.back" (back)="ctx.openInvoice()" />
    <app-page-heading [title]="heading().title" [subtitle]="heading().subtitle" />
    @if (!ctx.session.capabilities().returnSales) {
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
    } @else if (!ctx.store.source()) {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else if (!ctx.store.source()!.returnable) {
      <app-feedback-card
        tone="warning"
        [title]="txt.notReturnable.title"
        [message]="txt.notReturnable.message"
      />
      <button type="button" class="md-btn md-btn--primary" (click)="ctx.openInvoice()">
        {{ txt.viewSale }}
      </button>
    } @else if (!ctx.store.openLines().length) {
      <app-feedback-card tone="tint" [title]="txt.nothing.title" [message]="txt.nothing.message" />
      <button type="button" class="md-btn md-btn--primary" (click)="ctx.openInvoice()">
        {{ txt.viewSale }}
      </button>
    } @else if (ctx.store.needsWarehouse() && !ctx.store.warehouses().length) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noWarehouses.title"
        [message]="txt.noWarehouses.message"
      />
    } @else if (form(); as f) {
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
      @if (ctx.store.needsWarehouse()) {
        <app-select-field
          [label]="txt.warehouse"
          [options]="warehouseOptions()"
          [placeholder]="txt.chooseWarehouse"
          [value]="ctx.store.warehouse()"
          (valueChange)="ctx.store.setWarehouse($event)"
        />
      }
      <app-text-field
        [label]="txt.reason"
        [value]="ctx.store.reason()"
        (valueChange)="ctx.store.setReason($event)"
      />
      <app-feedback-card [title]="txt.summaryTitle" [message]="f.summary" />
      <p class="muted">{{ txt.noRefund }}</p>
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
export class ReturnFormContainer implements OnInit {
  /** Set when "Check result" found that a timed-out return was never recorded. */
  readonly notCreated = input<string | undefined>();

  protected readonly ctx = injectReturnContext();
  protected readonly loadFailed = signal(false);
  private readonly showNotCreated = signal(false);

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('sales.quote.back'),
      warehouse: t('sales.return.warehouse'),
      chooseWarehouse: t('sales.deliver.chooseWarehouse'),
      reason: t('sales.return.reason'),
      asSold: t('sales.return.asSold'),
      summaryTitle: t('sales.return.summaryTitle'),
      noRefund: t('sales.return.noRefund'),
      confirm: t('sales.return.confirm'),
      confirming: t('sales.return.confirming'),
      reload: t('sales.return.reload'),
      viewSale: t('sales.return.viewSale'),
      loading: t('sales.records.loading'),
      retry: t('sales.records.retry'),
      reference: t('sale.checking.reference', { reference: this.ctx.store.reference() }),
      noAccess: block('sales.return.noAccess'),
      loadFailed: block('sales.return.loadFailed'),
      nothing: block('sales.return.nothing'),
      notReturnable: block('sales.return.notReturnable'),
      noWarehouses: block('sales.deliver.noWarehouses'),
    };
  });

  protected readonly heading = computed(() => {
    const source = this.ctx.store.source();
    const tr = this.ctx.i18n.tr();
    return source
      ? returnHeading(source, tr)
      : { title: tr.t('sales.return.title'), subtitle: this.ctx.store.invoiceName() ?? '' };
  });

  protected readonly warehouseOptions = computed(() => [
    { value: AS_SOLD, label: this.text().asSold },
    ...this.ctx.store.warehouses().map((w) => ({ value: w.id, label: w.name })),
  ]);

  protected readonly form = computed(() => {
    const store = this.ctx.store;
    const source = store.source();
    if (!source) {
      return null;
    }
    const tr = this.ctx.i18n.tr();
    const currency = this.ctx.currency();
    const lines = store.openLines();
    const quantities = store.quantities();
    return {
      lines: lines.map((l) => ({
        row: l.row,
        uom: l.uom,
        card: returnLineCard(l, quantities[l.row], currency, tr),
        label: returnQtyLabel(l, lines.length, tr),
        error: store.qtyOk(l)
          ? null
          : tr.t('sales.return.qtyError', {
              max: new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(
                l.returnable,
              ),
            }),
      })),
      summary: returnSummary(source, lines, quantities, currency, tr),
    };
  });

  protected readonly notice = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const failure = this.ctx.store.failure();
    if (failure && this.ctx.store.state() === 'failed') {
      return {
        title: t(`sales.return.failed.${failure}.title`),
        message: t(`sales.return.failed.${failure}.message`),
      };
    }
    return this.showNotCreated()
      ? {
          title: t('sales.return.notCreated.title'),
          message: t('sales.return.notCreated.message'),
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
      // The return was posted and shown (here by Back): this visit is a new return against the invoice.
      store.start(store.invoiceName() ?? '');
    }
    if (!store.source()) {
      void this.load();
    }
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    const store = this.ctx.store;
    if (store.failure() === 'changed') {
      // Returned elsewhere since: start a clean task so the quantities come from the new state.
      store.start(store.invoiceName() ?? '');
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
