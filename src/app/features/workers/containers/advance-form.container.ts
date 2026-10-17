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
import { formatMoney, toIsoDate } from '../../../core/format/format';
import { parseNumber } from '../../../core/format/number';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import {
  PaymentAccount,
  PaymentAccountsService,
} from '../../../core/money/payment-accounts.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { AdvanceApiService, AdvanceNotPaidError } from '../data-access/advance-api.service';
import { LeaveApiService } from '../data-access/leave-api.service';

type Failure = 'permission' | 'offline' | 'setup' | 'error';

/** "Give an advance": money paid to a worker ahead of pay, recorded and paid in one go. */
@Component({
  selector: 'app-advance-form',
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
    } @else if (!accounts().length) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccounts.title"
        [message]="txt.noAccounts.message"
      />
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
        [label]="txt.amount"
        inputmode="decimal"
        [ltr]="true"
        [suffix]="currency()"
        [readonly]="locked()"
        [error]="errors?.amount ? txt.amountError : null"
        [value]="amount()"
        (valueChange)="amount.set($event)"
      />
      <app-select-field
        [label]="txt.account"
        [options]="accountOptions()"
        [value]="mode() || null"
        [disabled]="unresolved() || saving()"
        (valueChange)="mode.set($event ?? '')"
      />
      <app-text-field
        [label]="txt.purpose"
        [readonly]="locked()"
        [error]="errors?.purpose ? txt.purposeError : null"
        [value]="purpose()"
        (valueChange)="purpose.set($event)"
      />
      <app-text-field
        [label]="txt.date"
        type="date"
        [readonly]="locked()"
        [error]="errors?.date ? txt.dateError : null"
        [value]="date()"
        (valueChange)="date.set($event)"
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
      } @else if (recorded()) {
        <p class="muted">{{ txt.recordedNote }}</p>
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
        (click)="unresolved() ? check() : give()"
      >
        {{
          saving() ? txt.saving : unresolved() ? txt.check : recorded() ? txt.payAgain : payLabel()
        }}
      </button>
    }
  `,
})
export class AdvanceFormContainer {
  /** Optional: the worker it was opened for. */
  readonly workerParam = input<string | undefined>(undefined, { alias: 'worker' });

  private readonly api = inject(AdvanceApiService);
  private readonly leave = inject(LeaveApiService);
  private readonly paymentAccounts = inject(PaymentAccountsService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().giveAdvances);
  protected readonly currency = computed(() => this.business.active()?.currency ?? '');
  private readonly workers = signal<{ id: string; name: string }[]>([]);
  protected readonly accounts = signal<PaymentAccount[]>([]);
  protected readonly worker = signal('');
  protected readonly amount = signal('');
  protected readonly mode = signal('');
  protected readonly purpose = signal('');
  protected readonly date = signal('');
  private readonly today = signal('');
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failed = signal<Failure | null>(null);
  /** A lost answer: giving again with the same reference finds what was done and finishes the rest. */
  protected readonly unresolved = signal(false);
  /** Once sent, the details stay as sent until the advance is resolved. */
  protected readonly locked = computed(() => this.unresolved() || this.saving() || this.recorded());
  /** The advance exists in ERPNext: its details can no longer change, only its payment be tried again. */
  protected readonly recorded = signal(false);
  private readonly reference = newReference('ADV');
  protected readonly pending = signal(false);
  protected readonly notCreated = signal(false);

  private readonly value = computed(() => parseNumber(this.amount()));

  protected readonly invalid = computed(() => {
    const errors = {
      worker: !this.worker(),
      amount: !(this.value() > 0),
      purpose: !this.purpose().trim(),
      date: !this.date() || (!!this.today() && this.date() > this.today()),
    };
    return Object.values(errors).some(Boolean) ? errors : null;
  });

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    const f = (key: string) => t(`workers.advance.form.${key}`);
    return {
      back: t('workers.back'),
      title: f('title'),
      subtitle: f('subtitle'),
      worker: f('worker'),
      workerError: f('workerError'),
      amount: f('amount'),
      amountError: f('amountError'),
      account: f('account'),
      purpose: f('purpose'),
      purposeError: f('purposeError'),
      date: f('date'),
      dateError: f('dateError'),
      saving: f('saving'),
      check: f('check'),
      payAgain: f('payAgain'),
      pending: t('sale.checking.pending'),
      notCreated: block('workers.advance.form.notCreated'),
      recordedNote: f('recordedNote'),
      optionsFailed: f('optionsFailed'),
      loading: t('workers.loading'),
      retry: t('workers.retry'),
      loadFailed: t('workers.error.title'),
      noAccess: block('workers.advance.form.noAccess'),
      noAccounts: block('workers.advance.form.noAccounts'),
      unresolved: {
        title: f('unresolved.title'),
        message: t('workers.advance.form.unresolved.message', { reference: this.reference }),
      },
      failed: {
        permission: block('workers.advance.form.failed.permission'),
        offline: block('workers.advance.form.failed.offline'),
        setup: block('workers.advance.form.failed.setup'),
        error: block('workers.advance.form.failed.error'),
      },
    };
  });

  protected readonly payLabel = computed(() =>
    this.i18n.tr().t('workers.advance.form.pay', {
      amount: formatMoney(this.value() > 0 ? this.value() : 0, this.currency()),
    }),
  );

  protected readonly workerOptions = computed(() =>
    this.workers().map((w) => ({ value: w.id, label: w.name })),
  );

  protected readonly accountOptions = computed(() =>
    this.accounts().map((a) => ({ value: a.mode, label: a.label })),
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
      const [workers, accounts] = await Promise.all([
        this.leave.workers(business),
        this.paymentAccounts.list(business.name, this.session.capabilities().paymentModes),
      ]);
      // Advances are in the company currency: accounts in another currency can't pay them.
      const usable = accounts.filter((a) => !a.currency || a.currency === business.currency);
      const today = toIsoDate(this.clock.now());
      this.today.set(today);
      this.workers.set(workers);
      this.accounts.set(usable);
      if (!this.mode() && usable.length) {
        this.mode.set(usable[0].mode);
      }
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

  /** Records and pays the advance; after a lost answer the same call checks and finishes it. */
  /**
   * After a lost answer: looks the reference up, never records or pays. Done goes to the worker; recorded but not
   * paid allows paying again; nothing found allows giving again (the same reference keeps it from doubling).
   */
  protected async check(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.pending.set(false);
    try {
      const { advance, paid } = await this.api.status(this.reference);
      this.unresolved.set(false);
      if (advance && paid) {
        void this.router.navigate(['/workers', this.worker()], { replaceUrl: true });
      } else if (advance) {
        this.recorded.set(true);
      } else {
        this.notCreated.set(true);
      }
    } catch {
      this.pending.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  protected async give(): Promise<void> {
    this.showErrors.set(true);
    const account = this.accounts().find((a) => a.mode === this.mode());
    if (this.invalid() || this.saving() || !account) {
      return;
    }
    this.saving.set(true);
    this.failed.set(null);
    this.notCreated.set(false);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      await this.api.give(
        {
          worker: this.worker(),
          amount: this.value(),
          mode: account.mode,
          account: account.account,
          purpose: this.purpose(),
          date: this.date(),
        },
        this.reference,
        business,
      );
      void this.router.navigate(['/workers', this.worker()], { replaceUrl: true });
    } catch (error) {
      if (error instanceof UnresolvedError) {
        this.unresolved.set(true);
      } else {
        if (error instanceof AdvanceNotPaidError) {
          this.recorded.set(true);
        }
        const e = ErpnextError.from(error instanceof AdvanceNotPaidError ? error.reason : error);
        if (e.kind === 'forbidden') {
          void this.session.checkExpired();
        }
        this.failed.set(
          e.kind === 'forbidden'
            ? 'permission'
            : e.kind === 'offline'
              ? 'offline'
              : e.excType === 'AdvanceAccountNotReceivable'
                ? 'setup'
                : 'error',
        );
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected back(): void {
    const worker = this.workerParam();
    void this.router.navigate(worker ? ['/workers', worker] : ['/workers']);
  }
}
