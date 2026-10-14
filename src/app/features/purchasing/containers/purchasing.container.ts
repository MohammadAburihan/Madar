import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { PurchaseApiService } from '../data-access/purchase-api.service';
import { PurchasingOverview } from '../data-access/purchase.models';
import { orderCard, orderPanel, orderRow, progressChip, workspaceStats } from './purchase-view';

/** Purchases: the orders with where each stands, the key figures, and a new order. */
@Component({
  selector: 'app-purchasing',
  imports: [
    DataTableComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
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
          </div>
          <section class="panel" [attr.aria-label]="txt.ordersHeading">
            @if (selectedOrder(); as order) {
              <h2>{{ order.name }}</h2>
              <p class="sub">{{ order.supplierName }}</p>
              @let chip = selectedChip()!;
              <app-status-chip [label]="chip.label" [tone]="chip.tone" />
              <app-totals-card density="compact" [rows]="panelRows()" />
              <button type="button" class="md-btn md-btn--primary" (click)="open(order.name)">
                {{ txt.openOrder }}
              </button>
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
      }
    }
  `,
})
export class PurchasingContainer implements OnInit {
  private readonly api = inject(PurchaseApiService);
  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  protected readonly term = signal('');
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
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
      headers: ['order', 'created', 'status', 'total'].map((k) => t(`purchase.headers.${k}`)),
      openOrder: t('purchase.panel.open'),
      choose: t('purchase.panel.choose'),
      loading: t('purchase.loading'),
      error: { title: t('purchase.error.title'), message: t('purchase.error.message') },
      retry: t('purchase.retry'),
    };
  });

  private readonly matching = computed(() => {
    const query = this.term().trim().toLowerCase();
    return (this.overview()?.orders ?? []).filter(
      (o) =>
        !query ||
        o.name.toLowerCase().includes(query) ||
        o.supplierName.toLowerCase().includes(query),
    );
  });

  protected readonly stats = computed(() => {
    const overview = this.overview();
    return overview ? workspaceStats(overview, this.currency(), this.i18n.tr()) : [];
  });

  protected readonly rows = computed(() =>
    this.matching().map((o) => orderRow(o, this.currency(), this.i18n.language(), this.i18n.tr())),
  );

  protected readonly cards = computed(() =>
    this.matching().map((o) => ({
      id: o.name,
      view: orderCard(o, this.currency(), this.i18n.language(), this.i18n.tr()),
    })),
  );

  protected readonly selectedOrder = computed(() => {
    const orders = this.overview()?.orders ?? [];
    return orders.find((o) => o.name === this.selected()) ?? orders[0] ?? null;
  });

  protected readonly selectedChip = computed(() => {
    const order = this.selectedOrder();
    return order ? progressChip(order.progress, this.i18n.tr()) : null;
  });

  protected readonly panelRows = computed(() => {
    const order = this.selectedOrder();
    return order ? orderPanel(order, this.currency(), this.i18n.tr()) : [];
  });

  protected readonly emptyText = computed(() =>
    this.i18n.tr().t(this.term().trim() ? 'purchase.noResults' : 'purchase.empty'),
  );

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const business = await this.business.ensure();
      if (!business) {
        this.state.set('error');
        return;
      }
      this.overview.set(await this.api.overview(business.name));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected newOrder(): void {
    void this.router.navigate(['/purchases/new']);
  }

  protected open(name: string): void {
    void this.router.navigate(['/purchases/order', name]);
  }
}
