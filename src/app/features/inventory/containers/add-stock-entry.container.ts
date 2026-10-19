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
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { AddStockReason, StockItem, totalStock } from '../data-access/inventory.models';
import { injectAddStockContext } from './add-stock-context';
import { reasonOptions } from './add-stock-view';
import { qtyText } from './inventory-view';

const SEARCH_DELAY_MS = 250;

/** Step 1 of "Add stock": why, where, and the items with how many of each (and their cost, for cost roles). */
@Component({
  selector: 'app-add-stock-entry',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SearchFieldComponent,
    SelectFieldComponent,
    StatusChipComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'ctx.desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    .line {
      display: grid;
      gap: 12px;
      padding-block-end: 12px;
      border-block-end: 1px solid var(--md-line);
    }
  `,
  template: `
    @let txt = text();
    <app-language-switcher
      [language]="ctx.i18n.language()"
      (languageChange)="ctx.i18n.use($event)"
    />
    <app-back-link [label]="txt.back" (back)="ctx.router.navigate(['/inventory'])" />
    <app-page-heading [title]="txt.title" [subtitle]="subtitle()" />
    @if (!ctx.session.capabilities().transferStock) {
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
      <button type="button" class="md-btn" (click)="retry()">{{ txt.retry }}</button>
    } @else {
      <app-status-chip [label]="txt.chip" />
      @if (notice(); as n) {
        <app-feedback-card [tone]="n.tone" [title]="n.title" [message]="n.message" />
      }
      @if (linkMissing()) {
        <app-feedback-card
          tone="warning"
          [title]="txt.linkMissing.title"
          [message]="txt.linkMissing.message"
        />
      }
      <app-select-field
        [label]="txt.reason"
        [options]="reasons()"
        [value]="ctx.store.reason()"
        (valueChange)="setReason($event)"
      />
      <app-select-field
        [label]="txt.location"
        [options]="locations()"
        [placeholder]="txt.chooseLocation"
        [value]="ctx.store.warehouse()"
        (valueChange)="ctx.store.setWarehouse($event)"
      />
      <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
      @for (item of visibleResults(); track item.code) {
        <app-item-card
          [interactive]="true"
          [title]="item.name"
          [meta]="item.code"
          [detail]="resultDetail(item)"
          (selected)="pick(item)"
        />
      } @empty {
        @if (term().trim() && !searching()) {
          <p class="muted">{{ txt.noResults }}</p>
        }
      }
      @for (line of ctx.store.lines(); track line.item.code; let i = $index) {
        <div class="line">
          <app-item-card
            [title]="line.item.name"
            [meta]="line.item.code"
            [detail]="onHand(line.item)"
          />
          <app-text-field
            [label]="txt.qty"
            inputmode="numeric"
            [ltr]="true"
            [suffix]="line.item.uom"
            [value]="line.qtyInput"
            [error]="errors()[i].qty"
            (valueChange)="ctx.store.setLine(line.item.code, { qtyInput: $event })"
          />
          @if (ctx.withCosts()) {
            <app-text-field
              [label]="txt.cost"
              inputmode="decimal"
              [ltr]="true"
              [hint]="txt.costHint"
              [error]="errors()[i].cost"
              [value]="line.costInput"
              (valueChange)="ctx.store.setLine(line.item.code, { costInput: $event })"
            />
          }
          <button type="button" class="md-btn" (click)="ctx.store.removeLine(line.item.code)">
            {{ txt.remove }}
          </button>
        </div>
      }
      @if (effect(); as e) {
        <app-feedback-card tone="warning" [title]="e.title" [message]="e.message" />
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="!ctx.store.ready()"
        (click)="ctx.go('review')"
      >
        {{ txt.review }}
      </button>
      <p class="muted">{{ txt.footnote }}</p>
    }
  `,
})
export class AddStockEntryContainer implements OnInit {
  /** Optional deep link from the Inventory page: start with this item. */
  readonly item = input<string | undefined>();

  protected readonly ctx = injectAddStockContext();
  protected readonly term = signal('');
  protected readonly results = signal<StockItem[]>([]);
  protected readonly searching = signal(false);
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly linkMissing = signal(false);
  private searchRun = 0;

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('sale.back'),
      title: t('addStock.title'),
      chip: t('addStock.chip'),
      reason: t('addStock.reason'),
      location: t('adjust.location'),
      chooseLocation: t('adjust.chooseLocation'),
      search: t('addStock.search'),
      placeholder: t('adjust.placeholder'),
      noResults: t('adjust.noResults'),
      qty: t('addStock.qty'),
      cost: t('addStock.cost'),
      costHint: t('addStock.costHint'),
      remove: t('addStock.remove'),
      review: t('addStock.review'),
      footnote: t('addStock.footnote'),
      retry: t('adjust.retry'),
      noAccess: block('addStock.noAccess'),
      loadFailed: block('adjust.loadFailed'),
      linkMissing: block('adjust.linkMissing'),
    };
  });

  protected readonly subtitle = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const warehouse = this.ctx.store.warehouse();
    return warehouse
      ? `${this.ctx.warehouseName(warehouse)} · ${t(`addStock.reasons.${this.ctx.store.reason()}`)}`
      : t('addStock.subtitle');
  });

  protected readonly reasons = computed(() => reasonOptions(this.ctx.i18n.tr()));
  protected readonly locations = computed(() =>
    this.ctx.store.warehouses().map((w) => ({ value: w.id, label: w.name })),
  );

  /** Results show only while searching, so the lines stay in view. */
  protected readonly visibleResults = computed(() => (this.term().trim() ? this.results() : []));

  /** Per line: the quantity, then the cost, as typed, once something was typed. */
  protected readonly errors = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const parsed = this.ctx.store.parsed();
    return this.ctx.store.lines().map((l, i) => ({
      qty:
        l.qtyInput.trim() && !(Number.isInteger(parsed[i].qty) && parsed[i].qty > 0)
          ? t('adjust.invalidQty')
          : null,
      cost: parsed[i].cost !== null && !(parsed[i].cost! >= 0) ? t('items.form.amountError') : null,
    }));
  });

  protected readonly effect = computed(() => {
    const store = this.ctx.store;
    const warehouse = store.warehouse();
    if (!warehouse || !store.linesValid()) {
      return null;
    }
    const { t, plural } = this.ctx.i18n.tr();
    const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
    return {
      title: t('addStock.effect.title', {
        units: num.format(store.units()),
        warehouse: this.ctx.warehouseName(warehouse),
      }),
      message: plural(`addStock.effect.${store.reason()}`, store.lines().length),
    };
  });

  protected readonly notice = computed(() => {
    const failure = this.ctx.store.failure();
    const { t } = this.ctx.i18n.tr();
    if (this.ctx.store.state() !== 'failed' || !failure) {
      return null;
    }
    const item = this.ctx.store.lines().find((l) => l.item.code === this.ctx.store.failedItem());
    return {
      tone: failure === 'offline' ? ('warning' as const) : ('danger' as const),
      title: t(`addStock.failed.${failure}.title`),
      message: t(`addStock.failed.${failure}.message`, { item: item?.item.name ?? '' }),
    };
  });

  constructor() {
    effect((onCleanup) => {
      const term = this.term();
      if (!this.loaded() || !term.trim()) {
        return;
      }
      const timer = setTimeout(() => untracked(() => this.search(term)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngOnInit(): void {
    const store = this.ctx.store;
    if (store.busy()) {
      void this.ctx.go(store.state() === 'confirming' ? 'review' : 'checking', {
        replaceUrl: true,
      });
      return;
    }
    if (store.state() === 'confirmed') {
      if (!store.resultShown()) {
        void this.ctx.go('done', { replaceUrl: true });
        return;
      }
      store.start();
    }
    void this.load();
  }

  protected resultDetail(item: StockItem): string {
    const tr = this.ctx.i18n.tr();
    return tr.t('inventory.warehouseDetail', { qty: qtyText(totalStock(item), item.uom, tr) });
  }

  protected onHand(item: StockItem): string | null {
    const warehouse = this.ctx.store.warehouse();
    const tr = this.ctx.i18n.tr();
    return warehouse
      ? tr.t('adjust.itemDetail', {
          qty: qtyText(item.stock[warehouse] ?? 0, item.uom, tr),
          warehouse: this.ctx.warehouseName(warehouse),
        })
      : null;
  }

  protected pick(item: StockItem): void {
    this.ctx.store.addItem(item);
    this.term.set('');
  }

  protected setReason(value: string | null): void {
    if (value === 'opening' || value === 'made') {
      this.ctx.store.setReason(value as AddStockReason);
    }
  }

  protected retry(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loadFailed.set(false);
    try {
      await this.ctx.store.loadWarehouses();
    } catch {
      this.loadFailed.set(true);
      return;
    }
    try {
      const deepLink = this.item();
      // Only to start the task: back from Review keeps the lines as they are.
      if (deepLink && !this.ctx.store.lines().length) {
        this.linkMissing.set(!(await this.ctx.store.openItem(deepLink)));
      }
    } catch {
      this.linkMissing.set(true);
    } finally {
      this.loaded.set(true);
    }
  }

  private async search(term: string): Promise<void> {
    const run = ++this.searchRun;
    this.searching.set(true);
    try {
      const results = await this.ctx.store.searchItems(term);
      if (run === this.searchRun) {
        this.results.set(results);
      }
    } catch {
      if (run === this.searchRun) {
        this.results.set([]);
      }
    } finally {
      if (run === this.searchRun) {
        this.searching.set(false);
      }
    }
  }
}
