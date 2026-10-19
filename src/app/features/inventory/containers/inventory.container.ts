import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { toIsoDate } from '../../../core/format/format';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { HistoryListComponent } from '../../../shared/ui/history-list.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { InventoryApiService } from '../data-access/inventory-api.service';
import { InventoryOverview, Movement, StockItem } from '../data-access/inventory.models';
import {
  itemRow,
  movementEntry,
  movementRow,
  qtyText,
  stockedWarehouses,
  warehouseCard,
} from './inventory-view';

/** Inventory: balances per item and warehouse, an item's movement history, and the stock tasks. */
@Component({
  selector: 'app-inventory',
  imports: [
    DataTableComponent,
    FeedbackCardComponent,
    HistoryListComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SearchFieldComponent,
    StatCardComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': 'desktop()', '[class.tablet]': "viewport() === 'tablet'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    h2 {
      margin: 0;
      color: var(--md-ink);
      font: 600 17px / var(--md-lh) var(--md-font);
    }

    :host(.desktop) h2 {
      font-size: 22px;
    }

    .actions {
      display: flex;
      flex: none;
      flex-direction: column;
      gap: 16px;
      inline-size: 320px;
    }

    :host(.tablet) .actions {
      inline-size: 240px;
    }
  `,
  template: `
    @let txt = text();
    @if (desktop()) {
      <app-page-heading
        layout="desktop"
        [title]="txt.titleDesktop"
        [subtitle]="txt.subtitleDesktop"
      >
        @if (caps().transferStock) {
          <button type="button" class="md-btn md-btn--primary" (click)="move()">
            {{ txt.transfer }}
          </button>
        }
      </app-page-heading>
      <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
      <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
      @if (state() === 'loading') {
        <p class="muted" role="status">{{ txt.loading }}</p>
      } @else if (state() === 'error') {
        <app-feedback-card tone="danger" [title]="txt.error.title" [message]="txt.error.message" />
      } @else {
        <app-data-table
          [label]="txt.titleDesktop"
          [headers]="tableHeaders()"
          [rows]="rows()"
          [interactive]="true"
          [empty]="emptyText()"
          (opened)="selectedCode.set($event)"
        />
        <div class="split">
          @if (stockActions().length) {
            <div class="actions">
              @for (action of stockActions(); track action.id) {
                <button type="button" class="md-btn" (click)="open(action.id)">
                  {{ action.label }}
                </button>
              }
            </div>
          }
          @if (selected(); as item) {
            <div class="main">
              <h2>{{ historyTitle() }}</h2>
              @if (history() !== null) {
                <app-data-table
                  [label]="historyTitle()"
                  [headers]="txt.historyHeaders"
                  [rows]="historyRows()"
                  [empty]="txt.noHistory"
                />
              }
            </div>
          }
        </div>
      }
    } @else {
      <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
      <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
      <app-status-chip [label]="txt.current" />
      @if (state() === 'loading') {
        <p class="muted" role="status">{{ txt.loading }}</p>
      } @else if (state() === 'error') {
        <app-feedback-card tone="danger" [title]="txt.error.title" [message]="txt.error.message" />
      } @else {
        <app-stat-card [stats]="stats()" />
        <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
        @if (term().trim()) {
          @for (item of matching(); track item.code) {
            <app-item-card
              [interactive]="true"
              [title]="item.name"
              [meta]="item.code"
              [detail]="totalDetail(item)"
              (selected)="pick(item.code)"
            />
          } @empty {
            <p class="muted">{{ txt.noResults }}</p>
          }
        } @else if (selected(); as item) {
          <h2>{{ itemHeading() }}</h2>
          @for (card of warehouseCards(); track card.title) {
            <app-item-card [title]="card.title" [meta]="card.meta" [detail]="card.detail" />
          }
          @if (history() !== null) {
            <h2>{{ txt.historyHeading }}</h2>
            <app-history-list
              [label]="txt.historyHeading"
              [entries]="historyEntries()"
              [empty]="txt.noHistory"
            />
          }
        } @else {
          <p class="muted">{{ txt.empty }}</p>
        }
        @if (caps().transferStock) {
          <button type="button" class="md-btn md-btn--primary" (click)="move()">
            {{ txt.move }}
          </button>
        }
        @for (action of stockActions(); track action.id) {
          <button type="button" class="md-btn" (click)="open(action.id)">
            {{ action.label }}
          </button>
        }
      }
    }
  `,
})
export class InventoryContainer implements OnInit {
  /** Optional deep link, e.g. from "View movement history": show this item. */
  readonly item = input<string | undefined>();

  private readonly api = inject(InventoryApiService);
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly term = signal('');
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly selectedCode = signal<string | null>(null);
  /** The selected item's movements; null when the role can't read the stock ledger. */
  protected readonly history = signal<Movement[] | null>(null);
  private readonly overview = signal<InventoryOverview | null>(null);
  private historyRun = 0;

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly caps = this.session.capabilities;

  private readonly items = computed(() => this.overview()?.items ?? []);
  private readonly warehouses = computed(() => this.overview()?.warehouses ?? []);
  protected readonly matching = computed(() => {
    const query = this.term().trim().toLowerCase();
    return this.items().filter(
      (i) => !query || i.name.toLowerCase().includes(query) || i.code.toLowerCase().includes(query),
    );
  });
  protected readonly selected = computed(
    () =>
      this.items().find((i) => i.code === this.selectedCode()) ??
      (this.selectedCode() ? null : (this.items()[0] ?? null)),
  );
  private readonly columns = computed(() => stockedWarehouses(this.items(), this.warehouses()));

  protected readonly text = computed(() => {
    const tr = this.i18n.tr();
    const { t } = tr;
    const business = this.business.active()?.name ?? '';
    return {
      title: t('inventory.title'),
      subtitle: tr.plural('inventory.subtitle', this.warehouses().length),
      titleDesktop: t('inventory.titleDesktop'),
      subtitleDesktop: t('inventory.subtitleDesktop', { business }),
      current: t('inventory.current'),
      search: t('inventory.search'),
      placeholder: t('inventory.placeholder'),
      historyHeading: t('inventory.historyHeading'),
      historyHeaders: [
        t('inventory.headers.event'),
        t('inventory.headers.quantity'),
        t('inventory.headers.warehouse'),
      ],
      transfer: t('inventory.actions.transfer'),
      move: t('inventory.actions.move'),
      empty: t('inventory.empty'),
      noResults: t('inventory.noResults'),
      noHistory: t('inventory.noHistory'),
      loading: t('inventory.loading'),
      error: { title: t('inventory.error.title'), message: t('inventory.error.message') },
    };
  });

  protected readonly stats = computed(() => {
    const { t } = this.i18n.tr();
    const moves = this.overview()?.movesToday;
    return [
      { label: t('inventory.locations'), value: String(this.warehouses().length) },
      ...(moves === null || moves === undefined
        ? []
        : [{ label: t('inventory.movesToday'), value: String(moves) }]),
    ];
  });

  protected readonly tableHeaders = computed(() => {
    const { t } = this.i18n.tr();
    return [
      t('inventory.headers.item'),
      ...this.columns().map((w) => w.name),
      t('inventory.headers.status'),
    ];
  });

  protected readonly rows = computed(() =>
    this.matching().map((item) => itemRow(item, this.columns(), this.i18n.tr())),
  );

  protected readonly emptyText = computed(() => {
    const { t } = this.i18n.tr();
    return this.term().trim() ? t('inventory.noResults') : t('inventory.empty');
  });

  protected readonly itemHeading = computed(() => {
    const item = this.selected();
    return item
      ? this.i18n.tr().t('inventory.itemHeading', { item: item.name, code: item.code })
      : '';
  });

  protected readonly historyTitle = computed(() => {
    const item = this.selected();
    return item ? this.i18n.tr().t('inventory.historyDesktop', { item: item.name }) : '';
  });

  protected readonly warehouseCards = computed(() => {
    const item = this.selected();
    if (!item) {
      return [];
    }
    const held = this.warehouses().filter((w) => (item.stock[w.id] ?? 0) !== 0);
    return (held.length ? held : this.warehouses().slice(0, 1)).map((w) =>
      warehouseCard(item, w, this.i18n.tr()),
    );
  });

  protected readonly historyEntries = computed(() => {
    const item = this.selected();
    return item
      ? (this.history() ?? []).map((m) =>
          movementEntry(
            m,
            item,
            this.warehouses(),
            this.clock.now(),
            this.i18n.language(),
            this.i18n.tr(),
          ),
        )
      : [];
  });

  protected readonly historyRows = computed(() => {
    const item = this.selected();
    return item
      ? (this.history() ?? []).map((m) => movementRow(m, item, this.warehouses(), this.i18n.tr()))
      : [];
  });

  /** Stock tasks beyond moving; they open their own screens as those workflows arrive. */
  protected readonly stockActions = computed(() => {
    const { t } = this.i18n.tr();
    const catalog = { id: 'catalog', label: t('inventory.actions.catalog') };
    if (!this.caps().transferStock) {
      return [catalog];
    }
    return [
      { id: 'countStock', label: t('inventory.actions.count') },
      { id: 'recordDamage', label: t('inventory.actions.damage') },
      ...(this.caps().supplyProjects
        ? [{ id: 'supplyProject', label: t('inventory.actions.supply') }]
        : []),
      catalog,
    ];
  });

  constructor() {
    effect(() => {
      const item = this.selected();
      untracked(() => void this.loadHistory(item));
    });
  }

  ngOnInit(): void {
    this.selectedCode.set(this.item() ?? null);
    void this.load();
  }

  protected totalDetail(item: StockItem): string {
    const tr = this.i18n.tr();
    const total = Object.values(item.stock).reduce((sum, qty) => sum + qty, 0);
    return tr.t('inventory.warehouseDetail', { qty: qtyText(total, item.uom, tr) });
  }

  protected pick(code: string): void {
    this.selectedCode.set(code);
    this.term.set('');
  }

  protected move(): void {
    const item = this.selected();
    void this.router.navigate(['/inventory/transfer'], {
      queryParams: item ? { item: item.code } : {},
    });
  }

  protected open(action: string): void {
    if (action === 'catalog') {
      void this.router.navigate(['/catalog']);
      return;
    }
    if (action === 'supplyProject') {
      // A project is supplied item by item from its page.
      void this.router.navigate(['/projects']);
      return;
    }
    const item = this.selected();
    void this.router.navigate(['/inventory', action === 'countStock' ? 'count' : 'damage'], {
      queryParams: item ? { item: item.code } : {},
    });
  }

  private async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        this.state.set('error');
        return;
      }
      this.overview.set(await this.api.overview(business.name, toIsoDate(this.clock.now())));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  private async loadHistory(item: StockItem | null): Promise<void> {
    const run = ++this.historyRun;
    this.history.set(null);
    if (!item) {
      return;
    }
    try {
      const movements = await this.api.history(
        item.code,
        this.warehouses().map((w) => w.id),
      );
      if (run === this.historyRun) {
        this.history.set(movements);
      }
    } catch {
      if (run === this.historyRun) {
        this.history.set(null);
      }
    }
  }
}
