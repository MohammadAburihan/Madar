import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { toIsoDate } from '../../../core/format/format';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { FilterChipsComponent } from '../../../shared/ui/filter-chips.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { CATALOG_LIMIT, ItemsApiService } from '../data-access/items-api.service';
import { CatalogItem, ItemDetail, ItemKind } from '../data-access/items.models';
import { catalogCard, catalogRow, itemView } from './items-view';

const SEARCH_DELAY_MS = 250;

/** Items & services: what the business sells, buys or uses, searchable, with price and stock. */
@Component({
  selector: 'app-catalog',
  imports: [
    DataTableComponent,
    FeedbackCardComponent,
    FilterChipsComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SearchFieldComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': 'desktop()', '[class.tablet]': "viewport() === 'tablet'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    h2 {
      margin: 0;
      color: var(--md-ink);
      font: 600 20px / var(--md-lh) var(--md-font);
    }

    .lines {
      margin: 0;
      color: var(--md-muted);
      font: 400 13px / var(--md-lh) var(--md-font);
      white-space: pre-line;
    }
  `,
  template: `
    @let txt = text();
    @if (desktop()) {
      <app-page-heading layout="desktop" [title]="txt.title" [subtitle]="txt.workspaceSubtitle">
        @if (canAdd()) {
          <button type="button" class="md-btn md-btn--primary" (click)="add()">
            {{ txt.addDesktop }}
          </button>
        }
      </app-page-heading>
    }
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    @if (!desktop()) {
      <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    }
    <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
    <app-filter-chips [label]="txt.title" [options]="txt.kinds" [(value)]="kind" />
    @if (state() === 'loading') {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else if (state() === 'error') {
      <app-feedback-card tone="danger" [title]="txt.error.title" [message]="txt.error.message" />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else if (desktop()) {
      <div class="split">
        <div class="main">
          <app-data-table
            [label]="txt.title"
            [headers]="txt.headers"
            [rows]="rows()"
            [ltrColumns]="[2]"
            [interactive]="true"
            [empty]="term().trim() ? txt.noResults : txt.empty"
            (opened)="selected.set($event)"
          />
          <p class="muted">{{ capped() ? txt.capped : txt.note }}</p>
        </div>
        <section class="panel" [attr.aria-label]="txt.title">
          @if (panel(); as p) {
            <h2>{{ p.title }}</h2>
            <p class="lines">{{ p.subtitle }}</p>
            <app-totals-card density="compact" tone="tint" [rows]="p.prices" />
            @for (s of p.stock; track s.message) {
              <p class="lines">{{ s.title }} · {{ s.message }}</p>
            }
            <p class="lines">{{ p.lines }}</p>
            @if (canAdd()) {
              <button type="button" class="md-btn md-btn--primary" (click)="edit(p.code)">
                {{ p.kind === 'service' ? txt.editService : txt.editItem }}
              </button>
            }
            <button type="button" class="md-btn" (click)="open(p.code)">{{ txt.openItem }}</button>
          } @else if (panelFailed()) {
            <p class="muted">{{ txt.panelFailed }}</p>
          } @else if (items().length) {
            <p class="muted" role="status">{{ txt.loading }}</p>
          }
        </section>
      </div>
    } @else {
      @for (card of cards(); track card.id) {
        <app-item-card
          [interactive]="true"
          [title]="card.title"
          [meta]="card.meta"
          [detail]="card.detail"
          [kind]="card.kind"
          (selected)="open(card.id)"
        />
      } @empty {
        <p class="muted">{{ term().trim() ? txt.noResults : txt.empty }}</p>
      }
      @if (capped()) {
        <p class="muted">{{ txt.capped }}</p>
      }
      @if (canAdd()) {
        <button type="button" class="md-btn md-btn--primary" (click)="add()">
          {{ txt.add }}
        </button>
      }
    }
  `,
})
export class CatalogContainer {
  private readonly api = inject(ItemsApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly canAdd = computed(() => this.session.capabilities().manageItems);
  protected readonly term = signal('');
  protected readonly kind = signal<string>('all');
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly items = signal<CatalogItem[]>([]);
  protected readonly selected = signal<string | null>(null);
  private readonly detail = signal<ItemDetail | null>(null);
  protected readonly panelFailed = signal(false);
  private run = 0;
  private detailRun = 0;

  private readonly currency = computed(() => this.business.active()?.currency ?? '');

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      title: t('items.title'),
      subtitle: t('items.subtitle', { business: this.business.active()?.name ?? '' }),
      workspaceSubtitle: t('items.workspaceSubtitle', {
        business: this.business.active()?.name ?? '',
      }),
      search: t('items.search'),
      placeholder: t('items.placeholder'),
      kinds: (['all', 'product', 'service'] as const).map((k) => ({
        value: k,
        label: t(`items.filters.${k}`),
      })),
      headers: [t('items.headers.name'), t('items.headers.kind'), t('items.headers.price')],
      loading: t('items.loading'),
      empty: t('items.empty'),
      noResults: t('items.noResults'),
      capped: t('items.capped', { count: CATALOG_LIMIT }),
      note: t('items.note'),
      add: t('items.add'),
      addDesktop: t('items.addDesktop'),
      editItem: t('items.editItem'),
      editService: t('items.editService'),
      openItem: t('items.openItem'),
      panelFailed: t('items.panelFailed'),
      retry: t('items.retry'),
      error: { title: t('items.error.title'), message: t('items.error.message') },
    };
  });

  protected readonly cards = computed(() =>
    this.items().map((i) => catalogCard(i, this.currency(), this.i18n.tr())),
  );
  protected readonly rows = computed(() =>
    this.items().map((i) => catalogRow(i, this.currency(), this.i18n.tr())),
  );
  protected readonly capped = computed(() => this.items().length >= CATALOG_LIMIT);

  /** The row picked, else the first; never one the current list doesn't hold. */
  private readonly shownCode = computed(() => {
    const items = this.items();
    const picked = this.selected();
    return items.find((i) => i.code === picked)?.code ?? items[0]?.code ?? null;
  });

  protected readonly panel = computed(() => {
    const detail = this.detail();
    if (!detail || detail.code !== this.shownCode()) {
      return null;
    }
    return {
      ...itemView(detail, this.currency(), this.session.capabilities().seeCosts, this.i18n.tr()),
      code: detail.code,
      kind: detail.kind,
    };
  });

  constructor() {
    effect((onCleanup) => {
      const term = this.term();
      const kind = this.kind();
      const timer = setTimeout(() => untracked(() => void this.load(term, kind)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
    effect(() => {
      const code = this.shownCode();
      if (code && this.desktop()) {
        untracked(() => void this.loadDetail(code));
      }
    });
  }

  protected async load(term = this.term(), kind = this.kind()): Promise<void> {
    const run = ++this.run;
    this.state.set('loading');
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        throw new Error('No active business');
      }
      const today = toIsoDate(this.clock.now());
      const items = await this.api.catalog(term, kind as ItemKind | 'all', business.name, today);
      if (run === this.run) {
        this.items.set(items);
        this.state.set('ready');
      }
    } catch {
      if (run === this.run) {
        this.state.set('error');
      }
    }
  }

  private async loadDetail(code: string): Promise<void> {
    const run = ++this.detailRun;
    this.detail.set(null);
    this.panelFailed.set(false);
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        throw new Error('No active business');
      }
      const today = toIsoDate(this.clock.now());
      const detail = await this.api.detail(code, business.name, today);
      if (run === this.detailRun) {
        this.detail.set(detail);
      }
    } catch {
      if (run === this.detailRun) {
        this.panelFailed.set(true);
      }
    }
  }

  protected add(): void {
    void this.router.navigate(['/catalog/new']);
  }

  protected open(code: string): void {
    void this.router.navigate(['/catalog', code]);
  }

  protected edit(code: string): void {
    void this.router.navigate(['/catalog', code, 'edit']);
  }
}
