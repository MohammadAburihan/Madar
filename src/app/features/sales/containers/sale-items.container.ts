import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { formatMoney } from '../../../core/format/format';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { FilterChipsComponent } from '../../../shared/ui/filter-chips.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { LineRemoveComponent } from '../../../shared/ui/line-remove.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { CatalogTableComponent } from '../components/catalog-table.component';
import { CatalogFilter } from '../data-access/sales-api.service';
import { CatalogItem } from '../data-access/sale.models';
import { basketSummary, catalogItemView, panelLineView, stepSubtitle } from './quick-sale-view';
import { injectSaleContext } from './sale-context';

const SEARCH_DELAY_MS = 250;

/** Step 2 on mobile ("Add items"); the whole workspace (catalog plus "Your sale") on desktop. */
@Component({
  selector: 'app-sale-items',
  imports: [
    BackLinkComponent,
    CatalogTableComponent,
    FeedbackCardComponent,
    FilterChipsComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    LineRemoveComponent,
    PageHeadingComponent,
    SearchFieldComponent,
    SelectFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': 'ctx.desktop()', '[class.tablet]': "ctx.viewport() === 'tablet'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    @if (ctx.desktop()) {
      <app-page-heading
        layout="desktop"
        [title]="txt.workspaceTitle"
        [subtitle]="txt.workspaceSubtitle"
      >
        <button
          type="button"
          class="md-btn"
          [disabled]="!ctx.store.lines().length"
          (click)="saveDraft()"
        >
          {{ txt.saveDraft }}
        </button>
      </app-page-heading>
      <app-language-switcher
        [language]="ctx.i18n.language()"
        (languageChange)="ctx.i18n.use($event)"
      />
      @if (ctx.projectLine(); as project) {
        <p class="muted">{{ project }}</p>
      }
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
      <div class="split">
        <div class="main">
          <app-search-field
            [label]="txt.search"
            [placeholder]="txt.placeholder"
            [(value)]="term"
            (submitted)="addFirst()"
            (arrowDown)="catalog()?.focusRow(0)"
          />
          <app-filter-chips
            [label]="txt.filters"
            [options]="txt.filterOptions"
            [(value)]="filter"
          />
          <app-catalog-table
            [label]="txt.workspaceTitle"
            [headers]="txt.headers"
            [rows]="rows()"
            [empty]="emptyText()"
            (added)="addCode($event)"
          />
          <p class="muted">{{ txt.hint }}</p>
          @if (!ctx.store.project()) {
            <button
              type="button"
              class="md-btn"
              (click)="ctx.go('customer/new', { queryParams: { return: 'items' } })"
            >
              {{ txt.addCustomer }}
            </button>
          }
        </div>
        <section class="panel" [attr.aria-label]="txt.panelHeading">
          <h2>{{ txt.panelHeading }}</h2>
          <app-select-field
            [label]="txt.warehouse"
            [options]="supplyOptions()"
            [placeholder]="txt.chooseWarehouse"
            [value]="ctx.store.warehouse()"
            (valueChange)="chooseWarehouse($event)"
          />
          @for (line of ctx.store.lines(); track line.item.code; let i = $index) {
            @let card = panelLine(i);
            <app-item-card
              [interactive]="true"
              [title]="card.title"
              [meta]="card.meta"
              [detail]="card.detail"
              [kind]="card.kind"
              (selected)="ctx.go('line/' + i)"
            />
            <app-line-remove
              [label]="txt.remove"
              [name]="removeName(line.item.name)"
              (remove)="ctx.store.removeLine(i)"
            />
          } @empty {
            <p class="muted">{{ txt.panelEmpty }}</p>
          }
          <p class="total">{{ txt.total }}</p>
          <button
            type="button"
            class="md-btn md-btn--primary"
            [disabled]="!canReview()"
            (click)="review()"
          >
            {{ txt.review }}
          </button>
        </section>
      </div>
    } @else {
      <app-language-switcher
        [language]="ctx.i18n.language()"
        (languageChange)="ctx.i18n.use($event)"
      />
      <app-back-link [label]="txt.back" (back)="back()" />
      <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
      @if (ctx.projectLine(); as project) {
        <p class="muted">{{ project }}</p>
      }
      <app-search-field
        [label]="txt.search"
        [placeholder]="txt.placeholder"
        [(value)]="term"
        (submitted)="addFirst()"
      />
      <app-select-field
        [label]="txt.warehouse"
        [options]="warehouseOptions()"
        [placeholder]="txt.chooseWarehouse"
        [value]="ctx.store.warehouse()"
        (valueChange)="chooseWarehouse($event)"
      />
      @if (!ctx.store.warehouse()) {
        <p class="muted">{{ txt.warehouseFirst }}</p>
      }
      @for (item of results(); track item.code) {
        @let card = itemCard(item);
        <app-item-card
          [title]="card.title"
          [meta]="card.meta"
          [detail]="card.detail"
          [kind]="card.kind"
        />
        <button
          type="button"
          class="md-btn"
          [disabled]="!ctx.store.warehouse()"
          (click)="add(item)"
        >
          {{ addLabel(item) }}
        </button>
      } @empty {
        <p class="muted">{{ emptyText() }}</p>
      }
      @if (ctx.store.lines().length) {
        @let summary = basket();
        <app-feedback-card [title]="summary.title" [message]="summary.message" />
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="!canReview()"
        (click)="ctx.go('basket')"
      >
        {{ txt.reviewBasket }}
      </button>
    }
  `,
})
export class SaleItemsContainer implements OnInit {
  protected readonly ctx = injectSaleContext();
  protected readonly term = signal('');
  protected readonly filter = signal<string>('all');
  protected readonly results = signal<CatalogItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly draftNotice = signal<{
    tone: 'tint' | 'danger';
    title: string;
    message: string;
  } | null>(null);
  protected readonly catalog = viewChild(CatalogTableComponent);
  private searchRun = 0;

  protected readonly canReview = computed(
    () => !!this.ctx.store.warehouse() && this.ctx.store.lines().length > 0,
  );

  protected readonly text = computed(() => {
    const tr = this.ctx.i18n.tr();
    const { t } = tr;
    const total = formatMoney(this.ctx.store.total(), this.ctx.currency());
    const warehouse = this.ctx.store.warehouseName();
    return {
      back: t('sale.back'),
      title: t('sale.items.title'),
      subtitle: stepSubtitle(2, this.ctx.customerLabel(), tr),
      workspaceTitle: t('sale.customer.title'),
      workspaceSubtitle: warehouse
        ? t('sale.workspace.subtitleWarehouse', {
            customer: this.ctx.customerLabel(),
            business: this.ctx.businessName(),
            warehouse,
          })
        : t('sale.workspace.subtitle', {
            customer: this.ctx.customerLabel(),
            business: this.ctx.businessName(),
          }),
      saveDraft: t('sale.saveDraft'),
      search: t('sale.items.search'),
      placeholder: t('sale.items.placeholder'),
      warehouse: t('sale.items.warehouse'),
      chooseWarehouse: t('sale.items.chooseWarehouse'),
      warehouseFirst: t('sale.items.warehouseFirst'),
      reviewBasket: t('sale.items.review', { amount: total }),
      filters: t('sale.workspace.filters'),
      filterOptions: [
        { value: 'all', label: t('sale.workspace.all') },
        { value: 'products', label: t('sale.workspace.products') },
        { value: 'services', label: t('sale.workspace.services') },
      ],
      headers: {
        item: t('sale.workspace.item'),
        availability: t('sale.workspace.availability'),
        price: t('sale.workspace.price'),
      },
      hint: t('sale.workspace.hint'),
      addCustomer: t('sale.customer.add'),
      panelHeading: t('sale.basket.title'),
      remove: t('taskLines.remove'),
      panelEmpty: t('sale.workspace.panelEmpty'),
      total: t('sale.total', { amount: total }),
      review: t('sale.workspace.review'),
    };
  });

  protected readonly warehouseOptions = computed(() =>
    this.ctx.store.warehouses().map((w) => ({ value: w.id, label: w.name })),
  );

  protected readonly supplyOptions = computed(() => {
    const { t } = this.ctx.i18n.tr();
    return this.ctx.store
      .warehouses()
      .map((w) => ({ value: w.id, label: t('sale.basket.supplyNow', { warehouse: w.name }) }));
  });

  protected readonly rows = computed(() => {
    const { t } = this.ctx.i18n.tr();
    const warehouse = this.ctx.store.warehouseName();
    return this.results().map((item) => ({
      code: item.code,
      title: `${item.name} · ${item.code}`,
      availability: item.isStock
        ? t('sale.workspace.availabilityValue', {
            count: this.ctx.store.available(item),
            warehouse: warehouse ?? '—',
          })
        : t('sale.workspace.service'),
      price: formatMoney(item.price, this.ctx.currency()),
    }));
  });

  protected readonly emptyText = computed(() => {
    const { t } = this.ctx.i18n.tr();
    if (this.loading()) {
      return t('sale.items.loading');
    }
    return this.term().trim()
      ? t('sale.items.noResults', { term: this.term().trim() })
      : t('sale.items.empty');
  });

  protected readonly basket = computed(() =>
    basketSummary(
      this.ctx.store.lines(),
      this.ctx.store.total(),
      this.ctx.currency(),
      this.ctx.i18n.tr(),
    ),
  );

  constructor() {
    effect((onCleanup) => {
      const term = this.term();
      const filter = this.filter() as CatalogFilter;
      // Re-run once warehouses arrive so availability covers them.
      this.ctx.store.warehouses();
      const timer = setTimeout(() => untracked(() => this.search(term, filter)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngOnInit(): void {
    if (!this.ctx.store.hasCustomer()) {
      void this.ctx.go('');
      return;
    }
    if (!this.ctx.store.warehouses().length) {
      void this.ctx.store.loadOptions().catch(() => undefined);
    }
  }

  protected back(): void {
    const project = this.ctx.store.project();
    if (project && !this.ctx.store.lines().length) {
      this.ctx.store.start();
    }
    void (project ? this.ctx.router.navigate(['/projects', project.id]) : this.ctx.go(''));
  }

  protected itemCard(item: CatalogItem) {
    return catalogItemView(
      item,
      this.ctx.store.available(item),
      this.ctx.currency(),
      this.ctx.i18n.tr(),
    );
  }

  protected panelLine(index: number) {
    return panelLineView(this.ctx.store.lines()[index], this.ctx.currency(), this.ctx.i18n.tr());
  }

  protected removeName(item: string): string {
    return this.ctx.i18n.tr().t('taskLines.removeItem', { item });
  }

  protected addLabel(item: CatalogItem): string {
    return this.ctx.i18n.tr().t('sale.items.add', { item: item.name });
  }

  protected chooseWarehouse(id: string | null): void {
    if (id) {
      this.ctx.store.setWarehouse(id);
    }
  }

  protected addCode(code: string): void {
    const item = this.results().find((i) => i.code === code);
    if (item) {
      this.add(item);
    }
  }

  protected addFirst(): void {
    const [first] = this.results();
    if (first && (this.ctx.store.warehouse() || !first.isStock)) {
      this.add(first);
    }
  }

  protected add(item: CatalogItem): void {
    if (item.isStock && !this.ctx.store.warehouse()) {
      return;
    }
    this.ctx.store.add(item);
    const index = this.ctx.store.lines().findIndex((line) => line.item.code === item.code);
    const line = this.ctx.store.lines()[index];
    if (line.qty > this.ctx.store.available(item)) {
      void this.ctx.go(`stock/${index}`, { queryParams: { qty: line.qty } });
    }
  }

  protected review(): void {
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

  private async search(term: string, filter: CatalogFilter): Promise<void> {
    const run = ++this.searchRun;
    this.loading.set(true);
    try {
      const results = await this.ctx.store.searchItems(term, filter);
      if (run === this.searchRun) {
        this.results.set(results);
      }
    } catch {
      if (run === this.searchRun) {
        this.results.set([]);
      }
    } finally {
      if (run === this.searchRun) {
        this.loading.set(false);
      }
    }
  }
}
