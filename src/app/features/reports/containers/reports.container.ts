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
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { FilterChipsComponent } from '../../../shared/ui/filter-chips.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { MetricCardsComponent } from '../components/metric-cards.component';
import { MoneyCardComponent } from '../components/money-card.component';
import { ProfitCardComponent } from '../components/profit-card.component';
import { DateRange, PeriodFigures } from '../data-access/report.models';
import { ReportsApiService } from '../data-access/reports-api.service';
import {
  PERIOD_KINDS,
  PeriodKind,
  lastThreeMonths,
  metrics,
  money,
  monthRows,
  monthsOf,
  moneyView,
  periodOptions,
  periodRange,
  profitRows,
  validRange,
} from './reports-view';

/** Reports: profit and money in and out for a period, as posted in ERPNext (owner only). */
@Component({
  selector: 'app-reports',
  imports: [
    DataTableComponent,
    FeedbackCardComponent,
    FilterChipsComponent,
    LanguageSwitcherComponent,
    MetricCardsComponent,
    MoneyCardComponent,
    PageHeadingComponent,
    ProfitCardComponent,
    SelectFieldComponent,
    TextFieldComponent,
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

    :host(.desktop) h2 {
      font-size: 18px;
    }

    .period {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 24px;
    }

    .dates {
      display: flex;
      gap: 12px;
    }
  `,
  template: `
    @let txt = text();
    @if (desktop()) {
      <app-page-heading layout="desktop" [title]="txt.title" [subtitle]="txt.subtitle" />
    }
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    @if (!desktop()) {
      <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    }
    @if (!caps().seeReports) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      @if (desktop()) {
        <div class="period">
          <app-filter-chips
            [label]="txt.period"
            [options]="txt.kinds"
            [value]="kind()"
            (valueChange)="setKind($event)"
          />
          <div class="dates">
            <app-text-field
              [label]="txt.from"
              type="date"
              [value]="range().from"
              (valueChange)="setCustom('from', $event)"
            />
            <app-text-field
              [label]="txt.to"
              type="date"
              [value]="range().to"
              [error]="rangeError()"
              (valueChange)="setCustom('to', $event)"
            />
          </div>
        </div>
      } @else {
        <app-select-field
          [label]="txt.period"
          [options]="options()"
          [value]="kind()"
          (valueChange)="setKind($event)"
        />
        @if (kind() === 'custom') {
          <div class="dates">
            <app-text-field
              [label]="txt.from"
              type="date"
              [value]="range().from"
              (valueChange)="setCustom('from', $event)"
            />
            <app-text-field
              [label]="txt.to"
              type="date"
              [value]="range().to"
              [error]="rangeError()"
              (valueChange)="setCustom('to', $event)"
            />
          </div>
        }
      }
      @if (state() === 'error') {
        <app-feedback-card
          tone="danger"
          [title]="txt.loadFailed.title"
          [message]="txt.loadFailed.message"
        />
        <button type="button" class="md-btn" (click)="reload()">{{ txt.retry }}</button>
      } @else if (view(); as v) {
        @if (desktop()) {
          <app-metric-cards [metrics]="v.metrics" />
          <h2>{{ txt.byMonth }}</h2>
          <app-data-table
            [label]="txt.byMonth"
            [headers]="txt.headers"
            [rows]="v.monthRows"
            [ltrColumns]="[1, 2, 3, 4, 5, 6]"
          />
        } @else {
          <app-profit-card
            [label]="txt.profit"
            [amount]="v.profit"
            [rows]="v.profitRows"
            [link]="txt.profitByMonth"
            (linkSelected)="openProfit()"
          />
          <h2>{{ txt.money }}</h2>
          <app-money-card
            [view]="v.money"
            [text]="txt.moneyText"
            (linkSelected)="router.navigate(['/money'])"
          />
        }
        <p class="muted">{{ txt.note }}</p>
      } @else {
        <p class="muted" role="status">{{ txt.loading }}</p>
      }
    }
  `,
})
export class ReportsContainer {
  private readonly api = inject(ReportsApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly kind = signal<PeriodKind>('thisMonth');
  private readonly custom = signal<DateRange | null>(null);
  private readonly today = signal<Date | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly figures = signal<PeriodFigures | null>(null);
  private readonly months = signal<PeriodFigures[]>([]);
  private run = 0;

  protected readonly range = computed(() =>
    periodRange(this.kind(), this.today() ?? new Date(), this.custom()),
  );
  protected readonly rangeError = computed(() =>
    this.kind() === 'custom' && !validRange(this.custom())
      ? this.i18n.tr().t('reports.period.invalid')
      : null,
  );
  protected readonly options = computed(() =>
    periodOptions(this.today() ?? new Date(), this.custom(), this.i18n.language(), this.i18n.tr()),
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const currency = this.business.active()?.currency ?? '';
    return {
      title: t('reports.title'),
      subtitle: t('reports.subtitle', { business: this.business.active()?.name ?? '' }),
      period: t('reports.period.label'),
      kinds: PERIOD_KINDS.map((kind) => ({ value: kind, label: t(`reports.period.${kind}`) })),
      from: t('reports.period.from'),
      to: t('reports.period.to'),
      profit: t('reports.profit'),
      profitByMonth: t('reports.profitByMonth'),
      money: t('reports.money'),
      byMonth: t('reports.byMonth', { currency }),
      headers: [
        t('reports.headers.month'),
        t('reports.headers.income'),
        t('reports.headers.costOfGoods'),
        t('reports.headers.expenses'),
        t('reports.headers.profit'),
        t('reports.headers.moneyIn'),
        t('reports.headers.moneyOut'),
      ],
      moneyText: {
        moneyIn: t('reports.moneyIn'),
        moneyOut: t('reports.moneyOut'),
        net: t('reports.net'),
        byAccount: t('reports.byAccount'),
        in: t('reports.in'),
        out: t('reports.out'),
        noAccounts: t('reports.noAccounts'),
        lastMonths: t('reports.lastMonths', { currency }),
        link: t('reports.payments'),
      },
      note: t('reports.note'),
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
    const figures = this.figures();
    if (!figures || this.state() !== 'ready') {
      return null;
    }
    const tr = this.i18n.tr();
    const language = this.i18n.language();
    const currency = this.business.active()?.currency ?? '';
    const today = this.today() ?? new Date();
    return {
      profit: money(figures.profit, currency),
      profitRows: profitRows(figures, currency, tr),
      money: moneyView(figures, this.months(), currency, language),
      metrics: metrics(figures, currency, tr),
      monthRows: monthRows(this.months(), today, language, tr),
    };
  });

  constructor() {
    // Periods follow the site's today, which may differ from the device's.
    void this.clock
      .ensure()
      .then(() => this.today.set(this.clock.now()))
      .catch(() => this.state.set('error'));
    effect(() => {
      if (!this.today()) {
        return;
      }
      const range = this.range();
      const desktop = this.desktop();
      const allowed = this.caps().seeReports;
      const usable = this.kind() !== 'custom' || validRange(this.custom());
      if (allowed && usable) {
        untracked(() => void this.load(range, desktop));
      }
    });
  }

  protected setKind(kind: string | null): void {
    if (!kind || !PERIOD_KINDS.includes(kind as PeriodKind)) {
      return;
    }
    if (kind === 'custom' && !this.custom()) {
      // Start from the period shown, so switching to Custom changes nothing until a date does.
      this.custom.set(this.range());
    }
    this.kind.set(kind as PeriodKind);
  }

  protected setCustom(end: 'from' | 'to', value: string): void {
    this.custom.set({ ...this.range(), [end]: value });
    this.kind.set('custom');
  }

  protected reload(): void {
    if (!this.today()) {
      void this.clock
        .ensure()
        .then(() => this.today.set(this.clock.now()))
        .catch(() => this.state.set('error'));
      return;
    }
    void this.load(this.range(), this.desktop());
  }

  protected openProfit(): void {
    void this.router.navigate(['/reports/profit'], { queryParams: { to: this.range().to } });
  }

  private async load(range: DateRange, desktop: boolean): Promise<void> {
    const run = ++this.run;
    this.state.set('loading');
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No business');
      }
      const months = desktop ? monthsOf(range) : lastThreeMonths(range);
      const [figures, ...monthly] = await Promise.all([
        this.api.figures(business.name, range),
        ...months.map((m) => this.api.figures(business.name, m)),
      ]);
      if (run === this.run) {
        this.figures.set(figures);
        this.months.set(monthly);
        this.state.set('ready');
      }
    } catch {
      if (run === this.run) {
        this.state.set('error');
      }
    }
  }
}
