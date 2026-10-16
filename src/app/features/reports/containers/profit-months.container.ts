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
import { ProfitCardComponent } from '../components/profit-card.component';
import { PeriodFigures } from '../data-access/report.models';
import { ReportsApiService } from '../data-access/reports-api.service';
import { lastThreeMonths, profitByMonth, rangeText } from './reports-view';

/** Profit by month: the last three months up to the report's period, newest first. */
@Component({
  selector: 'app-profit-months',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    ProfitCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="router.navigate(['/reports'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (!caps().seeReports) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (failed()) {
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else if (view(); as v) {
      <app-profit-card [label]="txt.total" [amount]="v.total" [rows]="v.totalRows" />
      @for (month of v.months; track month.id) {
        <app-profit-card [label]="month.title" [amount]="month.profit" [rows]="month.rows" />
      }
      <p class="muted">{{ txt.note }}</p>
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class ProfitMonthsContainer {
  /** The report period's last day, from the link; today when opened directly. */
  readonly to = input<string | undefined>();

  private readonly api = inject(ReportsApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  protected readonly router = inject(Router);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  private readonly today = signal<Date | null>(null);
  private readonly months = signal<PeriodFigures[] | null>(null);
  protected readonly failed = signal(false);
  private run = 0;

  private readonly ranges = computed(() => {
    const today = this.today();
    if (!today) {
      return null;
    }
    const to = this.to();
    const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : toIsoDate(today);
    return lastThreeMonths({ from: end, to: end });
  });

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const ranges = this.ranges();
    return {
      back: t('reports.back'),
      title: t('reports.profitPage.title'),
      subtitle: t('reports.profitPage.subtitle', {
        business: this.business.active()?.name ?? '',
        range: ranges?.length
          ? rangeText(
              { from: ranges[0].from, to: ranges[ranges.length - 1].to },
              this.i18n.language(),
            )
          : '',
      }),
      total: t('reports.profitPage.total'),
      note: t('reports.profitPage.note'),
      loading: t('reports.loading'),
      retry: t('reports.retry'),
      noAccess: { title: t('reports.noAccess.title'), message: t('reports.noAccess.message') },
      loadFailed: {
        title: t('reports.loadFailed.title'),
        message: t('reports.loadFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const months = this.months();
    const today = this.today();
    if (!months || !today) {
      return null;
    }
    return profitByMonth(
      months,
      this.business.active()?.currency ?? '',
      today,
      this.i18n.language(),
      this.i18n.tr(),
    );
  });

  constructor() {
    void this.clock
      .ensure()
      .then(() => this.today.set(this.clock.now()))
      .catch(() => this.failed.set(true));
    effect(() => {
      if (this.ranges() && this.caps().seeReports) {
        untracked(() => void this.load());
      }
    });
  }

  protected async load(): Promise<void> {
    const ranges = this.ranges();
    if (!ranges) {
      return;
    }
    const run = ++this.run;
    this.failed.set(false);
    this.months.set(null);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No business');
      }
      const months = await Promise.all(ranges.map((r) => this.api.figures(business.name, r)));
      if (run === this.run) {
        this.months.set(months);
      }
    } catch {
      if (run === this.run) {
        this.failed.set(true);
      }
    }
  }
}
