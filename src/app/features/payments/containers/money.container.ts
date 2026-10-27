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
import { PageFetch, PagedList } from '../../../core/util/paged-list';
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { LoadMoreComponent } from '../../../shared/ui/load-more.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { ExpenseApiService } from '../data-access/expense-api.service';
import { MoneyApiService, MoneyOverview, PaymentRecord } from '../data-access/money-api.service';
import { balanceCard, matches, paymentCard, paymentRow } from './money-view';

/** Money: payment history with shortcuts to receive, pay and record an expense. */
@Component({
  selector: 'app-money',
  imports: [
    DataTableComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    LoadMoreComponent,
    PageHeadingComponent,
    SearchFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    .actions,
    .balances {
      display: flex;
      gap: 24px;
    }

    .actions > *,
    .balances > * {
      flex: 1;
    }
  `,
  template: `
    @let txt = text();
    @if (desktop()) {
      <app-page-heading layout="desktop" [title]="txt.title" [subtitle]="txt.subtitleDesktop">
        @if (caps().collect) {
          <button type="button" class="md-btn md-btn--primary" (click)="open('receive')">
            {{ txt.newPayment }}
          </button>
        }
      </app-page-heading>
      <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    } @else {
      <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
      <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    }

    @if (caps().money === 'none') {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      @if (desktop()) {
        <div class="actions">
          @for (action of actions(); track action.id) {
            <button type="button" class="md-btn" (click)="open(action.id)">
              {{ action.label }}
            </button>
          }
        </div>
      }
      <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
      @if (state() === 'loading') {
        <p class="muted" role="status">{{ txt.loading }}</p>
      } @else if (state() === 'error') {
        <app-feedback-card tone="danger" [title]="txt.error.title" [message]="txt.error.message" />
      } @else if (desktop()) {
        <app-data-table
          [label]="txt.title"
          [headers]="txt.headers"
          [rows]="rows()"
          [ltrColumns]="[2]"
          [empty]="emptyText()"
        />
        <app-load-more
          [hasMore]="list.hasMore()"
          [loading]="list.loadingMore()"
          [failed]="list.moreFailed()"
          (more)="list.loadMore()"
        />
        @if (balances().length) {
          <div class="balances">
            @for (balance of balances(); track balance.title) {
              <app-feedback-card [title]="balance.title" [message]="balance.message" />
            }
          </div>
        }
        <p class="muted">{{ txt.note }}</p>
      } @else {
        @for (card of cards(); track card.title) {
          <app-feedback-card [title]="card.title" [message]="card.message" />
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
      @if (!desktop()) {
        @for (action of actions(); track action.id; let first = $first) {
          <button
            type="button"
            class="md-btn"
            [class.md-btn--primary]="first"
            (click)="open(action.id)"
          >
            {{ action.label }}
          </button>
        }
      }
    }
  `,
})
export class MoneyContainer implements OnInit {
  private readonly api = inject(MoneyApiService);
  private readonly expenses = inject(ExpenseApiService);
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly term = signal('');
  protected readonly list = new PagedList<PaymentRecord>({
    key: (p) => `${p.direction === 'expense' ? 'JE' : 'PE'}:${p.name}`,
  });
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
  private readonly overview = signal<MoneyOverview | null>(null);

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly caps = this.session.capabilities;
  private readonly currency = computed(() => this.business.active()?.currency ?? '');

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const business = this.business.active()?.name ?? '';
    return {
      title: t('money.title'),
      subtitle: t('money.subtitle', { business }),
      subtitleDesktop: t('money.subtitleDesktop', { business }),
      newPayment: t('money.newPayment'),
      search: t('money.search'),
      placeholder: t('money.placeholder'),
      loading: t('money.loading'),
      headers: [
        t('money.headers.record'),
        t('money.headers.account'),
        t('money.headers.amount'),
        t('money.headers.status'),
      ],
      note: t('money.note'),
      noAccess: { title: t('money.noAccess.title'), message: t('money.noAccess.message') },
      error: { title: t('money.error.title'), message: t('money.error.message') },
    };
  });

  /** The tasks this role can start from here; Pay supplier and Record expense are owner tasks. */
  protected readonly actions = computed(() => {
    const { t } = this.i18n.tr();
    const caps = this.caps();
    return [
      ...(caps.collect ? [{ id: 'receive', label: t('money.receive') }] : []),
      ...(caps.paySuppliers ? [{ id: 'paySupplier', label: t('money.paySupplier') }] : []),
      ...(caps.recordExpenses ? [{ id: 'expense', label: t('money.expense') }] : []),
    ];
  });

  private readonly visible = computed(() =>
    this.list.items().filter((p) => matches(p, this.term())),
  );

  protected readonly cards = computed(() =>
    this.visible().map((p) => paymentCard(p, this.currency(), this.i18n.tr())),
  );

  protected readonly rows = computed(() =>
    this.visible().map((p) => paymentRow(p, this.currency(), this.i18n.tr())),
  );

  protected readonly balances = computed(() => {
    const overview = this.overview();
    const tr = this.i18n.tr();
    return [
      overview?.receivable
        ? balanceCard(overview.receivable, 'customer', this.currency(), tr)
        : null,
      overview?.payable ? balanceCard(overview.payable, 'supplier', this.currency(), tr) : null,
    ].filter((card) => card !== null);
  });

  protected readonly emptyText = computed(() => {
    const { t } = this.i18n.tr();
    return this.term().trim() ? t('money.noResults') : t('money.empty');
  });

  ngOnInit(): void {
    void this.load();
  }

  protected open(action: string): void {
    const routes: Record<string, string[]> = {
      receive: ['/money/receive'],
      // Suppliers are paid against an order's invoice, found from the purchasing workspace.
      paySupplier: ['/purchases'],
      expense: ['/money/expense'],
    };
    void this.router.navigate(routes[action] ?? ['/task', action]);
  }

  private async load(): Promise<void> {
    const access = this.caps().money;
    if (access === 'none') {
      return;
    }
    this.overviewState.set('loading');
    const business = await this.business.ensure().catch(() => null);
    if (!business) {
      this.overviewState.set('error');
      return;
    }
    const company = business.name;
    const owner = access === 'own' ? (this.session.user()?.id ?? null) : null;
    let history: PageFetch<PaymentRecord> | null = null;
    await Promise.all([
      this.list.loadFirst(async (start, size) => {
        if (!history) {
          // Expenses show for the roles that record them; their categories pick them out of the journal.
          const categories = this.caps().recordExpenses
            ? await this.expenses.categories(company).catch(() => [])
            : [];
          history = this.api.history(
            company,
            owner,
            categories.map((c) => c.account),
          );
        }
        return history(start, size);
      }),
      this.api
        .overview(company, owner)
        .then((overview) => {
          this.overview.set(overview);
          this.overviewState.set('ready');
        })
        .catch(() => this.overviewState.set('error')),
    ]);
  }
}
