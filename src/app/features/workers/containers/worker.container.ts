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
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { toIsoDate } from '../../../core/format/format';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { WorkersApiService } from '../data-access/workers-api.service';
import { WorkerDetail } from '../data-access/workers.models';
import { workerLines, workerSubtitle, workerView } from './workers-view';

/** One worker: how to reach them, their month at a glance, latest pay, and what to do next. */
@Component({
  selector: 'app-worker',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    .lines {
      margin: 0;
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
      white-space: pre-line;
    }
  `,
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="back()" />
    @if (!allowed()) {
      <app-page-heading [title]="txt.pageTitle" />
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (view(); as v) {
      <app-page-heading [title]="v.name" [subtitle]="v.subtitle" />
      <p class="lines">{{ v.lines }}</p>
      @if (v.totals.length) {
        <app-totals-card density="compact" [rows]="v.totals" />
      }
      @if (v.pay) {
        <app-feedback-card tone="tint" [title]="v.pay.title" [message]="v.pay.message" />
      }
      @if (v.active) {
        <button
          type="button"
          class="md-btn md-btn--primary"
          (click)="router.navigate(['/workers/attendance'])"
        >
          {{ txt.markAttendance }}
        </button>
        <button
          type="button"
          class="md-btn"
          (click)="router.navigate(['/workers/leave/new'], { queryParams: { worker: id() } })"
        >
          {{ txt.requestLeave }}
        </button>
      }
      <button type="button" class="md-btn" (click)="router.navigate(['/workers', id(), 'edit'])">
        {{ txt.edit }}
      </button>
    } @else if (failed()) {
      <app-page-heading [title]="txt.pageTitle" [subtitle]="id()" />
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class WorkerContainer {
  readonly id = input.required<string>();

  private readonly api = inject(WorkersApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  private readonly session = inject(SessionService);
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().manageWorkers);
  private readonly detail = signal<WorkerDetail | null>(null);
  protected readonly failed = signal(false);
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('workers.back'),
      pageTitle: t('workers.title'),
      loading: t('workers.loading'),
      retry: t('workers.retry'),
      edit: t('workers.edit'),
      markAttendance: t('workers.markAttendance'),
      requestLeave: t('workers.requestLeave'),
      noAccess: { title: t('workers.noAccess.title'), message: t('workers.noAccess.message') },
      loadFailed: {
        title: t('workers.loadFailed.title'),
        message: t('workers.loadFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const detail = this.detail();
    if (!detail) {
      return null;
    }
    const tr = this.i18n.tr();
    const language = this.i18n.language();
    const view = workerView(detail, this.business.active()?.currency ?? '', language, tr);
    return {
      name: detail.name,
      subtitle: workerSubtitle(detail, tr),
      lines: workerLines(detail, language, tr),
      totals: view.totals,
      pay: view.pay,
      active: detail.status === 'Active',
    };
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (this.allowed()) {
        untracked(() => void this.load(id));
      }
    });
  }

  protected async load(id = this.id()): Promise<void> {
    const run = ++this.run;
    this.detail.set(null);
    this.failed.set(false);
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        throw new Error('No active business');
      }
      const detail = await this.api.worker(id, business, toIsoDate(this.clock.now()));
      if (run === this.run) {
        this.detail.set(detail);
      }
    } catch {
      if (run === this.run) {
        this.failed.set(true);
      }
    }
  }

  protected back(): void {
    const left = this.detail()?.status === 'Left';
    void this.router.navigate(['/workers'], { queryParams: left ? { tab: 'left' } : {} });
  }
}
