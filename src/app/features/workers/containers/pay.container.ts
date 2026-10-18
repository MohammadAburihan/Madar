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
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { toIsoDate } from '../../../core/format/format';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { FilterChipsComponent } from '../../../shared/ui/filter-chips.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { PersonCardComponent } from '../../../shared/ui/person-card.component';
import { PayrollApiService } from '../data-access/payroll-api.service';
import { PayRow } from '../data-access/workers.models';
import { monthLabel, payActions, payCard } from './pay-view';

/** Pay: the month's salary slips, made from each worker's salary and confirmed. */
@Component({
  selector: 'app-pay',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    FilterChipsComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    PersonCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    @let acts = actions();
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
      @if (months().length) {
        <app-filter-chips [label]="txt.title" [options]="monthOptions()" [(value)]="month" />
      }
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
            (picked)="open(card.id)"
          />
        } @empty {
          <p class="muted">{{ txt.empty }}</p>
        }
        @if (done(); as d) {
          <app-feedback-card tone="tint" [title]="d" message="" />
        }
        @if (refused().length) {
          <app-feedback-card tone="danger" [title]="txt.failed.title" [message]="refusedText()" />
        }
        @if (unresolved()) {
          <app-feedback-card
            tone="warning"
            [title]="txt.unresolved.title"
            [message]="txt.unresolved.message"
          />
        }
        @if (acts.drafts) {
          <button
            type="button"
            class="md-btn md-btn--primary"
            [disabled]="working()"
            (click)="confirmDrafts()"
          >
            {{ working() ? txt.working : acts.confirm }}
          </button>
        }
        @if (acts.toMake) {
          <button
            type="button"
            class="md-btn"
            [class.md-btn--primary]="!acts.drafts"
            [disabled]="working()"
            (click)="makeSlips()"
          >
            {{ working() ? txt.working : acts.make }}
          </button>
        }
        <p class="muted">{{ txt.note }}</p>
      }
    }
  `,
})
export class PayContainer {
  private readonly api = inject(PayrollApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().manageWorkers);
  /** This month and the last, by the site's clock. */
  protected readonly months = signal<string[]>([]);
  protected readonly month = signal<string>('');
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly rows = signal<PayRow[]>([]);
  protected readonly working = signal(false);
  protected readonly done = signal<string | null>(null);
  protected readonly refused = signal<string[]>([]);
  protected readonly unresolved = signal(false);
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('workers.back'),
      title: t('workers.payroll.title', {
        month: this.month() ? monthLabel(this.month(), this.i18n.language()) : '',
      }),
      subtitle: t('workers.payroll.subtitle', { business: this.business.active()?.name ?? '' }),
      loading: t('workers.payroll.loading'),
      empty: t('workers.payroll.empty'),
      working: t('workers.payroll.working'),
      note: t('workers.payroll.note'),
      retry: t('workers.retry'),
      error: block('workers.payroll.error'),
      failed: { title: t('workers.payroll.failed.title') },
      unresolved: block('workers.payroll.unresolved'),
      noAccess: block('workers.noAccess'),
    };
  });

  protected readonly monthOptions = computed(() =>
    this.months().map((m) => ({ value: m, label: monthLabel(m, this.i18n.language()) })),
  );

  protected readonly cards = computed(() =>
    this.rows().map((r) => payCard(r, this.business.active()?.currency ?? '', this.i18n.tr())),
  );

  protected readonly actions = computed(() => payActions(this.rows(), this.i18n.tr()));

  protected readonly refusedText = computed(() =>
    this.i18n.tr().t('workers.payroll.failed.message', {
      workers: this.refused().join(this.i18n.language() === 'ar' ? '، ' : ', '),
    }),
  );

  constructor() {
    effect(() => {
      if (this.allowed()) {
        untracked(() => void this.start());
      }
    });
    effect(() => {
      const month = this.month();
      if (month) {
        untracked(() => {
          this.done.set(null);
          this.refused.set([]);
          this.unresolved.set(false);
          void this.load();
        });
      }
    });
  }

  private async start(): Promise<void> {
    await this.clock.ensure();
    const now = this.clock.now();
    const current = toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const last = toIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    this.months.set([current, last]);
    if (!this.month()) {
      this.month.set(current);
    }
  }

  protected async load(): Promise<void> {
    const run = ++this.run;
    const month = this.month();
    this.state.set('loading');
    this.rows.set([]);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const rows = await this.api.month(month, business);
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

  protected open(id: string): void {
    const row = this.rows().find((r) => r.id === id);
    void this.router.navigate(
      row?.hasSalary ? ['/workers', id] : ['/workers/salary/new'],
      row?.hasSalary ? {} : { queryParams: { worker: id } },
    );
  }

  protected makeSlips(): Promise<void> {
    return this.each(
      this.rows().filter((r) => r.hasSalary && !r.slip),
      (row, month, business) => this.api.makeSlip(row.id, month, business),
      'workers.payroll.done.made',
    );
  }

  protected confirmDrafts(): Promise<void> {
    return this.each(
      this.rows().filter((r) => r.slip && !r.slip.confirmed),
      (row) => this.api.confirmSlip(row.slip!.name),
      'workers.payroll.done.confirmed',
    );
  }

  /** Runs one step per worker, fixed before the first request; then reads the month again as ERPNext has it. */
  private async each(
    rows: PayRow[],
    step: (
      row: PayRow,
      month: string,
      business: NonNullable<Awaited<ReturnType<BusinessService['ensure']>>>,
    ) => Promise<void>,
    doneKey: string,
  ): Promise<void> {
    if (this.working() || !rows.length) {
      return;
    }
    const month = this.month();
    this.working.set(true);
    this.done.set(null);
    this.refused.set([]);
    this.unresolved.set(false);
    const refused: string[] = [];
    let unresolved = false;
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      for (const row of rows) {
        try {
          await step(row, month, business);
        } catch (error) {
          if (error instanceof UnresolvedError) {
            unresolved = true;
          } else {
            if (ErpnextError.from(error).kind === 'forbidden') {
              void this.session.checkExpired();
            }
            refused.push(row.name);
          }
        }
      }
    } catch {
      refused.push(...rows.map((r) => r.name));
    } finally {
      this.working.set(false);
    }
    if (month !== this.month()) {
      return;
    }
    this.refused.set(refused);
    this.unresolved.set(unresolved);
    if (!refused.length && !unresolved) {
      this.done.set(this.i18n.tr().t(doneKey));
    }
    await this.load();
  }
}
