import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { OWN_SALES_ONLY } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { PageFetch, PagedList } from '../../../core/util/paged-list';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { LoadMoreComponent } from '../../../shared/ui/load-more.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { ContactsApiService, withCredits } from '../data-access/contacts-api.service';
import { ContactKind, HistoryEntry } from '../data-access/contacts.models';
import { contactKinds } from './contacts-access';
import { historyCard } from './contacts-view';

/** A customer's or supplier's invoices, payments and deliveries, newest first. */
@Component({
  selector: 'app-contact-history',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    LoadMoreComponent,
    PageHeadingComponent,
    SearchFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
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
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="back()" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (!allowed()) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (list.status() === 'error') {
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else if (list.status() !== 'ready') {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else {
      <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
      @for (card of cards(); track card.id) {
        @if (card.route) {
          <button type="button" class="card" (click)="router.navigate(card.route)">
            <app-feedback-card [title]="card.title" [message]="card.message" />
          </button>
        } @else {
          <app-feedback-card [title]="card.title" [message]="card.message" />
        }
      } @empty {
        <p class="muted">{{ emptyText() }}</p>
      }
      <app-load-more
        [hasMore]="list.hasMore()"
        [loading]="list.loadingMore()"
        [failed]="list.moreFailed()"
        [autoLoad]="!term().trim()"
        (more)="list.loadMore()"
      />
    }
  `,
})
export class ContactHistoryContainer {
  readonly kind = input.required<string>();
  readonly id = input.required<string>();

  private readonly api = inject(ContactsApiService);
  private readonly business = inject(BusinessService);
  private readonly session = inject(SessionService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly term = signal('');
  protected readonly list = new PagedList<HistoryEntry>({
    key: (e) => `${e.kind === 'return' ? 'invoice' : e.kind}:${e.name}`,
  });
  /** Credit notes reduce invoices already shown, so the totals are worked out over every page loaded. */
  private readonly entries = computed(() => withCredits(this.list.items()));
  private readonly contactName = signal<string | null>(null);
  private run = 0;

  private readonly contactKind = computed<ContactKind>(() =>
    this.kind() === 'suppliers' ? 'suppliers' : 'customers',
  );
  protected readonly allowed = computed(() =>
    contactKinds(this.session.capabilities()).includes(this.contactKind()),
  );
  /** Salespeople and store associates see their own sales only (docs/PERMISSIONS.md). */
  private readonly owner = computed(() =>
    this.contactKind() === 'customers' && OWN_SALES_ONLY.includes(this.session.persona())
      ? (this.session.user()?.id ?? null)
      : null,
  );
  /** A supplier's money only for cost roles; a customer's for everyone who sees customers. */
  private readonly withMoney = computed(
    () => this.contactKind() === 'customers' || this.session.capabilities().seeCosts,
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('contacts.back'),
      title: t('contacts.history.title'),
      subtitle: t('contacts.history.subtitle', {
        contact: this.contactName() ?? this.id(),
        business: this.business.active()?.name ?? '',
      }),
      search: t('contacts.search'),
      placeholder: t('contacts.history.placeholder'),
      loading: t('contacts.loading'),
      retry: t('contacts.retry'),
      empty: t('contacts.history.empty'),
      noResults: t('contacts.history.noResults'),
      searching: t('paging.searching'),
      noAccess: block('contacts.noAccess'),
      loadFailed: block('contacts.history.loadFailed'),
    };
  });

  protected readonly emptyText = computed(() => {
    const txt = this.text();
    if (!this.term().trim()) {
      return txt.empty;
    }
    return this.list.hasMore() ? txt.searching : txt.noResults;
  });

  protected readonly cards = computed(() => {
    const query = this.term().trim().toLowerCase();
    const kind = this.contactKind();
    const currency = this.business.active()?.currency ?? '';
    const tr = this.i18n.tr();
    return this.entries()
      .filter((e) => !query || e.name.toLowerCase().includes(query))
      .map((e) => ({
        id: `${e.kind}:${e.name}`,
        ...historyCard(e, kind, currency, tr),
        route:
          e.kind === 'invoice' || e.kind === 'return'
            ? kind === 'customers'
              ? ['/sales/invoices', e.name]
              : ['/purchases/invoice', e.name]
            : null,
      }));
  });

  constructor() {
    effect(() => {
      const kind = this.contactKind();
      const id = this.id();
      // Signing in as someone else or switching business starts the history over.
      void this.session.user()?.id;
      void this.business.active()?.name;
      if (this.allowed()) {
        untracked(() => void this.load(kind, id));
      }
    });
  }

  protected load(kind = this.contactKind(), id = this.id()): Promise<void> {
    const run = ++this.run;
    this.contactName.set(null);
    void this.api
      .displayName(kind, id)
      .then((name) => run === this.run && this.contactName.set(name));
    let merged: PageFetch<HistoryEntry> | null = null;
    return this.list.loadFirst(async (start, size) => {
      if (!merged) {
        const business = await this.business.ensure();
        if (!business) {
          throw new Error('No active business');
        }
        merged = this.api.history(kind, id, business, this.owner(), this.withMoney());
      }
      return merged(start, size);
    });
  }

  protected back(): void {
    void this.router.navigate(['/contacts', this.contactKind(), this.id()]);
  }
}
