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
import { UnresolvedError, newReference } from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { toIsoDate } from '../../../core/format/format';
import { parseNumber } from '../../../core/format/number';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { LeaveApiService } from '../data-access/leave-api.service';
import { HoursDontFitError, TimesheetApiService } from '../data-access/timesheet-api.service';
import { HoursFormValue } from '../data-access/workers.models';

type Failure = 'permission' | 'offline' | 'error';

/** "Log hours": time a worker spent, optionally on an activity and a project, as a submitted Timesheet. */
@Component({
  selector: 'app-hours-form',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    @let errors = showErrors() ? invalid() : null;
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="back()" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (!allowed()) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (loading()) {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else if (loadFailed()) {
      <app-feedback-card tone="danger" [title]="txt.loadFailed" [message]="txt.optionsFailed" />
      <button type="button" class="md-btn" (click)="loadOptions()">{{ txt.retry }}</button>
    } @else {
      <app-select-field
        [label]="txt.worker"
        [options]="workerOptions()"
        [placeholder]="txt.worker"
        [value]="worker() || null"
        [disabled]="locked()"
        (valueChange)="worker.set($event ?? '')"
      />
      @if (errors?.worker) {
        <p class="muted" role="alert">{{ txt.workerError }}</p>
      }
      <app-text-field
        [label]="txt.date"
        type="date"
        [readonly]="locked()"
        [error]="errors?.date ? txt.dateError : null"
        [value]="date()"
        (valueChange)="date.set($event)"
      />
      <app-text-field
        [label]="txt.hours"
        inputmode="decimal"
        [ltr]="true"
        [readonly]="locked()"
        [error]="errors?.hours ? txt.hoursError : null"
        [value]="hours()"
        (valueChange)="hours.set($event)"
      />
      @if (activities().length) {
        <app-select-field
          [label]="txt.activity"
          [options]="activityOptions()"
          [placeholder]="txt.activity"
          [value]="activity() || null"
          [disabled]="locked()"
          (valueChange)="activity.set($event ?? '')"
        />
        @if (errors?.activity) {
          <p class="muted" role="alert">{{ txt.activityError }}</p>
        }
      } @else {
        <app-feedback-card tone="warning" [title]="txt.activity" [message]="txt.noActivities" />
      }
      @if (projects().length) {
        <app-select-field
          [label]="txt.project"
          [options]="projectOptions()"
          [value]="project()"
          [disabled]="locked()"
          (valueChange)="project.set($event ?? '')"
        />
      }
      <app-text-field
        [label]="txt.note"
        [readonly]="locked()"
        [value]="note()"
        (valueChange)="note.set($event)"
      />
      @if (dontFit() !== null) {
        <app-feedback-card tone="warning" [title]="txt.dontFit.title" [message]="dontFitText()" />
      }
      @if (failed(); as f) {
        <app-feedback-card
          tone="danger"
          [title]="txt.failed[f].title"
          [message]="txt.failed[f].message"
        />
      }
      @if (unresolved()) {
        <app-feedback-card
          tone="warning"
          [title]="txt.unresolved.title"
          [message]="txt.unresolved.message"
        />
        @if (pending()) {
          <p class="muted" role="status">{{ txt.pending }}</p>
        }
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="checking()"
          (click)="check()"
        >
          {{ checking() ? txt.checking : txt.check }}
        </button>
      } @else {
        @if (notCreated()) {
          <app-feedback-card
            tone="warning"
            [title]="txt.notCreated.title"
            [message]="txt.notCreated.message"
          />
        }
        <button type="button" class="md-btn md-btn--primary" [disabled]="saving()" (click)="save()">
          {{ saving() ? txt.saving : txt.save }}
        </button>
      }
    }
  `,
})
export class HoursFormContainer {
  /** Optional: the worker it was opened for. */
  readonly workerParam = input<string | undefined>(undefined, { alias: 'worker' });

  private readonly api = inject(TimesheetApiService);
  private readonly leave = inject(LeaveApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().manageWorkers);
  private readonly workers = signal<{ id: string; name: string }[]>([]);
  protected readonly activities = signal<string[]>([]);
  protected readonly projects = signal<{ id: string; name: string }[]>([]);
  protected readonly worker = signal('');
  protected readonly date = signal('');
  protected readonly hours = signal('');
  protected readonly activity = signal('');
  protected readonly project = signal('');
  protected readonly note = signal('');
  private readonly today = signal('');
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failed = signal<Failure | null>(null);
  protected readonly unresolved = signal(false);
  protected readonly checking = signal(false);
  protected readonly pending = signal(false);
  protected readonly notCreated = signal(false);
  private readonly reference = newReference('TIME');
  private sent: string | null = null;
  /** Sent once with this reference: the details stay as sent, since a slow first try may still land. */
  private readonly sentOnce = signal(false);
  /** An answer was lost under this reference: that try may still land, so the details stay as sent. */
  private lost = false;
  protected readonly locked = computed(() => this.unresolved() || this.saving() || this.sentOnce());
  /** The hours left in the day after the worker's earlier logs, when the entered ones don't fit. */
  protected readonly dontFit = signal<number | null>(null);

  private readonly amount = computed(() => parseNumber(this.hours().replace(',', '.')));

  protected readonly invalid = computed(() => {
    const errors = {
      worker: !this.worker(),
      date: !this.date() || (!!this.today() && this.date() > this.today()),
      hours: !(this.amount() > 0 && this.amount() <= 24),
      // ERPNext submits a timesheet only with an activity on each log.
      activity: !this.activity(),
    };
    return Object.values(errors).some(Boolean) ? errors : null;
  });

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    const f = (key: string) => t(`workers.hours.form.${key}`);
    return {
      back: t('workers.back'),
      title: f('title'),
      subtitle: f('subtitle'),
      worker: f('worker'),
      workerError: f('workerError'),
      date: f('date'),
      dateError: f('dateError'),
      hours: f('hours'),
      hoursError: f('hoursError'),
      activity: f('activity'),
      activityError: f('activityError'),
      noActivities: f('noActivities'),
      project: f('project'),
      note: f('note'),
      save: f('save'),
      saving: f('saving'),
      optionsFailed: f('optionsFailed'),
      loading: t('workers.loading'),
      retry: t('workers.retry'),
      loadFailed: t('workers.error.title'),
      check: t('sale.checking.check'),
      checking: t('sale.checking.checkingNow'),
      pending: t('sale.checking.pending'),
      noAccess: block('workers.noAccess'),
      notCreated: block('workers.hours.form.notCreated'),
      dontFit: { title: f('dontFit.title') },
      unresolved: {
        title: f('unresolved.title'),
        message: t('workers.hours.form.unresolved.message', { reference: this.reference }),
      },
      failed: {
        permission: block('workers.hours.form.failed.permission'),
        offline: block('workers.hours.form.failed.offline'),
        error: block('workers.hours.form.failed.error'),
      },
    };
  });

  protected readonly dontFitText = computed(() =>
    this.i18n.tr().t('workers.hours.form.dontFit.message', {
      hours: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
        this.dontFit() ?? 0,
      ),
    }),
  );

  protected readonly workerOptions = computed(() =>
    this.workers().map((w) => ({ value: w.id, label: w.name })),
  );

  protected readonly activityOptions = computed(() =>
    this.activities().map((a) => ({ value: a, label: a })),
  );

  protected readonly projectOptions = computed(() => [
    { value: '', label: this.i18n.tr().t('workers.hours.form.noProject') },
    ...this.projects().map((p) => ({ value: p.id, label: p.name })),
  ]);

  constructor() {
    effect(() => {
      if (this.allowed()) {
        untracked(() => void this.loadOptions());
      }
    });
  }

  protected async loadOptions(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        throw new Error('No active business');
      }
      const [workers, options] = await Promise.all([
        this.leave.workers(business),
        this.api.options(business),
      ]);
      const today = toIsoDate(this.clock.now());
      this.today.set(today);
      this.workers.set(workers);
      this.activities.set(options.activities);
      this.projects.set(options.projects);
      if (!this.date()) {
        this.date.set(today);
      }
      const wanted = this.workerParam();
      if (!this.worker() && wanted && workers.some((w) => w.id === wanted)) {
        this.worker.set(wanted);
      }
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    if (this.invalid() || this.saving() || this.unresolved()) {
      return;
    }
    this.saving.set(true);
    this.failed.set(null);
    this.notCreated.set(false);
    this.dontFit.set(null);
    this.sentOnce.set(true);
    const value: HoursFormValue = {
      worker: this.worker(),
      date: this.date(),
      hours: this.amount(),
      activity: this.activity(),
      project: this.project(),
      note: this.note(),
    };
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      await this.api.log(value, this.reference, business);
      void this.router.navigate(['/workers', value.worker], { replaceUrl: true });
    } catch (error) {
      if (error instanceof UnresolvedError) {
        this.sent = value.worker;
        this.lost = true;
        this.unresolved.set(true);
      } else if (error instanceof HoursDontFitError) {
        // Nothing was sent this time; the details unlock only if no earlier try may still land.
        this.sentOnce.set(this.lost);
        this.dontFit.set(error.left);
      } else {
        // A definite refusal saved nothing under the reference, unless an earlier lost try still lands.
        this.sentOnce.set(this.lost);
        const e = ErpnextError.from(error);
        if (e.kind === 'forbidden') {
          void this.session.checkExpired();
        }
        this.failed.set(
          e.kind === 'forbidden' ? 'permission' : e.kind === 'offline' ? 'offline' : 'error',
        );
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async check(): Promise<void> {
    if (this.checking() || !this.sent) {
      return;
    }
    this.checking.set(true);
    this.pending.set(false);
    try {
      const found = await this.api.find(this.reference);
      this.unresolved.set(false);
      if (found) {
        void this.router.navigate(['/workers', this.sent], { replaceUrl: true });
        return;
      }
      this.notCreated.set(true);
    } catch {
      this.pending.set(true);
    } finally {
      this.checking.set(false);
    }
  }

  protected back(): void {
    const worker = this.workerParam();
    void this.router.navigate(worker ? ['/workers', worker] : ['/workers']);
  }
}
