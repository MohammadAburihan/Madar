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
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { DamageType, StockItem, totalStock } from '../data-access/inventory.models';
import { injectAdjustContext } from './adjust-context';
import { damageTypeOptions, effectCard, locationOptions, writeOffRows } from './adjust-view';
import { qtyText } from './inventory-view';

const SEARCH_DELAY_MS = 250;

/** Step 1 of "Count stock" or "Damage or loss": the item, its location, the quantity and the reason. */
@Component({
  selector: 'app-adjust-entry',
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
      @if (ctx.store.item(); as item) {
        <app-item-card
          [interactive]="true"
          [title]="item.name"
          [meta]="item.code"
          [detail]="itemDetail()"
          (selected)="changeItem()"
        />
        @if (notice(); as n) {
          <app-feedback-card [tone]="n.tone" [title]="n.title" [message]="n.message" />
        }
        <app-select-field
          [label]="txt.location"
          [options]="locations()"
          [placeholder]="txt.chooseLocation"
          [value]="ctx.store.warehouse()"
          (valueChange)="ctx.store.setWarehouse($event)"
        />
        @if (ctx.kind === 'count') {
          <app-totals-card density="compact" [rows]="systemRows()" />
          <app-text-field
            [label]="txt.counted"
            inputmode="numeric"
            [ltr]="true"
            [suffix]="item.uom"
            [(value)]="ctx.store.qtyInput"
            [error]="qtyError()"
          />
          @if (ctx.store.qtyValid()) {
            <app-totals-card density="compact" [rows]="differenceRows()" />
          }
        } @else {
          <app-select-field
            [label]="txt.type"
            [options]="types()"
            [value]="ctx.store.damageType()"
            (valueChange)="setType($event)"
          />
          <app-text-field
            [label]="txt.qty"
            inputmode="numeric"
            [ltr]="true"
            [suffix]="item.uom"
            [(value)]="ctx.store.qtyInput"
            [error]="qtyError()"
          />
        }
        <app-text-field [label]="txt.reason" [(value)]="ctx.store.reason" [error]="reasonError()" />
        @if (writeOff().length) {
          <app-totals-card density="compact" [rows]="writeOff()" />
        }
        @if (effect(); as e) {
          <app-feedback-card [tone]="e.tone" [title]="e.title" [message]="e.message" />
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
      } @else {
        @if (linkMissing()) {
          <app-feedback-card
            tone="warning"
            [title]="txt.linkMissing.title"
            [message]="txt.linkMissing.message"
          />
        }
        <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
        @for (item of results(); track item.code) {
          <app-item-card
            [interactive]="true"
            [title]="item.name"
            [meta]="item.code"
            [detail]="resultDetail(item)"
            (selected)="pick(item)"
          />
        } @empty {
          @if (!searching()) {
            <p class="muted">{{ txt.noResults }}</p>
          }
        }
      }
    }
  `,
})
export class AdjustEntryContainer implements OnInit {
  /** Optional deep links from the Inventory page: start with this item, at this location. */
  readonly item = input<string | undefined>();
  readonly warehouse = input<string | undefined>();

  protected readonly ctx = injectAdjustContext();
  protected readonly term = signal('');
  protected readonly results = signal<StockItem[]>([]);
  protected readonly searching = signal(true);
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  /** The item the link named couldn't be opened (no longer a stock item, or unreadable). */
  protected readonly linkMissing = signal(false);
  private searchRun = 0;

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const k = this.ctx.key;
    return {
      back: t('sale.back'),
      title: t(k('title')),
      chip: t(k('chip')),
      search: t(k('search')),
      placeholder: t('adjust.placeholder'),
      noResults: t('adjust.noResults'),
      location: t('adjust.location'),
      chooseLocation: t('adjust.chooseLocation'),
      counted: t('adjust.count.counted'),
      type: t('adjust.damage.type'),
      qty: t('adjust.damage.qty'),
      reason: t('adjust.reason'),
      review: t(k('review')),
      footnote: t(k('footnote')),
      retry: t('adjust.retry'),
      linkMissing: {
        title: t('adjust.linkMissing.title'),
        message: t('adjust.linkMissing.message'),
      },
      noAccess: { title: t('adjust.noAccess.title'), message: t('adjust.noAccess.message') },
      loadFailed: { title: t('adjust.loadFailed.title'), message: t('adjust.loadFailed.message') },
    };
  });

  protected readonly subtitle = computed(() => {
    const item = this.ctx.store.item();
    const warehouse = this.ctx.warehouse();
    return item && warehouse
      ? `${item.name} · ${warehouse.name}`
      : this.ctx.i18n.tr().t(this.ctx.key('subtitle'));
  });

  protected readonly itemDetail = computed(() => {
    const store = this.ctx.store;
    const item = store.item();
    const warehouse = this.ctx.warehouse();
    const tr = this.ctx.i18n.tr();
    return item && warehouse
      ? tr.t('adjust.itemDetail', {
          qty: qtyText(store.onHand(), item.uom, tr),
          warehouse: warehouse.name,
        })
      : null;
  });

  protected readonly locations = computed(() =>
    locationOptions(this.ctx.store.item(), this.ctx.store.warehouses(), this.ctx.i18n.tr()),
  );
  protected readonly types = computed(() => damageTypeOptions(this.ctx.i18n.tr()));

  protected readonly systemRows = computed(() => {
    const tr = this.ctx.i18n.tr();
    const item = this.ctx.store.item();
    return item
      ? [
          {
            label: tr.t('adjust.count.system'),
            value: qtyText(this.ctx.store.onHand(), item.uom, tr),
          },
        ]
      : [];
  });

  protected readonly differenceRows = computed(() => {
    const tr = this.ctx.i18n.tr();
    const item = this.ctx.store.item();
    const change = this.ctx.store.change();
    const qty = qtyText(Math.abs(change), item?.uom ?? '', tr);
    return [
      {
        label: tr.t('adjust.count.difference'),
        value: change > 0 ? `+${qty}` : change < 0 ? `−${qty}` : qty,
        accent: change !== 0,
      },
    ];
  });

  protected readonly writeOff = computed(() => {
    const store = this.ctx.store;
    const item = store.item();
    const warehouse = this.ctx.warehouse();
    return this.ctx.kind === 'damage' && item && warehouse && store.qtyValid()
      ? writeOffRows(item, warehouse, store.change(), this.ctx.i18n.tr())
      : [];
  });

  protected readonly effect = computed(() => {
    const store = this.ctx.store;
    const item = store.item();
    const warehouse = this.ctx.warehouse();
    if (!item || !warehouse || !store.qtyValid()) {
      return null;
    }
    return effectCard(this.ctx.kind, item, warehouse, store.change(), this.ctx.i18n.tr());
  });

  protected readonly qtyError = computed(() => {
    const store = this.ctx.store;
    const tr = this.ctx.i18n.tr();
    if (!store.qtyInput().trim() || store.qtyValid()) {
      return null;
    }
    if (this.ctx.kind === 'count') {
      return tr.t('adjust.count.invalidQty');
    }
    const qty = store.qty();
    return Number.isInteger(qty) && qty > store.onHand()
      ? tr.t('adjust.damage.tooMuch', {
          qty: qtyText(store.onHand(), store.item()?.uom ?? '', tr),
          warehouse: this.ctx.warehouse()?.name ?? '',
        })
      : tr.t('adjust.invalidQty');
  });

  /** Shown once a quantity is typed, so an untouched form doesn't open with an error. */
  protected readonly reasonError = computed(() =>
    this.ctx.store.qtyValid() && !this.ctx.store.reason().trim()
      ? this.ctx.i18n.tr().t('adjust.reasonRequired')
      : null,
  );

  protected readonly notice = computed(() => {
    const failure = this.ctx.store.failure();
    const { t } = this.ctx.i18n.tr();
    return this.ctx.store.state() === 'failed' && failure
      ? {
          tone:
            failure === 'offline' || failure === 'moved'
              ? ('warning' as const)
              : ('danger' as const),
          title: t(`adjust.failed.${failure}.title`),
          message: t(`adjust.failed.${failure}.message`),
        }
      : null;
  });

  constructor() {
    effect((onCleanup) => {
      const term = this.term();
      if (!this.loaded()) {
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
    if (this.ctx.kind === 'count' && !store.item() && !store.reason()) {
      store.reason.set(this.ctx.i18n.tr().t('adjust.count.defaultReason'));
    }
    void this.load();
  }

  protected resultDetail(item: StockItem): string {
    const tr = this.ctx.i18n.tr();
    return tr.t('inventory.warehouseDetail', { qty: qtyText(totalStock(item), item.uom, tr) });
  }

  protected pick(item: StockItem): void {
    this.ctx.store.selectItem(item, this.warehouse());
  }

  protected changeItem(): void {
    this.ctx.store.item.set(null);
    this.term.set('');
  }

  protected setType(value: string | null): void {
    if (value) {
      this.ctx.store.damageType.set(value as DamageType);
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
      // Only to start the task: back from Review keeps an item the user has since changed.
      if (deepLink && !this.ctx.store.item()) {
        await this.ctx.store.openItem(deepLink, this.warehouse());
        this.linkMissing.set(!this.ctx.store.item());
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
