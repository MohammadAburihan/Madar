import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { PageFetch, PagedList } from '../../../core/util/paged-list';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { FilterChipsComponent } from '../../../shared/ui/filter-chips.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { LoadMoreComponent } from '../../../shared/ui/load-more.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { PersonCardComponent } from '../../../shared/ui/person-card.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { LeaveApiService } from '../data-access/leave-api.service';
import { LeaveRequest, LeaveTab } from '../data-access/workers.models';
import { leaveCard } from './leave-view';

const SEARCH_DELAY_MS = 250;

/** Leave requests: those waiting for approval, and those decided. */
@Component({
  selector: 'app-leave-requests',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    FilterChipsComponent,
    LanguageSwitcherComponent,
    LoadMoreComponent,
    PageHeadingComponent,
    PersonCardComponent,
    SearchFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="router.navigate(['/workers'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (!allowed()) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
      <app-filter-chips [label]="txt.title" [options]="txt.tabOptions" [(value)]="tab" />
      @if (state() === 'loading') {
        <p class="muted" role="status">{{ txt.loading }}</p>
      } @else if (state() === 'error') {
        <app-feedback-card tone="danger" [title]="txt.error.title" [message]="txt.error.message" />
        <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
      } @else {
        @for (card of cards(); track card.id) {
          <app-person-card
            [title]="card.title"
            [meta]="card.meta"
            [balance]="card.balance"
            (picked)="router.navigate(['/workers/leave', card.id])"
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
      <button
        type="button"
        class="md-btn md-btn--primary"
        (click)="router.navigate(['/workers/leave/new'])"
      >
        {{ txt.request }}
      </button>
      <button type="button" class="md-btn" (click)="router.navigate(['/workers'])">
        {{ txt.backToWorkers }}
      </button>
    }
  `,
})
export class LeaveRequestsContainer {
  private readonly api = inject(LeaveApiService);
  private readonly business = inject(BusinessService);
  private readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().manageWorkers);
  protected readonly tab = signal<string>('waiting');
  protected readonly term = signal('');
  protected readonly list = new PagedList<LeaveRequest>({ key: (r) => r.id });
  protected readonly state = computed(() =>
    this.list.status() === 'ready' ? 'ready' : this.list.status() === 'error' ? 'error' : 'loading',
  );
  protected readonly rows = this.list.items;

  private readonly current = computed<LeaveTab>(() =>
    this.tab() === 'decided' ? 'decided' : 'waiting',
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('workers.back'),
      title: t('workers.leave.title'),
      subtitle: t('workers.leave.subtitle', { business: this.business.active()?.name ?? '' }),
      search: t('workers.leave.search'),
      placeholder: t('workers.leave.placeholder'),
      tabOptions: (['waiting', 'decided'] as const).map((k) => ({
        value: k,
        label: t(`workers.leave.tabs.${k}`),
      })),
      loading: t('workers.leave.loading'),
      retry: t('workers.retry'),
      request: t('workers.leave.request'),
      backToWorkers: t('workers.leave.backToWorkers'),
      error: { title: t('workers.leave.error.title'), message: t('workers.leave.error.message') },
      noAccess: { title: t('workers.noAccess.title'), message: t('workers.noAccess.message') },
    };
  });

  protected readonly cards = computed(() =>
    this.rows().map((r) => leaveCard(r, this.i18n.language(), this.i18n.tr())),
  );

  protected readonly emptyText = computed(() =>
    this.i18n
      .tr()
      .t(this.term().trim() ? 'workers.leave.noResults' : `workers.leave.empty.${this.current()}`),
  );

  constructor() {
    if (this.route.snapshot.queryParamMap.get('tab') === 'decided') {
      this.tab.set('decided');
    }
    effect((onCleanup) => {
      const tab = this.current();
      const term = this.term();
      // Signing in as someone else or switching business starts the list over.
      void this.session.user()?.id;
      void this.business.active()?.name;
      if (!this.allowed()) {
        return;
      }
      const timer = setTimeout(
        () => untracked(() => void this.load(tab, term)),
        term ? SEARCH_DELAY_MS : 0,
      );
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected load(tab = this.current(), term = this.term()): Promise<void> {
    return this.list.loadFirst(this.fetcher(tab, term));
  }

  private fetcher(tab: LeaveTab, term: string): PageFetch<LeaveRequest> {
    return async (start, size) => {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      return this.api.requests(tab, term, business, start, size);
    };
  }
}
