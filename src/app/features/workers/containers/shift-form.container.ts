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
import { toIsoDate } from '../../../core/format/format';
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
import { ShiftApiService } from '../data-access/shift-api.service';
import { ShiftFormValue, ShiftType } from '../data-access/workers.models';
import { shiftLabel } from './shift-view';

type Failure = 'permission' | 'offline' | 'overlap' | 'error';

/** "Assign shift": the shift a worker works from a date, as a submitted Shift Assignment. */
@Component({
  selector: 'app-shift-form',
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
        (valueChange)="worker.set($event ?? '')"
      />
      @if (errors?.worker) {
        <p class="muted" role="alert">{{ txt.workerError }}</p>
      }
      @if (!shifts().length) {
        <app-feedback-card tone="warning" [title]="txt.shift" [message]="txt.noShifts" />
      } @else {
        <app-select-field
          [label]="txt.shift"
          [options]="shiftOptions()"
          [placeholder]="txt.shift"
          [value]="shift() || null"
          (valueChange)="shift.set($event ?? '')"
        />
        @if (errors?.shift) {
          <p class="muted" role="alert">{{ txt.shiftError }}</p>
        }
      }
      <app-text-field
        [label]="txt.from"
        type="date"
        [value]="from()"
        (valueChange)="from.set($event)"
      />
      <app-text-field
        [label]="txt.until"
        type="date"
        [hint]="txt.untilHint"
        [error]="errors?.dates ? txt.datesError : null"
        [value]="until()"
        (valueChange)="until.set($event)"
      />
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
export class ShiftFormContainer {
  /** Optional: the worker it was opened for. */
  readonly workerParam = input<string | undefined>(undefined, { alias: 'worker' });

  private readonly api = inject(ShiftApiService);
  private readonly leave = inject(LeaveApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().manageWorkers);
  private readonly workers = signal<{ id: string; name: string }[]>([]);
  protected readonly shifts = signal<ShiftType[]>([]);
  protected readonly worker = signal('');
  protected readonly shift = signal('');
  protected readonly from = signal('');
  protected readonly until = signal('');
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failed = signal<Failure | null>(null);
  protected readonly unresolved = signal(false);
  protected readonly checking = signal(false);
  protected readonly pending = signal(false);
  protected readonly notCreated = signal(false);
  /** What was sent when the answer was lost: checking looks for exactly that. */
  private sent: ShiftFormValue | null = null;

  protected readonly invalid = computed(() => {
    const errors = {
      worker: !this.worker(),
      shift: !this.shift(),
      dates: !this.from() || (!!this.until() && this.until() < this.from()),
    };
    return Object.values(errors).some(Boolean) ? errors : null;
  });

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    const f = (key: string) => t(`workers.shift.form.${key}`);
    return {
      back: t('workers.back'),
      title: f('title'),
      subtitle: f('subtitle'),
      worker: f('worker'),
      workerError: f('workerError'),
      shift: f('shift'),
      shiftError: f('shiftError'),
      noShifts: f('noShifts'),
      from: f('from'),
      until: f('until'),
      untilHint: f('untilHint'),
      datesError: f('datesError'),
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
      notCreated: block('workers.shift.form.notCreated'),
      unresolved: block('workers.shift.form.unresolved'),
      failed: {
        permission: block('workers.shift.form.failed.permission'),
        offline: block('workers.shift.form.failed.offline'),
        overlap: block('workers.shift.form.failed.overlap'),
        error: block('workers.shift.form.failed.error'),
      },
    };
  });

  protected readonly workerOptions = computed(() =>
    this.workers().map((w) => ({ value: w.id, label: w.name })),
  );

  protected readonly shiftOptions = computed(() =>
    this.shifts().map((s) => ({ value: s.name, label: shiftLabel(s) })),
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
      const [workers, shifts] = await Promise.all([
        this.leave.workers(business),
        this.api.shiftTypes(),
      ]);
      this.workers.set(workers);
      this.shifts.set(shifts);
      if (!this.from()) {
        this.from.set(toIsoDate(this.clock.now()));
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
    const value: ShiftFormValue = {
      worker: this.worker(),
      shift: this.shift(),
      from: this.from(),
      until: this.until(),
    };
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      await this.api.assign(value, business);
      void this.router.navigate(['/workers', value.worker], { replaceUrl: true });
    } catch (error) {
      if (error instanceof UnresolvedError) {
        this.sent = value;
        this.unresolved.set(true);
      } else {
        const e = ErpnextError.from(error);
        this.failed.set(
          e.kind === 'forbidden'
            ? 'permission'
            : e.kind === 'offline'
              ? 'offline'
              : e.excType === 'OverlappingShiftError' || e.excType === 'MultipleShiftError'
                ? 'overlap'
                : 'error',
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
      const found = await this.api.find(this.sent);
      this.unresolved.set(false);
      if (found) {
        void this.router.navigate(['/workers', this.sent.worker], { replaceUrl: true });
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
