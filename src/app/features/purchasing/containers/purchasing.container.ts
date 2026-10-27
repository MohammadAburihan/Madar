import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
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
import { PagedList } from '../../../core/util/paged-list';
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { LoadMoreComponent } from '../../../shared/ui/load-more.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { PurchaseApiService } from '../data-access/purchase-api.service';
import { OrderInvoice, OrderSummary, PurchasingOverview } from '../data-access/purchase.models';
import { SupplierInvoiceApiService } from '../data-access/supplier-invoice-api.service';
import { panelInvoiceRows } from './invoice-view';
import { orderCard, orderPanel, orderRow, progressChip, workspaceStats } from './purchase-view';

/** Purchases: the orders with where each stands, the key figures, and a new order. */
@Component({
  selector: 'app-purchasing',
  imports: [
    DataTableComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    LoadMoreComponent,
    PageHeadingComponent,
    SearchFieldComponent,
    StatCardComponent,
    StatusChipComponent,
    TotalsCardComponent,
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

    :host(.desktop) .main h2 {
      font-size: 20px;
    }

    .panel .sub {
      margin: -8px 0 0;
      color: var(--md-muted);
      font: 400 15px / var(--md-lh) var(--md-font);
    }
  `,
  template: `
    @let txt = text();
    @if (desktop()) {
      <app-page-heading
        layout="desktop"
        [title]="txt.workspaceTitle"
        [subtitle]="txt.workspaceSubtitle"
      >
        @if (caps().orderPurchases) {
          <button type="button" class="md-btn md-btn--primary" (click)="newOrder()">
            {{ txt.newOrder }}
          </button>
        }
      </app-page-heading>
    }
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    @if (!desktop()) {
      <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    }
    @if (state() === 'loading') {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else if (state() === 'error') {
      <app-feedback-card tone="danger" [title]="txt.error.title" [message]="txt.error.message" />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else {
      <app-stat-card [stats]="stats()" />
      @if (desktop()) {
        <div class="split">
          <div class="main">
            <h2>{{ txt.ordersHeading }}</h2>
            <app-search-field
              [label]="txt.search"
              [placeholder]="txt.searchOrders"
              [(value)]="term"
            />
            <app-data-table
              [label]="txt.ordersHeading"
              [headers]="txt.headers"
              [rows]="rows()"
              [interactive]="true"
              [empty]="emptyText()"
              [ltrColumns]="[3]"
              (opened)="selected.set($event)"
            />
            <app-load-more
              [hasMore]="list.hasMore()"
              [loading]="list.loadingMore()"
              [failed]="list.moreFailed()"
              (more)="list.loadMore()"
            />
          </div>
          <section class="panel" [attr.aria-label]="txt.ordersHeading">
            @if (selectedOrder(); as order) {
              <h2>{{ order.name }}</h2>
              <p class="sub">{{ order.supplierName }}</p>
              @let chip = selectedChip()!;
              <app-status-chip [label]="chip.label" [tone]="chip.tone" />
              <app-totals-card density="compact" [rows]="panelRows()" />
              @if (panelInvoices().length) {
                <app-totals-card density="compact" [rows]="invoiceRows()" />
              }
              <button type="button" class="md-btn md-btn--primary" (click)="open(order.name)">
                {{ txt.openOrder }}
              </button>
              @if (panelInvoices().length) {
                <button type="button" class="md-btn" (click)="openInvoice(panelInvoices()[0].name)">
                  {{ txt.openInvoice }}
                </button>
              }
            } @else {
              <p class="muted">{{ txt.choose }}</p>
            }
          </section>
        </div>
      } @else {
        @if (caps().orderPurchases) {
          <button type="button" class="md-btn md-btn--primary" (click)="newOrder()">
            {{ txt.newOrder }}
          </button>
        }
        <app-search-field [label]="txt.search" [placeholder]="txt.searchOrders" [(value)]="term" />
        @for (card of cards(); track card.id) {
          <app-item-card
            [interactive]="true"
            [title]="card.view.title"
            [meta]="card.view.meta"
            [detail]="card.view.detail"
            (selected)="open(card.id)"
          />
        } @empty {
          <p class="muted">{{ emptyText() }}</p>
        }
        <app-load-more
          [hasMore]="list.hasMore()"
          [loading]="list.loadingMore()"
          [failed]="list.moreFailed()"
          (more)="list.loadMore()"
        />
      }
    }
  `,
})
export class PurchasingContainer implements OnInit {
  private readonly api = inject(PurchaseApiService);
  private readonly invoiceApi = inject(SupplierInvoiceApiService);
  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  protected readonly term = signal('');
  protected readonly list = new PagedList<OrderSummary>({ key: (o) => o.name });
  private readonly overviewState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly state = computed(() => {
    const status = this.list.status();
    const overview = this.overviewState();
    return status === 'error' || overview === 'error'
      ? 'error'
      : status === 'ready' && overview === 'ready'
        ? 'ready'
        : 'loading';
  });
  protected readonly selected = signal<string | null>(null);
  private readonly overview = signal<PurchasingOverview | null>(null);

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  private readonly currency = computed(() => this.business.active()?.currency ?? '');

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      workspaceTitle: t('purchase.workspaceTitle'),
      workspaceSubtitle: t('purchase.workspaceSubtitle'),
      title: t('purchase.title'),
      subtitle: t('purchase.subtitle'),
      newOrder: t('purchase.newOrder'),
      ordersHeading: t('purchase.ordersHeading'),
      search: t('purchase.search'),
      searchOrders: t('purchase.searchOrders'),
      // Order values only for roles that see buying prices (docs/PERMISSIONS.md).
      headers: ['order', 'created', 'status', ...(this.caps().seeCosts ? ['total'] : [])].map((k) =>
        t(`purchase.headers.${k}`),
      ),
      openOrder: t('purchase.panel.open'),
      openInvoice: t('purchase.panel.openInvoice'),
      choose: t('purchase.panel.choose'),
      loading: t('purchase.loading'),
      error: { title: t('purchase.error.title'), message: t('purchase.error.message') },
      retry: t('purchase.retry'),
    };
  });

  private readonly matching = computed(() => {
    const query = this.term().trim().toLowerCase();
    return this.list
      .items()
      .filter(
        (o) =>
          !query ||
          o.name.toLowerCase().includes(query) ||
          o.supplierName.toLowerCase().includes(query),
      );
  });

  protected readonly stats = computed(() => {
    const overview = this.overview();
    const currency = this.caps().seeCosts ? this.currency() : null;
    return overview ? workspaceStats(overview, currency, this.i18n.tr()) : [];
  });

  protected readonly rows = computed(() =>
    this.matching().map((o) =>
      orderRow(o, this.caps().seeCosts, this.i18n.language(), this.i18n.tr()),
    ),
  );

  protected readonly cards = computed(() =>
    this.matching().map((o) => ({
      id: o.name,
      view: orderCard(o, this.caps().seeCosts, this.i18n.language(), this.i18n.tr()),
    })),
  );

  protected readonly selectedOrder = computed(() => {
    const orders = this.list.items();
    return orders.find((o) => o.name === this.selected()) ?? orders[0] ?? null;
  });

  protected readonly selectedChip = computed(() => {
    const order = this.selectedOrder();
    return order ? progressChip(order.progress, this.i18n.tr()) : null;
  });

  protected readonly panelRows = computed(() => {
    const order = this.selectedOrder();
    return order ? orderPanel(order, this.caps().seeCosts, this.i18n.tr()) : [];
  });

  /** The selected order's supplier invoices, loaded when it is selected (cost roles, desktop panel). */
  protected readonly panelInvoices = signal<OrderInvoice[]>([]);
  private invoiceRun = 0;

  protected readonly invoiceRows = computed(() =>
    panelInvoiceRows(this.panelInvoices(), this.i18n.tr()),
  );

  protected readonly emptyText = computed(() =>
    this.i18n.tr().t(this.term().trim() ? 'purchase.noResults' : 'purchase.empty'),
  );

  constructor() {
    effect(() => {
      const order = this.selectedOrder()?.name ?? null;
      const load = this.desktop() && this.caps().seeCosts;
      untracked(() => void this.loadInvoices(load ? order : null));
    });
  }

  private async loadInvoices(order: string | null): Promise<void> {
    const run = ++this.invoiceRun;
    // Cleared first, so the previous order's invoice never shows under the newly selected one.
    this.panelInvoices.set([]);
    if (!order) {
      return;
    }
    const invoices = await this.invoiceApi.forOrder(order).catch(() => []);
    if (run === this.invoiceRun) {
      this.panelInvoices.set(invoices);
    }
  }

  protected openInvoice(invoice: string): void {
    void this.router.navigate(['/purchases/invoice', invoice]);
  }

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.overviewState.set('loading');
    this.overview.set(null);
    const business = await this.business.ensure().catch(() => null);
    if (!business) {
      this.overviewState.set('error');
      this.list.reset();
      return;
    }
    const company = business.name;
    await Promise.all([
      this.list.loadFirst((start, size) => this.api.orders(company, start, size)),
      this.api
        .overview(company, business.currency)
        .then((overview) => {
          this.overview.set(overview);
          this.overviewState.set('ready');
        })
        .catch(() => this.overviewState.set('error')),
    ]);
  }

  protected newOrder(): void {
    void this.router.navigate(['/purchases/new']);
  }

  protected open(name: string): void {
    void this.router.navigate(['/purchases/order', name]);
  }
}
