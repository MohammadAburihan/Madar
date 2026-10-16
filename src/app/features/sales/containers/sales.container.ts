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
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { FilterChipsComponent } from '../../../shared/ui/filter-chips.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { RecordKind } from '../data-access/sales-records.models';
import { RECORDS_LIMIT, SalesRecordsApiService } from '../data-access/sales-records-api.service';
import { RecordCard, invoiceCard, orderCard, quoteCard } from './sales-records-view';

const KINDS: readonly RecordKind[] = ['invoices', 'orders', 'quotes'];
const SEARCH_DELAY_MS = 250;

/** Sales: the business's invoices, orders and quotations, and where a new sale starts. */
@Component({
  selector: 'app-sales',
  imports: [
    DataTableComponent,
    FeedbackCardComponent,
    FilterChipsComponent,
    LanguageSwitcherComponent,
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
          [interactive]="kind() === 'invoices'"
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
      @if (cards().length >= limit) {
        <p class="muted">{{ txt.newest }}</p>
      }
      @if (!desktop()) {
        <button type="button" class="md-btn md-btn--primary" (click)="quickSale()">
          {{ txt.quickSale }}
        </button>
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

  protected readonly limit = RECORDS_LIMIT;
  /** Sales roles see only the documents they made. */
  private readonly own = computed(() => OWN_SALES_ONLY.includes(this.session.persona()));
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly kind = signal<string>('invoices');
  protected readonly term = signal('');
  protected readonly state = signal<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  protected readonly cards = signal<RecordCard[]>([]);
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
      forbidden: t('sales.records.forbidden'),
      loading: t('sales.records.loading'),
      retry: t('sales.records.retry'),
      newest: t('sales.records.newest', { count: RECORDS_LIMIT }),
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
      // Language changes reword the cards, so they are rebuilt from fresh records.
      this.i18n.language();
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

  protected async load(kind = this.kind() as RecordKind, term = this.term()): Promise<void> {
    const run = ++this.run;
    this.state.set('loading');
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No business');
      }
      const tr = this.i18n.tr();
      const language = this.i18n.language();
      const currency = business.currency;
      const query = {
        company: business.name,
        currency,
        term,
        owner: this.own() ? (this.session.user()?.id ?? null) : null,
      };
      const cards =
        kind === 'invoices'
          ? (await this.api.invoices(query)).map((r) => invoiceCard(r, currency, tr))
          : kind === 'orders'
            ? (await this.api.orders(query)).map((r) => orderCard(r, currency, tr))
            : (await this.api.quotes(query)).map((r) => quoteCard(r, currency, language, tr));
      if (run === this.run) {
        this.cards.set(cards);
        this.state.set('ready');
      }
    } catch (error) {
      if (run === this.run) {
        this.cards.set([]);
        const forbidden = ErpnextError.from(error).kind === 'forbidden';
        // 403 is also how an expired session answers; that one goes back to sign-in.
        if (forbidden) {
          void this.session.checkExpired();
        }
        this.state.set(forbidden ? 'forbidden' : 'error');
      }
    }
  }

  /** Only a row that is itself openable: the list on screen may still be the previous tab's. */
  protected open(id: string): void {
    if (this.cards().find((c) => c.id === id)?.openable) {
      void this.router.navigate(['/sales/invoices', id]);
    }
  }

  protected quickSale(): void {
    void this.router.navigate(['/sales/new']);
  }
}
