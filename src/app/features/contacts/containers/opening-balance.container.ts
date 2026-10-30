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
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { OpeningBalanceFormComponent } from '../components/opening-balance-form.component';
import { OpeningBalanceResultComponent } from '../components/opening-balance-result.component';
import { OpeningBalanceReviewComponent } from '../components/opening-balance-review.component';
import { ContactKind } from '../data-access/contacts.models';
import { OpeningBalanceStore } from '../data-access/opening-balance.store';
import {
  OpeningSummary,
  openingBlockNotice,
  openingRecorded,
  openingReview,
  openingSubtitle,
} from './opening-balance-view';

/** "Opening balance": what a customer or supplier already owed before Madar, recorded as an opening invoice. */
@Component({
  selector: 'app-opening-balance',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    OpeningBalanceFormComponent,
    OpeningBalanceResultComponent,
    OpeningBalanceReviewComponent,
    PageHeadingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="toContact()" />
    @if (!allowed()) {
      <app-page-heading [title]="txt.title" />
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (!store.loaded()) {
      <app-page-heading [title]="txt.title" />
      @if (store.loadFailed()) {
        <app-feedback-card
          tone="danger"
          [title]="txt.loadFailed.title"
          [message]="txt.loadFailed.message"
        />
        <button type="button" class="md-btn" (click)="store.load()">{{ txt.retry }}</button>
      } @else {
        <p class="muted" role="status">{{ txt.loading }}</p>
      }
    } @else if (blocked(); as b) {
      <app-page-heading [title]="txt.title" [subtitle]="subtitle()" />
      <app-feedback-card tone="warning" [title]="b.title" [message]="b.message" />
      <button type="button" class="md-btn" (click)="toContact()">{{ txt.back }}</button>
    } @else if (recorded(); as r) {
      <app-page-heading [title]="txt.recordedTitle" [subtitle]="r.subtitle" />
      <app-opening-balance-result
        [text]="txt.resultText"
        [title]="r.title"
        [message]="r.message"
        (viewInvoice)="viewInvoice()"
        (done)="toContact()"
      />
    } @else if (store.state() === 'unresolved' || store.state() === 'checking') {
      <app-page-heading [title]="txt.title" [subtitle]="subtitle()" />
      <app-feedback-card
        tone="warning"
        [status]="true"
        [title]="txt.unresolved.title"
        [message]="txt.unresolved.message"
      />
      @if (pending()) {
        <p class="muted" role="status">{{ txt.pending }}</p>
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="store.state() !== 'unresolved'"
        (click)="check()"
      >
        {{ store.state() === 'checking' ? txt.checking : txt.check }}
      </button>
    } @else {
      @if (store.step() === 'review' && reviewView(); as v) {
        <app-page-heading [title]="txt.reviewTitle" [subtitle]="txt.step2" />
        @if (notice(); as n) {
          <app-feedback-card tone="danger" [title]="n.title" [message]="n.message" />
        }
        <app-opening-balance-review
          [text]="txt.reviewText"
          [title]="v.title"
          [message]="v.message"
          [rows]="v.rows"
          [busy]="store.state() === 'confirming'"
          [canEdit]="!store.lost()"
          (record)="record()"
          (edit)="store.back()"
        />
      } @else {
        <app-page-heading [title]="txt.title" [subtitle]="subtitle()" />
        @if (notice(); as n) {
          <app-feedback-card tone="danger" [title]="n.title" [message]="n.message" />
        }
        <app-opening-balance-form
          [text]="txt.formText"
          [currency]="currency()"
          [amount]="store.amountInput()"
          [date]="store.date()"
          [note]="store.note()"
          [amountError]="amountError()"
          [dateValid]="store.dateValid()"
          [showErrors]="showErrors()"
          [locked]="store.locked()"
          (amountChange)="store.setAmount($event)"
          (dateChange)="store.setDate($event)"
          (noteChange)="store.setNote($event)"
          (review)="toReview()"
        />
      }
    }
  `,
})
export class OpeningBalanceContainer {
  readonly kind = input.required<string>();
  readonly id = input.required<string>();

  protected readonly store = inject(OpeningBalanceStore);
  private readonly business = inject(BusinessService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly showErrors = signal(false);
  protected readonly pending = signal(false);
  private entered = false;
  private started = false;

  private readonly contactKind = computed<ContactKind>(() =>
    this.kind() === 'suppliers' ? 'suppliers' : 'customers',
  );

  protected readonly allowed = computed(() => this.session.capabilities().recordOpeningBalance);
  protected readonly currency = computed(() => this.business.active()?.currency ?? '');

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const o = (key: string, params?: Record<string, unknown>) =>
      t(`contacts.opening.${key}`, params);
    const name = this.store.target()?.name ?? '';
    return {
      back: t('contacts.back'),
      title: o('title'),
      step2: o('step2'),
      reviewTitle: o('reviewTitle'),
      recordedTitle: o('recordedTitle'),
      loading: o('loading'),
      retry: o('retry'),
      check: o('check'),
      checking: o('checking'),
      pending: o('pending'),
      loadFailed: { title: o('loadFailed.title'), message: o('loadFailed.message') },
      noAccess: { title: o('noAccess.title'), message: o('noAccess.message') },
      unresolved: {
        title: o('unresolved.title'),
        message: o('unresolved.message', { reference: this.store.reference() }),
      },
      formText: {
        intro: o(`intro.${this.contactKind()}`),
        amount: o('amount'),
        date: o('date'),
        dateHint: o('dateHint'),
        dateError: o('dateError'),
        note: o('note'),
        review: o('toReview'),
      },
      reviewText: {
        ready: o('ready'),
        record: o('record'),
        recording: o('recording'),
        edit: o('edit'),
        reference: o('reference', { reference: this.store.reference() }),
      },
      resultText: {
        recorded: o('recorded'),
        viewInvoice: o('viewInvoice'),
        done: o('done', { name }),
      },
    };
  });

  protected readonly amountError = computed(() => {
    const { t } = this.i18n.tr();
    const problem = this.store.amountProblem();
    const digits = this.store.precision();
    return problem === 'invalid'
      ? t('contacts.opening.amountError')
      : problem === 'decimals'
        ? t(digits === 0 ? 'contacts.opening.amountWhole' : 'contacts.opening.amountDecimals', {
            digits,
          })
        : null;
  });

  protected readonly subtitle = computed(() =>
    openingSubtitle(this.contactKind(), this.store.target()?.name ?? '', this.i18n.tr()),
  );

  protected readonly blocked = computed(() => {
    const block = this.store.target()?.blocked;
    return block ? openingBlockNotice(block, this.i18n.tr()) : null;
  });

  private readonly summary = computed<OpeningSummary | null>(() => {
    const target = this.store.target();
    const sent = this.store.sent();
    if (!target) {
      return null;
    }
    // What was sent only while that request is still the task's; an edited task shows what is typed.
    const asSent = this.store.busy() || this.store.lost() || this.store.state() === 'confirmed';
    return sent && asSent
      ? {
          kind: sent.kind,
          name: target.name,
          amount: sent.amount,
          date: sent.date,
          note: sent.note,
        }
      : {
          kind: this.store.kind(),
          name: target.name,
          amount: this.store.postedAmount(),
          date: this.store.date(),
          note: this.store.note(),
        };
  });

  protected readonly reviewView = computed(() => {
    const summary = this.summary();
    return summary
      ? openingReview(summary, this.currency(), this.i18n.language(), this.i18n.tr())
      : null;
  });

  protected readonly recorded = computed(() => {
    const result = this.store.result();
    const summary = this.summary();
    return this.store.state() === 'confirmed' && result && summary
      ? openingRecorded(
          result.name,
          result.total,
          summary,
          this.currency(),
          this.i18n.language(),
          this.i18n.tr(),
        )
      : null;
  });

  protected readonly notice = computed(() => {
    const { t } = this.i18n.tr();
    const failure = this.store.failure();
    if (failure && this.store.state() === 'failed') {
      return {
        title: t(`contacts.opening.failed.${failure}.title`),
        message:
          (failure === 'error' && this.store.failureMessage()) ||
          t(`contacts.opening.failed.${failure}.message`),
      };
    }
    return this.store.notCreated()
      ? {
          title: t('contacts.opening.notCreated.title'),
          message: t('contacts.opening.notCreated.message'),
        }
      : null;
  });

  constructor() {
    effect(() => {
      const kind = this.contactKind();
      const id = this.id();
      // Also reads where the store is, so a reset behind a mounted page (another user, another business) reloads it.
      const here = this.store.partyId() === id && this.store.kind() === kind;
      if (this.allowed() && (!this.started || !here)) {
        this.started = true;
        untracked(() => this.enter(kind, id));
      }
    });
    effect(() => {
      if (this.store.state() === 'confirmed' && this.recorded()) {
        untracked(() => this.store.resultShown.set(true));
      }
    });
  }

  /** Ionic keeps this page alive when it is left and reopened at the same address: each visit starts clean. */
  ionViewWillEnter(): void {
    if (!this.entered) {
      this.entered = true;
      return;
    }
    if (this.allowed()) {
      this.enter(this.contactKind(), this.id());
    }
  }

  private enter(kind: ContactKind, id: string): void {
    const other = this.store.resume(kind, id);
    this.showErrors.set(false);
    this.pending.set(false);
    if (other) {
      // A task still running for another contact is shown first, so its answer can't be lost.
      void this.router.navigate(
        ['/contacts', this.store.kind(), this.store.partyId(), 'opening-balance'],
        { replaceUrl: true },
      );
      return;
    }
    if (!this.store.loaded()) {
      void this.store.load();
    }
  }

  protected toReview(): void {
    this.showErrors.set(true);
    this.store.review();
  }

  protected async record(): Promise<void> {
    await this.store.confirm(this.i18n.tr().t('contacts.opening.itemName'));
  }

  protected async check(): Promise<void> {
    this.pending.set(false);
    const outcome = await this.store.checkResult();
    this.pending.set(outcome === 'pending' && this.store.state() === 'unresolved');
  }

  protected viewInvoice(): void {
    const invoice = this.store.result()?.name;
    if (invoice) {
      void this.router.navigate(
        this.store.kind() === 'customers'
          ? ['/sales/invoices', invoice]
          : ['/purchases/invoice', invoice],
      );
    }
  }

  protected toContact(): void {
    const own = this.allowed();
    void this.router.navigate([
      '/contacts',
      own ? this.store.kind() : this.contactKind(),
      own ? this.store.partyId() : this.id(),
    ]);
  }
}
