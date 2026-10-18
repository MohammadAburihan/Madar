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
import { LeaveBalance } from '../data-access/workers.models';
import { balanceLabel, daysSummary } from './leave-view';

const COUNT_DELAY_MS = 250;

type Failure = 'permission' | 'offline' | 'balance' | 'overlap' | 'error';

/** "Request leave": an open Leave Application for a worker, sent to their leave approver. */
@Component({
  selector: 'app-leave-form',
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
      <button type="button" class="md-btn" (click)="loadWorkers()">{{ txt.retry }}</button>
    } @else {
      <app-select-field
        [label]="txt.worker"
        [options]="workerOptions()"
        [placeholder]="txt.worker"
        [value]="worker() || null"
        [disabled]="locked()"
        (valueChange)="setWorker($event ?? '')"
      />
      @if (errors?.worker) {
        <p class="muted" role="alert">{{ txt.workerError }}</p>
      }
      @if (worker()) {
        @if (balancesFailed()) {
          <app-feedback-card tone="danger" [title]="txt.type" [message]="txt.typesFailed" />
          <button type="button" class="md-btn" [disabled]="locked()" (click)="loadBalances()">
            {{ txt.retry }}
          </button>
        } @else if (balances()?.length === 0) {
          <app-feedback-card tone="warning" [title]="txt.type" [message]="txt.noTypes" />
        } @else {
          <app-select-field
            [label]="txt.type"
            [options]="typeOptions()"
            [placeholder]="txt.type"
            [value]="leaveType() || null"
            [disabled]="locked()"
            (valueChange)="leaveType.set($event ?? '')"
          />
          @if (errors?.leaveType) {
            <p class="muted" role="alert">{{ txt.typeError }}</p>
          }
        }
      }
      <app-text-field
        [label]="txt.from"
        [readonly]="locked()"
        type="date"
        [value]="from()"
        (valueChange)="from.set($event)"
      />
      <app-text-field
        [label]="txt.to"
        [readonly]="locked()"
        type="date"
        [error]="errors?.dates ? txt.datesError : null"
        [value]="to()"
        (valueChange)="to.set($event)"
      />
      <app-text-field
        [label]="txt.reason"
        [readonly]="locked()"
        [value]="reason()"
        (valueChange)="reason.set($event)"
      />
      @if (summary(); as s) {
        <app-text-field [label]="txt.days" [readonly]="true" [value]="s" />
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
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="sending()"
          (click)="send()"
        >
          {{ sending() ? txt.sending : txt.send }}
        </button>
      }
    }
  `,
})
export class LeaveFormContainer {
  /** Optional: the worker it was opened for. */
  readonly workerParam = input<string | undefined>(undefined, { alias: 'worker' });

  private readonly api = inject(LeaveApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().manageWorkers);
  private readonly workers = signal<{ id: string; name: string }[]>([]);
  protected readonly worker = signal('');
  protected readonly balances = signal<LeaveBalance[] | null>(null);
  protected readonly leaveType = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly reason = signal('');
  private readonly days = signal<number | null>(null);
  private readonly today = signal('');
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly sending = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failed = signal<Failure | null>(null);
  protected readonly unresolved = signal(false);
  protected readonly checking = signal(false);
  protected readonly pending = signal(false);
  protected readonly notCreated = signal(false);
  private readonly reference = newReference('LEV');
  private balanceRun = 0;
  /** An answer was lost under this reference: that try may still land, so the details stay as sent. */
  private readonly lost = signal(false);
  protected readonly locked = computed(() => this.unresolved() || this.lost() || this.sending());
  protected readonly balancesFailed = signal(false);

  protected readonly invalid = computed(() => {
    const errors = {
      worker: !this.worker(),
      leaveType: !this.leaveType(),
      dates: !this.from() || !this.to() || this.to() < this.from(),
    };
    return Object.values(errors).some(Boolean) ? errors : null;
  });

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('workers.back'),
      title: t('workers.leave.form.title'),
      subtitle: t('workers.leave.form.subtitle'),
      worker: t('workers.leave.form.worker'),
      workerError: t('workers.leave.form.workerError'),
      type: t('workers.leave.form.type'),
      typeError: t('workers.leave.form.typeError'),
      noTypes: t('workers.leave.form.noTypes'),
      typesFailed: t('workers.leave.form.typesFailed'),
      from: t('workers.leave.form.from'),
      to: t('workers.leave.form.to'),
      datesError: t('workers.leave.form.datesError'),
      reason: t('workers.leave.form.reason'),
      days: t('workers.leave.form.days'),
      send: t('workers.leave.form.send'),
      sending: t('workers.leave.form.sending'),
      loading: t('workers.loading'),
      retry: t('workers.retry'),
      loadFailed: t('workers.error.title'),
      optionsFailed: t('workers.leave.form.optionsFailed'),
      check: t('sale.checking.check'),
      checking: t('sale.checking.checkingNow'),
      pending: t('sale.checking.pending'),
      noAccess: block('workers.noAccess'),
      notCreated: block('workers.leave.form.notCreated'),
      unresolved: {
        title: t('workers.leave.form.unresolved.title'),
        message: t('workers.leave.form.unresolved.message', { reference: this.reference }),
      },
      failed: {
        permission: block('workers.leave.form.failed.permission'),
        offline: block('workers.leave.form.failed.offline'),
        balance: block('workers.leave.form.failed.balance'),
        overlap: block('workers.leave.form.failed.overlap'),
        error: block('workers.leave.form.failed.error'),
      },
    };
  });

  protected readonly workerOptions = computed(() =>
    this.workers().map((w) => ({ value: w.id, label: w.name })),
  );

  protected readonly typeOptions = computed(() =>
    (this.balances() ?? []).map((b) => ({ value: b.type, label: balanceLabel(b, this.i18n.tr()) })),
  );

  private readonly left = computed(
    () => this.balances()?.find((b) => b.type === this.leaveType())?.left ?? null,
  );

  protected readonly summary = computed(() => {
    const days = this.days();
    return days === null ? null : daysSummary(days, this.left(), this.i18n.tr());
  });

  constructor() {
    effect(() => {
      if (this.allowed()) {
        untracked(() => void this.loadWorkers());
      }
    });
    effect((onCleanup) => {
      const worker = this.worker();
      const from = this.from();
      const timer = setTimeout(
        () => untracked(() => void this.loadBalances(worker, from)),
        COUNT_DELAY_MS,
      );
      onCleanup(() => clearTimeout(timer));
    });
    // Frappe HR counts the days (holidays aside), once the worker, type and dates are known.
    effect((onCleanup) => {
      const worker = this.worker();
      const type = this.leaveType();
      const from = this.from();
      const to = this.to();
      this.days.set(null);
      if (!worker || !type || !from || !to || to < from) {
        return;
      }
      let current = true;
      const timer = setTimeout(() => {
        this.api
          .days(worker, type, from, to)
          .then((days) => current && this.days.set(days))
          .catch(() => undefined);
      }, COUNT_DELAY_MS);
      onCleanup(() => {
        current = false;
        clearTimeout(timer);
      });
    });
  }

  protected async loadWorkers(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        throw new Error('No active business');
      }
      const workers = await this.api.workers(business);
      const today = toIsoDate(this.clock.now());
      this.today.set(today);
      this.workers.set(workers);
      if (!this.from()) {
        this.from.set(today);
        this.to.set(today);
      }
      const wanted = this.workerParam();
      if (!this.worker() && wanted && workers.some((w) => w.id === wanted)) {
        this.setWorker(wanted);
      }
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** A worker's leave types are their own: choosing another clears the type until theirs are read. */
  protected setWorker(id: string): void {
    if (this.locked() || id === this.worker()) {
      return;
    }
    this.worker.set(id);
    this.leaveType.set('');
    // The last worker's types must not stay pickable while the new worker's load.
    this.balanceRun++;
    this.balances.set(null);
  }

  /** The worker's leave types as of the leave's start: allocations cover their own period. */
  protected async loadBalances(worker = this.worker(), from = this.from()): Promise<void> {
    // The type sent stays as sent once an answer was lost; a send still running doesn't stop a reload.
    if (this.unresolved() || this.lost()) {
      return;
    }
    const run = ++this.balanceRun;
    this.balances.set(null);
    this.balancesFailed.set(false);
    if (!worker) {
      return;
    }
    try {
      const balances = await this.api.balances(worker, from || this.today());
      if (run !== this.balanceRun) {
        return;
      }
      this.balances.set(balances);
      if (!balances.some((b) => b.type === this.leaveType())) {
        // One allocated type is the usual case: chosen, unpaid leave still on offer.
        const allocated = balances.filter((b) => b.left !== null);
        this.leaveType.set(allocated.length === 1 ? allocated[0].type : '');
      }
    } catch (error) {
      if (run === this.balanceRun) {
        // Only a role that can't read them has none to offer; anything else can be tried again.
        if (ErpnextError.from(error).kind === 'forbidden') {
          this.balances.set([]);
        } else {
          this.balancesFailed.set(true);
        }
      }
    }
  }

  protected async send(): Promise<void> {
    this.showErrors.set(true);
    if (this.invalid() || this.sending() || this.unresolved()) {
      return;
    }
    this.sending.set(true);
    this.failed.set(null);
    this.notCreated.set(false);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const id = await this.api.requestLeave(
        {
          worker: this.worker(),
          leaveType: this.leaveType(),
          from: this.from(),
          to: this.to(),
          reason: this.reason(),
        },
        this.reference,
        this.today(),
        business,
      );
      void this.router.navigate(['/workers/leave', id], { replaceUrl: true });
    } catch (error) {
      if (error instanceof UnresolvedError) {
        this.lost.set(true);
        this.unresolved.set(true);
      } else {
        const e = ErpnextError.from(error);
        if (e.kind === 'forbidden') {
          // A 403 is also what an expired session gets; the shell then asks to sign in again.
          void this.session.checkExpired();
        }
        this.failed.set(
          e.kind === 'forbidden'
            ? 'permission'
            : e.kind === 'offline'
              ? 'offline'
              : e.excType === 'InsufficientLeaveBalanceError'
                ? 'balance'
                : e.excType === 'OverlapError'
                  ? 'overlap'
                  : 'error',
        );
      }
    } finally {
      this.sending.set(false);
    }
  }

  protected async check(): Promise<void> {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    this.pending.set(false);
    try {
      const found = await this.api.find(this.reference);
      this.unresolved.set(false);
      if (found) {
        void this.router.navigate(['/workers/leave', found], { replaceUrl: true });
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
    void this.router.navigate(worker ? ['/workers', worker] : ['/workers/leave']);
  }
}
