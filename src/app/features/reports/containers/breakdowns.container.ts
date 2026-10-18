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
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { ProfitCardComponent } from '../components/profit-card.component';
import {
  Breakdown,
  BreakdownsApiService,
  PeopleFigures,
} from '../data-access/breakdowns-api.service';
import { DateRange } from '../data-access/report.models';
import { breakdownCard, breakdownSummary } from './breakdowns-view';
import { createPeriod } from './period';
import { rangeText } from './reports-view';

interface Figures {
  range: DateRange;
  items: Breakdown;
  customers: Breakdown;
  suppliers: Breakdown;
  stock: Breakdown | null;
  people: PeopleFigures | null;
}

/** Where the period's sales and purchases came from and went to, and where the stock sits (Owner). */
@Component({
  selector: 'app-breakdowns',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    ProfitCardComponent,
    SelectFieldComponent,
    TextFieldComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    .dates {
      display: flex;
      gap: 12px;
    }
  `,
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="router.navigate(['/reports'])" />
    <app-page-heading [title]="txt.title" [subtitle]="subtitle()" />
    @if (!caps().seeReports) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      <app-select-field
        [label]="txt.period"
        [options]="period.options()"
        [value]="period.kind()"
        (valueChange)="period.setKind($event)"
      />
      @if (period.kind() === 'custom') {
        <div class="dates">
          <app-text-field
            [label]="txt.from"
            type="date"
            [value]="period.range().from"
            (valueChange)="period.setCustom('from', $event)"
          />
          <app-text-field
            [label]="txt.to"
            type="date"
            [value]="period.range().to"
            [error]="period.error()"
            (valueChange)="period.setCustom('to', $event)"
          />
        </div>
      }
      @if (state() === 'error') {
        <app-feedback-card tone="danger" [title]="txt.error.title" [message]="txt.error.message" />
        <button type="button" class="md-btn" (click)="reload()">{{ txt.retry }}</button>
      } @else if (view(); as v) {
        <app-profit-card
          [label]="v.summary.label"
          [amount]="v.summary.amount"
          [rows]="v.summary.rows"
        />
        @for (card of v.cards; track card.key) {
          <app-totals-card density="compact" [heading]="card.heading" [rows]="card.rows" />
        }
        <p class="muted">{{ txt.note }}</p>
      } @else if (period.usable()) {
        <p class="muted" role="status">{{ txt.loading }}</p>
      }
    }
  `,
})
export class BreakdownsContainer {
  private readonly api = inject(BreakdownsApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  private readonly today = signal<Date | null>(null);
  protected readonly period = createPeriod(this.today, this.i18n.tr, this.i18n.language);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly figures = signal<Figures | null>(null);
  private run = 0;

  protected readonly subtitle = computed(() =>
    this.i18n.tr().t('reports.breakdowns.subtitle', {
      business: this.business.active()?.name ?? '',
      period: rangeText(this.period.range(), this.i18n.language()),
    }),
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('reports.title'),
      title: t('reports.breakdowns.title'),
      period: t('reports.period.label'),
      from: t('reports.period.from'),
      to: t('reports.period.to'),
      note: t('reports.breakdowns.note'),
      loading: t('reports.breakdowns.loading'),
      retry: t('reports.retry'),
      error: {
        title: t('reports.breakdowns.error.title'),
        message: t('reports.breakdowns.error.message'),
      },
      noAccess: { title: t('reports.noAccess.title'), message: t('reports.noAccess.message') },
    };
  });

  protected readonly view = computed(() => {
    const f = this.figures();
    const range = this.period.range();
    // Figures for other dates than the ones chosen are not shown as theirs.
    if (
      !f ||
      this.state() !== 'ready' ||
      !this.period.usable() ||
      f.range.from !== range.from ||
      f.range.to !== range.to
    ) {
      return null;
    }
    const tr = this.i18n.tr();
    const currency = this.business.active()?.currency ?? '';
    return {
      summary: breakdownSummary(f.items, f.suppliers, f.stock, f.people, currency, tr),
      cards: [
        breakdownCard('items', f.items, currency, tr),
        breakdownCard('customers', f.customers, currency, tr),
        breakdownCard('suppliers', f.suppliers, currency, tr),
        ...(f.stock ? [breakdownCard('stock', f.stock, currency, tr)] : []),
      ],
    };
  });

  constructor() {
    void this.clock
      .ensure()
      .then(() => this.today.set(this.clock.now()))
      .catch(() => this.state.set('error'));
    effect(() => {
      this.period.range();
      if (this.today() && this.period.usable() && this.caps().seeReports) {
        untracked(() => void this.load());
      }
    });
  }

  /** Reads the site's today again; the new date reloads the figures. */
  protected reload(): void {
    void this.clock
      .ensure()
      .then(() => this.today.set(this.clock.now()))
      .catch(() => this.state.set('error'));
  }

  private async load(): Promise<void> {
    const run = ++this.run;
    const range = this.period.range();
    this.state.set('loading');
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const company = business.name;
      const [items, customers, suppliers, stock, people] = await Promise.all([
        this.api.salesByItem(company, range),
        this.api.salesByCustomer(company, range),
        this.api.purchasesBySupplier(company, range),
        this.api.stockByWarehouse(company),
        // Without an HR role ERPNext narrows slips and attendance to the user's own: not the business's.
        this.caps().manageWorkers ? this.api.people(company, range) : Promise.resolve(null),
      ]);
      if (run === this.run) {
        this.figures.set({ range, items, customers, suppliers, stock, people });
        this.state.set('ready');
      }
    } catch {
      if (run === this.run) {
        this.state.set('error');
      }
    }
  }
}
