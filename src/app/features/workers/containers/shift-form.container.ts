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
import { formatShortDate, toIsoDate } from '../../../core/format/format';
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
import {
  RunningShift,
  ShiftApiService,
  dayAfter,
  dayBefore,
} from '../data-access/shift-api.service';
import { ShiftFormValue, ShiftType } from '../data-access/workers.models';
import { shiftLabel } from './shift-view';

type Failure = 'permission' | 'offline' | 'overlap' | 'endUnresolved' | 'error';

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
      @if (runningState() === 'loading') {
        <p class="muted" role="status">{{ txt.checkingShifts }}</p>
      } @else if (runningState() === 'error') {
        <app-feedback-card tone="danger" [title]="txt.shiftsFailed" message="" />
        <button type="button" class="md-btn" (click)="refreshRunning()">{{ txt.retry }}</button>
      }
      @for (r of runningView(); track r.name) {
        <app-feedback-card
          tone="tint"
          [title]="r.title"
          [message]="until() ? txt.runningTemporary : txt.runningNote"
        />
        <button type="button" class="md-btn" [disabled]="ending()" (click)="endRunning(r)">
          {{ ending() ? txt.saving : r.end }}
        </button>
      }
      @for (l of laterView(); track l.name) {
        <app-feedback-card tone="tint" [title]="l.title" [message]="txt.laterNote" />
      }
      @if (resumeNote(); as n) {
        <app-feedback-card tone="tint" [title]="n" message="" />
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
      } @else if (runningState() === 'ready' && !running().length && !later().length) {
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
  /** What was sent when the answer was lost: checking looks for exactly that. */
  private sent: ShiftFormValue | null = null;
  protected readonly notCreated = signal(false);
  /** Shifts still running when the new one would start: ended first, as Frappe HR refuses an overlap. */
  protected readonly running = signal<RunningShift[]>([]);
  protected readonly later = signal<(RunningShift & { from: string })[]>([]);
  protected readonly runningState = signal<'loading' | 'ready' | 'error'>('loading');
  /** The shift this form ended for a temporary one: after saving, the form opens again to put it back after. */
  private ended: { shift: string; until: string | null } | null = null;
  /** Opened to put a shift back after a temporary one. */
  readonly shiftParam = input<string | undefined>(undefined, { alias: 'shift' });
  readonly fromParam = input<string | undefined>(undefined, { alias: 'from' });
  readonly untilParam = input<string | undefined>(undefined, { alias: 'until' });
  protected readonly ending = signal(false);
  private runningRun = 0;

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
      checkingShifts: f('checkingShifts'),
      shiftsFailed: f('shiftsFailed'),
      runningTemporary: f('runningTemporary'),
      laterNote: f('laterNote'),
      unresolved: block('workers.shift.form.unresolved'),
      notCreated: block('workers.shift.form.notCreated'),
      runningNote: f('runningNote'),
      failed: {
        permission: block('workers.shift.form.failed.permission'),
        offline: block('workers.shift.form.failed.offline'),
        overlap: block('workers.shift.form.failed.overlap'),
        endUnresolved: block('workers.shift.form.failed.endUnresolved'),
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
    // Opened again on the same page to put a shift back: the link's details replace the last ones.
    effect(() => {
      const worker = this.workerParam();
      const shift = this.shiftParam();
      const from = this.fromParam();
      const until = this.untilParam();
      if (!shift || !from) {
        return;
      }
      untracked(() => {
        if (worker) {
          this.worker.set(worker);
        }
        this.shift.set(shift);
        this.from.set(from);
        this.until.set(until ?? '');
        this.failed.set(null);
        this.notCreated.set(false);
        this.showErrors.set(false);
        this.ended = null;
      });
    });
    effect((onCleanup) => {
      const worker = this.worker();
      const from = this.from();
      const until = this.until();
      const timer = setTimeout(
        () => untracked(() => void this.loadRunning(worker, from, until)),
        250,
      );
      onCleanup(() => clearTimeout(timer));
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
        const from = this.fromParam();
        this.from.set(
          from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : toIsoDate(this.clock.now()),
        );
      }
      const shift = this.shiftParam();
      if (!this.shift() && shift && shifts.some((s) => s.name === shift)) {
        this.shift.set(shift);
        this.until.set(this.untilParam() ?? '');
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

  /** "Khaled works Morning until further notice" and "End Morning on 18 Oct 2026". */
  protected readonly runningView = computed(() => {
    const { t } = this.i18n.tr();
    const language = this.i18n.language();
    const types = new Map(this.shifts().map((s) => [s.name, s]));
    const name = this.workers().find((w) => w.id === this.worker())?.name ?? '';
    return this.running().map((r) => {
      const shift = types.get(r.shift);
      const label = shift ? shiftLabel(shift) : r.shift;
      return {
        name: r.name,
        shift: r.shift,
        until: r.until,
        title: r.until
          ? t('workers.shift.form.runningUntil', {
              worker: name,
              shift: label,
              date: formatShortDate(r.until, language),
            })
          : t('workers.shift.form.runningOpen', { worker: name, shift: label }),
        end: t('workers.shift.form.endRunning', {
          shift: r.shift,
          date: formatShortDate(dayBefore(this.from()), language),
        }),
      };
    });
  });

  private async loadRunning(worker: string, from: string, until = this.until()): Promise<void> {
    const run = ++this.runningRun;
    this.running.set([]);
    this.later.set([]);
    if (!worker || !from) {
      this.runningState.set('ready');
      return;
    }
    // Save stays hidden until the worker's shifts around the dates are known.
    this.runningState.set('loading');
    try {
      const [running, later] = await Promise.all([
        this.api.running(worker, from),
        this.api.later(worker, from, until),
      ]);
      if (run === this.runningRun) {
        this.running.set(running);
        this.later.set(later);
        this.runningState.set('ready');
      }
    } catch {
      if (run === this.runningRun) {
        this.runningState.set('error');
      }
    }
  }

  protected refreshRunning(): void {
    void this.loadRunning(this.worker(), this.from());
  }

  /** "Khaled has Morning from 1 Nov 2026": the new shift has to end before it. */
  protected readonly laterView = computed(() => {
    const { t } = this.i18n.tr();
    const types = new Map(this.shifts().map((s) => [s.name, s]));
    const name = this.workers().find((w) => w.id === this.worker())?.name ?? '';
    return this.later().map((l) => {
      const shift = types.get(l.shift);
      return {
        name: l.name,
        title: t('workers.shift.form.later', {
          worker: name,
          shift: shift ? shiftLabel(shift) : l.shift,
          date: formatShortDate(l.from, this.i18n.language()),
        }),
      };
    });
  });

  /** On a form opened to put a shift back after a temporary one. */
  protected readonly resumeNote = computed(() =>
    this.shiftParam() && this.fromParam()
      ? this.i18n.tr().t('workers.shift.form.resumeNote', {
          shift: this.shiftParam(),
          date: formatShortDate(this.fromParam()!, this.i18n.language()),
        })
      : null,
  );

  /** Ends the running shift the day before the new one; the same date again is harmless, so a lost answer just retries. */
  protected async endRunning(r: {
    name: string;
    shift: string;
    until: string | null;
  }): Promise<void> {
    if (this.ending() || !this.from()) {
      return;
    }
    this.ending.set(true);
    this.failed.set(null);
    try {
      await this.api.end(r.name, dayBefore(this.from()));
      this.ended = { shift: r.shift, until: r.until };
    } catch (error) {
      if (error instanceof UnresolvedError) {
        this.failed.set('endUnresolved');
      } else {
        this.fail(error);
      }
    } finally {
      this.ending.set(false);
      await this.loadRunning(this.worker(), this.from());
    }
  }

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    if (this.invalid() || this.saving() || this.unresolved() || this.running().length) {
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
      this.afterSave(value);
    } catch (error) {
      if (error instanceof UnresolvedError) {
        this.sent = value;
        this.unresolved.set(true);
      } else {
        this.fail(error);
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** Looks for the shift a lost answer may have made; only finding it, or not, settles anything. */
  protected async check(): Promise<void> {
    const sent = this.sent;
    if (this.checking() || !sent) {
      return;
    }
    this.checking.set(true);
    this.pending.set(false);
    try {
      const found = await this.api.find(sent);
      this.unresolved.set(false);
      if (found) {
        this.afterSave(sent);
        return;
      }
      this.notCreated.set(true);
    } catch {
      this.pending.set(true);
    } finally {
      this.checking.set(false);
    }
  }

  /**
   * After a temporary shift that replaced a running one, the form opens again to put that shift back the day
   * after, ending when it used to; otherwise the worker's page.
   */
  private afterSave(value: ShiftFormValue): void {
    const ended = this.ended;
    if (value.until && ended && (!ended.until || ended.until > value.until)) {
      void this.router.navigate(['/workers/shift/new'], {
        replaceUrl: true,
        queryParams: {
          worker: value.worker,
          shift: ended.shift,
          from: dayAfter(value.until),
          ...(ended.until ? { until: ended.until } : {}),
        },
      });
      return;
    }
    void this.router.navigate(['/workers', value.worker], { replaceUrl: true });
  }

  private fail(error: unknown): void {
    const e = ErpnextError.from(error);
    if (e.kind === 'forbidden') {
      void this.session.checkExpired();
    }
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

  protected back(): void {
    const worker = this.workerParam();
    void this.router.navigate(worker ? ['/workers', worker] : ['/workers']);
  }
}
