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
import { StockItem } from '../data-access/inventory.models';
import { qtyText } from './inventory-view';
import { injectTransferContext } from './transfer-context';
import { locationOptions } from './transfer-view';

const SEARCH_DELAY_MS = 250;

/** Step 1 of "Move stock": the item, where it moves from and to, and how much. */
@Component({
  selector: 'app-transfer-move',
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
  template: `
    @let txt = text();
    <app-language-switcher
      [language]="ctx.i18n.language()"
      (languageChange)="ctx.i18n.use($event)"
    />
    <app-back-link [label]="txt.back" (back)="ctx.router.navigate(['/inventory'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (ctx.prefillNotice(); as proposal) {
      <app-feedback-card
        [tone]="proposal.tone"
        [title]="proposal.title"
        [message]="proposal.message"
      />
    }
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
    } @else if (loaded() && ctx.store.warehouses().length < 2) {
      <app-feedback-card
        tone="warning"
        [title]="txt.oneWarehouse.title"
        [message]="txt.oneWarehouse.message"
      />
    } @else {
      @if (ctx.store.item(); as item) {
        <app-status-chip [label]="txt.ready" />
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
          [label]="txt.from"
          [options]="fromOptions()"
          [placeholder]="txt.chooseLocation"
          [value]="ctx.store.from()"
          (valueChange)="ctx.store.setFrom($event)"
        />
        <app-select-field
          [label]="txt.to"
          [options]="toOptions()"
          [placeholder]="txt.chooseLocation"
          [value]="ctx.store.to()"
          (valueChange)="ctx.store.setTo($event)"
        />
        <app-text-field
          [label]="txt.qty"
          inputmode="numeric"
          [ltr]="true"
          [suffix]="item.uom"
          [(value)]="ctx.store.qtyInput"
          [error]="qtyError()"
        />
        <p class="note">{{ txt.note }}</p>
        <app-feedback-card [title]="txt.reviewCard.title" [message]="txt.reviewCard.message" />
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
        <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
        @for (item of results(); track item.code) {
          <app-item-card
            [interactive]="true"
            [title]="item.name"
            [meta]="item.code"
            [detail]="resultDetail(item)"
            (selected)="ctx.store.selectItem(item)"
          />
        } @empty {
          @if (!searching()) {
            <p class="muted">{{ txt.noResults }}</p>
          }
        }
      }
    }
  `,
  styles: `
    .note {
      margin: 0;
      padding: 14px;
      border-radius: 10px;
      background: var(--md-tint);
      color: var(--md-ink);
      font: 400 14px / var(--md-lh) var(--md-font);
    }
  `,
})
export class TransferMoveContainer implements OnInit {
  /** Optional deep link from the Inventory page: start with this item. */
  readonly item = input<string | undefined>();

  protected readonly ctx = injectTransferContext();
  protected readonly term = signal('');
  protected readonly results = signal<StockItem[]>([]);
  protected readonly searching = signal(true);
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  private searchRun = 0;

  protected readonly text = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const item = this.ctx.store.item();
    return {
      back: t('sale.back'),
      title: t('transfer.title'),
      subtitle: t('transfer.subtitle'),
      ready: t('transfer.ready'),
      search: t('transfer.search'),
      placeholder: t('transfer.placeholder'),
      noResults: t('transfer.noResults'),
      from: t('transfer.from'),
      to: t('transfer.to'),
      chooseLocation: t('transfer.chooseLocation'),
      qty: t('transfer.qty'),
      note: item
        ? t('transfer.note', { qty: qtyText(this.ctx.store.total(), item.uom, this.ctx.i18n.tr()) })
        : '',
      reviewCard: {
        title: t('transfer.reviewCard.title'),
        message: t('transfer.reviewCard.message'),
      },
      review: t('transfer.review'),
      footnote: t('transfer.footnote'),
      noAccess: { title: t('transfer.noAccess.title'), message: t('transfer.noAccess.message') },
      loadFailed: {
        title: t('transfer.loadFailed.title'),
        message: t('transfer.loadFailed.message'),
      },
      retry: t('transfer.retry'),
      oneWarehouse: {
        title: t('transfer.oneWarehouse.title'),
        message: t('transfer.oneWarehouse.message'),
      },
    };
  });

  protected readonly itemDetail = computed(() => {
    const item = this.ctx.store.item();
    const from = this.ctx.store.from();
    const tr = this.ctx.i18n.tr();
    return item && from
      ? tr.t('transfer.itemDetail', {
          qty: qtyText(item.stock[from] ?? 0, item.uom, tr),
          warehouse: this.ctx.warehouseName(from),
        })
      : null;
  });

  protected readonly fromOptions = computed(() =>
    locationOptions(this.ctx.store.item(), this.ctx.store.warehouses(), 'from', this.ctx.i18n.tr()),
  );

  protected readonly toOptions = computed(() =>
    locationOptions(
      this.ctx.store.item(),
      this.ctx.store.warehouses().filter((w) => w.id !== this.ctx.store.from()),
      'to',
      this.ctx.i18n.tr(),
    ),
  );

  protected readonly qtyError = computed(() => {
    const store = this.ctx.store;
    const tr = this.ctx.i18n.tr();
    if (!store.qtyInput().trim() || store.qtyValid()) {
      return null;
    }
    const qty = store.qty();
    return Number.isInteger(qty) && qty > store.available()
      ? tr.t('transfer.tooMuch', {
          qty: qtyText(store.available(), store.item()?.uom ?? '', tr),
          warehouse: this.ctx.warehouseName(store.from()),
        })
      : tr.t('transfer.invalidQty');
  });

  protected readonly notice = computed(() => {
    const failure = this.ctx.store.failure();
    const { t } = this.ctx.i18n.tr();
    return this.ctx.store.state() === 'failed' && failure
      ? {
          tone: failure === 'offline' ? ('warning' as const) : ('danger' as const),
          title: t(`transfer.failed.${failure}.title`),
          message: t(`transfer.failed.${failure}.message`),
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
    void this.load();
  }

  protected resultDetail(item: StockItem): string {
    const tr = this.ctx.i18n.tr();
    const total = Object.values(item.stock).reduce((sum, qty) => sum + qty, 0);
    return tr.t('inventory.warehouseDetail', { qty: qtyText(total, item.uom, tr) });
  }

  protected changeItem(): void {
    this.ctx.store.item.set(null);
    this.term.set('');
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
        await this.ctx.store.openItem(deepLink);
      }
    } catch {
      // The item search is shown instead; the user picks the item there.
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
