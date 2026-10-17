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
import { toIsoDate } from '../../../core/format/format';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { FilterChipsComponent } from '../../../shared/ui/filter-chips.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { PersonCardComponent } from '../../../shared/ui/person-card.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { LIST_LIMIT, WorkersApiService } from '../data-access/workers-api.service';
import { WorkerDetail, WorkerRow, WorkerTab } from '../data-access/workers.models';
import { workerCard, workerLines, workerRow, workerSubtitle, workerView } from './workers-view';

const SEARCH_DELAY_MS = 250;

/** Workers: search them, see how each is today, and open one. */
@Component({
  selector: 'app-workers',
  imports: [
    DataTableComponent,
    FeedbackCardComponent,
    FilterChipsComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    PersonCardComponent,
    SearchFieldComponent,
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

    .actions {
      display: flex;
      gap: 12px;
    }

    .lines {
      margin: 0;
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
      white-space: pre-line;
    }
  `,
  template: `
    @let txt = text();
    @if (desktop()) {
      <app-page-heading layout="desktop" [title]="txt.title" [subtitle]="txt.subtitle">
        @if (allowed()) {
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
      } @else if (desktop()) {
        <div class="split">
          <div class="main">
            <app-data-table
              [label]="txt.title"
              [headers]="headers()"
              [rows]="tableRows()"
              [interactive]="true"
              [empty]="emptyText()"
              (opened)="selected.set($event)"
            />
            <div class="actions">
              <button type="button" class="md-btn" (click)="markAttendance()">
                {{ txt.markAttendance }}
              </button>
              <button type="button" class="md-btn" (click)="leaveRequests()">
                {{ txt.leaveRequests }}
              </button>
            </div>
          </div>
          <section class="panel" [attr.aria-label]="txt.title">
            @if (panel(); as p) {
              <h2>{{ p.name }}</h2>
              <p class="lines">{{ p.lines }}</p>
              @if (p.card) {
                <app-feedback-card [title]="p.card.title" [message]="p.card.message" />
              }
              @if (p.recent.length) {
                <p class="lines muted">{{ p.recent.join('\\n') }}</p>
              }
              @if (p.active) {
                <button type="button" class="md-btn md-btn--primary" (click)="markAttendance()">
                  {{ txt.markAttendance }}
                </button>
                <button type="button" class="md-btn" (click)="requestLeave(p.id)">
                  {{ txt.requestLeave }}
                </button>
              }
              <button type="button" class="md-btn" (click)="openDetail(p.id)">
                {{ txt.openDetail }}
              </button>
            } @else if (panelFailed()) {
              <p class="muted">{{ txt.panelFailed }}</p>
            } @else if (selectedId()) {
              <p class="muted" role="status">{{ txt.loading }}</p>
            } @else {
              <p class="muted">{{ txt.choose }}</p>
            }
          </section>
        </div>
      } @else {
        @for (card of cards(); track card.id) {
          <app-person-card
            [title]="card.title"
            [meta]="card.meta"
            [balance]="card.balance"
            (picked)="openDetail(card.id)"
          />
        } @empty {
          <p class="muted">{{ emptyText() }}</p>
        }
      }
      @if (state() === 'ready' && capped()) {
        <p class="muted">{{ txt.capped }}</p>
      }
      @if (!desktop()) {
        <button type="button" class="md-btn md-btn--primary" (click)="add()">
          {{ txt.add }}
        </button>
        <button type="button" class="md-btn" (click)="markAttendance()">
          {{ txt.markAttendance }}
        </button>
        <button type="button" class="md-btn" (click)="leaveRequests()">
          {{ txt.leaveRequests }}
        </button>
      }
    }
  `,
})
export class WorkersContainer {
  private readonly api = inject(WorkersApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly viewport = inject(ViewportService).viewport;
  private readonly session = inject(SessionService);
  protected readonly i18n = injectI18n();

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly allowed = computed(() => this.session.capabilities().manageWorkers);
  protected readonly tab = signal<string>('active');
  protected readonly term = signal('');
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly rows = signal<WorkerRow[]>([]);
  protected readonly selected = signal<string | null>(null);
  private readonly detail = signal<WorkerDetail | null>(null);
  protected readonly panelFailed = signal(false);
  private run = 0;
  private detailRun = 0;

  private readonly current = computed<WorkerTab>(() => (this.tab() === 'left' ? 'left' : 'active'));

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      title: t('workers.title'),
      subtitle: t('workers.subtitle', { business: this.business.active()?.name ?? '' }),
      search: t('workers.search'),
      placeholder: t('workers.placeholder'),
      tabOptions: (['active', 'left'] as const).map((k) => ({
        value: k,
        label: t(`workers.tabs.${k}`),
      })),
      loading: t('workers.loading'),
      retry: t('workers.retry'),
      choose: t('workers.choose'),
      openDetail: t('workers.openDetail'),
      panelFailed: t('workers.panelFailed'),
      capped: t('workers.capped', { count: LIST_LIMIT }),
      add: t('workers.add'),
      addDesktop: t('workers.addDesktop'),
      markAttendance: t('workers.markAttendance'),
      requestLeave: t('workers.requestLeave'),
      leaveRequests: t('workers.leaveRequests'),
      error: { title: t('workers.error.title'), message: t('workers.error.message') },
      noAccess: { title: t('workers.noAccess.title'), message: t('workers.noAccess.message') },
    };
  });

  /** Today's column where attendance could be read, or to say who isn't active; never for those who left. */
  private readonly withToday = computed(
    () =>
      this.current() === 'active' &&
      this.rows().some((r) => r.today !== null || r.status !== 'Active'),
  );

  protected readonly headers = computed(() => {
    const { t } = this.i18n.tr();
    return [
      t('workers.headers.worker'),
      t('workers.headers.designation'),
      ...(this.withToday() ? [t('workers.headers.today')] : []),
    ];
  });

  protected readonly cards = computed(() =>
    this.rows().map((r) => workerCard(r, this.i18n.language(), this.i18n.tr())),
  );

  protected readonly tableRows = computed(() =>
    this.rows().map((r) => {
      const cells = workerRow(r, this.i18n.language(), this.i18n.tr());
      const withToday = this.withToday();
      return {
        id: r.id,
        cells: withToday ? [...cells.slice(0, 2), cells[2] ?? ''] : cells.slice(0, 2),
      };
    }),
  );

  protected readonly capped = computed(() => this.rows().length >= LIST_LIMIT);

  protected readonly emptyText = computed(() =>
    this.i18n.tr().t(this.term().trim() ? 'workers.noResults' : `workers.empty.${this.current()}`),
  );

  /** The row shown in the desktop panel: the one picked, else the first, never one from another list. */
  protected readonly selectedId = computed(() => {
    const rows = this.rows();
    return rows.find((r) => r.id === this.selected())?.id ?? rows[0]?.id ?? null;
  });

  protected readonly panel = computed(() => {
    const detail = this.detail();
    if (!detail || detail.id !== this.selectedId()) {
      return null;
    }
    const tr = this.i18n.tr();
    const language = this.i18n.language();
    const view = workerView(detail, this.business.active()?.currency ?? '', language, tr);
    return {
      id: detail.id,
      name: detail.name,
      lines: [workerSubtitle(detail, tr), workerLines(detail, language, tr)].join('\n'),
      card: view.card,
      active: detail.status === 'Active',
      recent: view.recent,
    };
  });

  constructor() {
    if (this.route.snapshot.queryParamMap.get('tab') === 'left') {
      this.tab.set('left');
    }
    effect((onCleanup) => {
      const tab = this.current();
      const term = this.term();
      if (!this.allowed()) {
        return;
      }
      const timer = setTimeout(
        () => untracked(() => void this.load(tab, term)),
        term ? SEARCH_DELAY_MS : 0,
      );
      onCleanup(() => clearTimeout(timer));
    });
    effect(() => {
      const id = this.desktop() && this.state() === 'ready' ? this.selectedId() : null;
      untracked(() => void this.loadDetail(id));
    });
  }

  protected async load(tab = this.current(), term = this.term()): Promise<void> {
    const run = ++this.run;
    this.state.set('loading');
    // A previous list's rows must not stay selectable under the new one.
    this.rows.set([]);
    this.selected.set(null);
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        throw new Error('No active business');
      }
      const rows = await this.api.list(term, tab, business, toIsoDate(this.clock.now()));
      if (run === this.run) {
        this.rows.set(rows);
        this.state.set('ready');
      }
    } catch {
      if (run === this.run) {
        this.state.set('error');
      }
    }
  }

  private async loadDetail(id: string | null): Promise<void> {
    const run = ++this.detailRun;
    this.detail.set(null);
    this.panelFailed.set(false);
    if (!id) {
      return;
    }
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        throw new Error('No active business');
      }
      const detail = await this.api.worker(id, business, toIsoDate(this.clock.now()));
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
    void this.router.navigate(['/workers/new']);
  }

  protected markAttendance(): void {
    void this.router.navigate(['/workers/attendance']);
  }

  protected requestLeave(worker: string): void {
    void this.router.navigate(['/workers/leave/new'], { queryParams: { worker } });
  }

  protected leaveRequests(): void {
    void this.router.navigate(['/workers/leave']);
  }

  protected openDetail(id: string): void {
    void this.router.navigate(['/workers', id]);
  }
}
