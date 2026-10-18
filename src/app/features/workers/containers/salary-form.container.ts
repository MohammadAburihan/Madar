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
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { formatMoney, toIsoDate } from '../../../core/format/format';
import { parseNumber, round2 } from '../../../core/format/number';
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
import { PayrollApiService, SalaryExistsError } from '../data-access/payroll-api.service';
import { SalaryFormValue } from '../data-access/workers.models';

type Failure =
  | 'permission'
  | 'offline'
  | 'setup'
  | 'structure'
  | 'structureCancelled'
  | 'structureInactive'
  | 'error';

/** "Set salary": the monthly salary a worker's slips are made from, from a date. */
@Component({
  selector: 'app-salary-form',
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
        [disabled]="unresolved()"
        (valueChange)="worker.set($event ?? '')"
      />
      @if (missingWorker()) {
        <p class="muted" role="status">{{ txt.missingWorker }}</p>
      }
      @if (errors?.worker) {
        <p class="muted" role="alert">{{ txt.workerError }}</p>
      }
      <app-text-field
        [label]="txt.monthly"
        inputmode="decimal"
        [ltr]="true"
        [suffix]="currency()"
        [readonly]="unresolved()"
        [error]="errors?.monthly ? txt.monthlyError : null"
        [value]="monthly()"
        (valueChange)="monthly.set($event)"
      />
      <app-text-field
        [label]="txt.from"
        type="date"
        [readonly]="unresolved()"
        [error]="errors?.from ? txt.fromError : null"
        [value]="from()"
        (valueChange)="from.set($event)"
      />
      @if (exists() !== null) {
        <app-feedback-card tone="warning" [title]="txt.exists.title" [message]="existsText()" />
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
      } @else if (notCreated()) {
        <app-feedback-card
          tone="warning"
          [title]="txt.notCreated.title"
          [message]="txt.notCreated.message"
        />
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="saving()"
        (click)="unresolved() ? check() : save()"
      >
        {{ saving() ? txt.saving : unresolved() ? txt.check : txt.save }}
      </button>
    }
  `,
})
export class SalaryFormContainer {
  /** Optional: the worker it was opened for. */
  readonly workerParam = input<string | undefined>(undefined, { alias: 'worker' });
  /** Opened from Pay: the month it was showing, and to go back there. */
  readonly fromParam = input<string | undefined>(undefined, { alias: 'from' });
  readonly backParam = input<string | undefined>(undefined, { alias: 'back' });

  private readonly api = inject(PayrollApiService);
  private readonly leave = inject(LeaveApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().manageWorkers);
  protected readonly currency = computed(() => this.business.active()?.currency ?? '');
  private readonly workers = signal<{ id: string; name: string; joined: string }[]>([]);
  protected readonly worker = signal('');
  protected readonly monthly = signal('');
  protected readonly from = signal('');
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failed = signal<Failure | null>(null);
  /** A lost answer: saving again finds a salary already set from that date instead of a second. */
  protected readonly unresolved = signal(false);
  protected readonly pending = signal(false);
  /** A different salary already set from that date. */
  protected readonly exists = signal<number | null>(null);
  /** Opened for a worker who isn't active: say so instead of an empty field. */
  protected readonly missingWorker = signal(false);
  protected readonly notCreated = signal(false);

  private readonly joined = computed(
    () => this.workers().find((w) => w.id === this.worker())?.joined ?? '',
  );

  private readonly amount = computed(() => parseNumber(this.monthly()));

  protected readonly invalid = computed(() => {
    const errors = {
      worker: !this.worker(),
      monthly: !(this.amount() > 0),
      // ERPNext refuses a salary starting before the worker joined.
      from: !this.from() || this.from() < this.joined(),
    };
    return Object.values(errors).some(Boolean) ? errors : null;
  });

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    const f = (key: string) => t(`workers.salary.form.${key}`);
    return {
      back: t('workers.back'),
      title: f('title'),
      subtitle: f('subtitle'),
      worker: f('worker'),
      workerError: f('workerError'),
      monthly: f('monthly'),
      monthlyError: f('monthlyError'),
      from: f('from'),
      fromError: f('fromError'),
      save: f('save'),
      saving: f('saving'),
      check: t('sale.checking.check'),
      pending: t('sale.checking.pending'),
      missingWorker: f('missingWorker'),
      exists: { title: f('exists.title') },
      notCreated: block('workers.salary.form.notCreated'),
      optionsFailed: f('optionsFailed'),
      loading: t('workers.loading'),
      retry: t('workers.retry'),
      loadFailed: t('workers.error.title'),
      noAccess: block('workers.noAccess'),
      unresolved: block('workers.salary.form.unresolved'),
      failed: {
        permission: block('workers.salary.form.failed.permission'),
        offline: block('workers.salary.form.failed.offline'),
        setup: block('workers.salary.form.failed.setup'),
        structure: block('workers.salary.form.failed.structure'),
        structureCancelled: block('workers.salary.form.failed.structureCancelled'),
        structureInactive: block('workers.salary.form.failed.structureInactive'),
        error: block('workers.salary.form.failed.error'),
      },
    };
  });

  protected readonly existsText = computed(() =>
    this.i18n.tr().t('workers.salary.form.exists.message', {
      amount: formatMoney(this.exists() ?? 0, this.currency()),
    }),
  );

  protected readonly workerOptions = computed(() =>
    this.workers().map((w) => ({ value: w.id, label: w.name })),
  );

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
      const workers = await this.leave.workers(business);
      this.workers.set(workers);
      if (!this.from()) {
        const now = this.clock.now();
        const month = toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
        const from = this.fromParam();
        // The month Pay was showing, or this one; never before the worker joined (ERPNext refuses that).
        const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : month;
        const joined = workers.find((w) => w.id === this.workerParam())?.joined ?? '';
        this.from.set(joined > start ? joined : start);
      }
      const wanted = this.workerParam();
      if (!this.worker() && wanted && workers.some((w) => w.id === wanted)) {
        this.worker.set(wanted);
      }
      this.missingWorker.set(!!wanted && !workers.some((w) => w.id === wanted));
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** After a lost answer: looks for the salary only; saving again is the user's call once it isn't found. */
  protected async check(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.pending.set(false);
    try {
      const found = await this.api.salaryFrom(this.worker(), this.from());
      this.unresolved.set(false);
      if (found && round2(found.base) !== round2(this.amount())) {
        this.exists.set(found.base);
      } else if (found) {
        void this.router.navigate(['/workers/pay'], { replaceUrl: true });
      } else {
        this.notCreated.set(true);
      }
    } catch {
      this.pending.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    if (this.invalid() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.failed.set(null);
    this.notCreated.set(false);
    this.exists.set(null);
    const value: SalaryFormValue = {
      worker: this.worker(),
      monthly: this.amount(),
      from: this.from(),
    };
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      await this.api.setSalary(value, business);
      this.unresolved.set(false);
      void this.router.navigate(['/workers/pay'], { replaceUrl: true });
    } catch (error) {
      if (error instanceof UnresolvedError) {
        this.unresolved.set(true);
      } else if (error instanceof SalaryExistsError) {
        this.exists.set(error.base);
      } else {
        const e = ErpnextError.from(error);
        if (e.kind === 'forbidden') {
          void this.session.checkExpired();
        }
        this.failed.set(
          e.kind === 'forbidden'
            ? 'permission'
            : e.kind === 'offline'
              ? 'offline'
              : e.excType === 'NoBasicComponent'
                ? 'setup'
                : e.excType === 'StructureNotSubmitted'
                  ? 'structure'
                  : e.excType === 'StructureCancelled'
                    ? 'structureCancelled'
                    : e.excType === 'StructureInactive'
                      ? 'structureInactive'
                      : 'error',
        );
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected back(): void {
    const worker = this.workerParam();
    void this.router.navigate(
      worker && this.backParam() !== 'pay' ? ['/workers', worker] : ['/workers/pay'],
    );
  }
}
