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
import { OWN_SALES_ONLY } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { PageFetch, PagedList } from '../../../core/util/paged-list';
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { FilterChipsComponent } from '../../../shared/ui/filter-chips.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { LoadMoreComponent } from '../../../shared/ui/load-more.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import {
  InvoiceRecord,
  OrderRecord,
  QuoteRecord,
  RecordKind,
} from '../data-access/sales-records.models';
import { SalesRecordsApiService } from '../data-access/sales-records-api.service';
import { RecordCard, invoiceCard, orderCard, quoteCard } from './sales-records-view';

const KINDS: readonly RecordKind[] = ['invoices', 'orders', 'quotes'];
const SEARCH_DELAY_MS = 250;

type Raw =
  | { kind: 'invoices'; record: InvoiceRecord }
  | { kind: 'orders'; record: OrderRecord }
  | { kind: 'quotes'; record: QuoteRecord };

/** Sales: the business's invoices, orders and quotations, and where a new sale starts. */
@Component({
  selector: 'app-sales',
  imports: [
    DataTableComponent,
    FeedbackCardComponent,
    FilterChipsComponent,
    LanguageSwitcherComponent,
    LoadMoreComponent,
    PageHeadingComponent,
    SearchFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': 'desktop()', '[class.tablet]': "viewport() === 'tablet'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    button.card {
      all: unset;
      display: block;
      cursor: pointer;
    }

    button.card:focus-visible {
      outline: 2px solid var(--md-primary);
      outline-offset: 2px;
      border-radius: 12px;
    }
  `,
  template: `
    @let txt = text();
    @if (desktop()) {
      <app-page-heading layout="desktop" [title]="txt.heading" [subtitle]="txt.subtitle">
        @if (caps().sell) {
          <button type="button" class="md-btn" (click)="newQuotation()">
            {{ txt.newQuotation }}
          </button>
          <button type="button" class="md-btn md-btn--primary" (click)="quickSale()">
            {{ txt.quickSale }}
          </button>
        }
      </app-page-heading>
    }
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    @if (!desktop()) {
      <app-page-heading [title]="txt.heading" [subtitle]="txt.subtitle" />
    }
    @if (!caps().sell) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      @if (!desktop()) {
        <button type="button" class="md-btn md-btn--primary" (click)="quickSale()">
          {{ txt.quickSale }}
        </button>
        <button type="button" class="md-btn" (click)="newQuotation()">
          {{ txt.newQuotation }}
        </button>
      }
      <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
      <app-filter-chips [label]="txt.heading" [options]="txt.kinds" [(value)]="kind" />
      @if (state() === 'loading') {
        <p class="muted" role="status">{{ txt.loading }}</p>
      } @else if (state() === 'forbidden') {
        <app-feedback-card [title]="txt.forbidden" />
      } @else if (state() === 'error') {
        <app-feedback-card tone="danger" [title]="txt.error.title" [message]="txt.error.message" />
        <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
      } @else if (desktop()) {
        <app-data-table
          [label]="txt.heading"
          [headers]="txt.headers"
          [rows]="rows()"
          [interactive]="true"
          [empty]="emptyText()"
          [ltrColumns]="[0, 3]"
          (opened)="open($event)"
        />
      } @else {
        @for (card of cards(); track card.id) {
          @if (card.openable) {
            <button type="button" class="card" (click)="open(card.id)">
              <app-feedback-card [title]="card.title" [message]="card.message" />
            </button>
          } @else {
            <app-feedback-card [title]="card.title" [message]="card.message" />
          }
        } @empty {
          <p class="muted">{{ emptyText() }}</p>
        }
      }
      @if (state() === 'ready') {
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
export class SalesContainer {
  private readonly api = inject(SalesRecordsApiService);
  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  private readonly session = inject(SessionService);
  protected readonly caps = this.session.capabilities;
  protected readonly i18n = injectI18n();

  /** Sales roles see only the documents they made. */
  private readonly own = computed(() => OWN_SALES_ONLY.includes(this.session.persona()));
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly kind = signal<string>('invoices');
  protected readonly term = signal('');
  protected readonly list = new PagedList<Raw>({ key: (r) => r.record.name });
  protected readonly state = computed(() => {
    const status = this.list.status();
    if (status === 'error') {
      return ErpnextError.from(this.list.error()).kind === 'forbidden' ? 'forbidden' : 'error';
    }
    return status === 'ready' ? 'ready' : 'loading';
  });
  protected readonly cards = computed<RecordCard[]>(() => {
    const currency = this.business.active()?.currency ?? '';
    const language = this.i18n.language();
    const tr = this.i18n.tr();
    return this.list.items().map((raw) => {
      if (raw.kind === 'invoices') {
        return invoiceCard(raw.record, currency, tr);
      }
      return raw.kind === 'orders'
        ? orderCard(raw.record, currency, tr)
        : quoteCard(raw.record, currency, language, tr);
    });
  });
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      heading: t('sales.records.heading'),
      subtitle: t(this.own() ? 'sales.records.subtitleOwn' : 'sales.records.subtitle', {
        business: this.business.active()?.name ?? '',
      }),
      search: t('sales.records.search'),
      placeholder: t('sales.records.placeholder'),
      kinds: KINDS.map((k) => ({ value: k, label: t(`sales.records.kinds.${k}`) })),
      headers: ['document', 'customer', 'status', 'amount'].map((h) =>
        t(`sales.records.headers.${h}`),
      ),
      quickSale: t('sales.records.quickSale'),
      newQuotation: t('sales.records.newQuotation'),
      forbidden: t('sales.records.forbidden'),
      loading: t('sales.records.loading'),
      retry: t('sales.records.retry'),
      error: {
        title: t('sales.records.error.title'),
        message: t('sales.records.error.message'),
      },
      noAccess: {
        title: t('sales.records.noAccess.title'),
        message: t('sales.records.noAccess.message'),
      },
    };
  });

  protected readonly rows = computed(() => this.cards().map((c) => ({ id: c.id, cells: c.cells })));

  protected readonly emptyText = computed(() => {
    const { t } = this.i18n.tr();
    return this.term().trim()
      ? t('sales.records.noResults')
      : t(`sales.records.empty.${this.kind()}`);
  });

  constructor() {
    effect((onCleanup) => {
      const kind = this.kind() as RecordKind;
      const term = this.term();
      // Signing in as someone else or switching business starts the list over.
      void this.session.user()?.id;
      void this.business.active()?.name;
      if (!this.caps().sell) {
        return;
      }
      const timer = setTimeout(
        () => untracked(() => void this.load(kind, term)),
        term.trim() ? SEARCH_DELAY_MS : 0,
      );
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected load(kind = this.kind() as RecordKind, term = this.term()): Promise<void> {
    return this.list.loadFirst(this.fetcher(kind, term));
  }

  private fetcher(kind: RecordKind, term: string): PageFetch<Raw> {
    return async (start, size) => {
      try {
        const business = await this.business.ensure();
        if (!business) {
          throw new Error('No business');
        }
        const query = {
          company: business.name,
          currency: business.currency,
          term,
          owner: this.own() ? (this.session.user()?.id ?? null) : null,
        };
        if (kind === 'invoices') {
          const page = await this.api.invoices(query, start, size);
          return { ...page, items: page.items.map((record) => ({ kind, record })) };
        }
        if (kind === 'orders') {
          const page = await this.api.orders(query, start, size);
          return { ...page, items: page.items.map((record) => ({ kind, record })) };
        }
        const page = await this.api.quotes(query, start, size);
        return { ...page, items: page.items.map((record) => ({ kind, record })) };
      } catch (error) {
        // 403 is also how an expired session answers; that one goes back to sign-in.
        if (ErpnextError.from(error).kind === 'forbidden') {
          void this.session.checkExpired();
        }
        throw error;
      }
    };
  }

  /** Only a row that is itself openable: the list on screen may still be the previous tab's. */
  protected open(id: string): void {
    const card = this.cards().find((c) => c.id === id);
    if (card?.openable) {
      const base = {
        quotes: '/sales/quotes',
        orders: '/sales/orders',
        invoices: '/sales/invoices',
      };
      void this.router.navigate([base[card.kind], id]);
    }
  }

  protected newQuotation(): void {
    void this.router.navigate(['/sales/quote/new']);
  }

  protected quickSale(): void {
    void this.router.navigate(['/sales/new']);
  }
}
