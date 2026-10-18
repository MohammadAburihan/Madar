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
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { ApprovalsApiService } from '../data-access/approvals-api.service';
import { ApprovalDetail } from '../data-access/approvals.models';
import { approvalView } from './approvals-view';

/** One document waiting in a workflow, and the steps the user's roles may take on it. */
@Component({
  selector: 'app-approval',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    .lines {
      margin: 0;
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
      white-space: pre-line;
    }
  `,
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.backLink" (back)="back()" />
    @if (!allowed()) {
      <app-page-heading [title]="txt.pageTitle" />
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (view(); as v) {
      <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
      <p class="lines">{{ v.lines }}</p>
      @if (v.totals.length) {
        <app-totals-card density="compact" [rows]="v.totals" />
      }
      @if (outcome(); as o) {
        <app-feedback-card tone="tint" [title]="o.title" [message]="o.message" />
      } @else if (detail()!.actions.length) {
        <app-feedback-card tone="tint" [title]="txt.waiting" [message]="txt.actionsNote" />
      } @else {
        <p class="muted">{{ txt.noActions }}</p>
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
        <button type="button" class="md-btn md-btn--primary" (click)="load()">
          {{ txt.check }}
        </button>
      } @else if (!outcome()) {
        @for (action of detail()!.actions; track action; let first = $first) {
          <button
            type="button"
            class="md-btn"
            [class.md-btn--primary]="first"
            [disabled]="working()"
            (click)="apply(action)"
          >
            {{ action }}
          </button>
        }
      }
      <button type="button" class="md-btn" (click)="back()">{{ txt.back }}</button>
    } @else if (loadFailed()) {
      <app-page-heading [title]="txt.pageTitle" [subtitle]="name()" />
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class ApprovalContainer {
  readonly doctype = input.required<string>();
  readonly name = input.required<string>();

  private readonly api = inject(ApprovalsApiService);
  private readonly business = inject(BusinessService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().approve);
  protected readonly detail = signal<ApprovalDetail | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly working = signal(false);
  protected readonly failed = signal<'permission' | 'offline' | 'error' | null>(null);
  protected readonly unresolved = signal(false);
  /** What a step came to: done, or decided by someone else first. */
  protected readonly outcome = signal<{ title: string; message: string } | null>(null);
  /** The state a step was sent from when its answer was lost; Check result compares with it. */
  private sentFrom: string | null = null;
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      backLink: t('workers.back'),
      back: t('approvals.back'),
      pageTitle: t('approvals.title'),
      loading: t('approvals.loading'),
      retry: t('workers.retry'),
      waiting: t('approvals.waiting'),
      actionsNote: t('approvals.actionsNote'),
      noActions: t('approvals.noActions'),
      check: t('approvals.check'),
      unresolved: block('approvals.unresolved'),
      loadFailed: block('approvals.loadFailed'),
      noAccess: block('approvals.noAccess'),
      failed: {
        permission: block('approvals.failed.permission'),
        offline: block('approvals.failed.offline'),
        error: block('approvals.failed.error'),
      },
    };
  });

  protected readonly view = computed(() => {
    const detail = this.detail();
    return detail
      ? approvalView(
          detail,
          this.business.active()?.currency ?? '',
          this.i18n.language(),
          this.i18n.tr(),
          this.session.capabilities().seeCosts,
        )
      : null;
  });

  constructor() {
    effect(() => {
      this.doctype();
      this.name();
      if (this.allowed()) {
        untracked(() => {
          // Another document on the same page starts fresh.
          this.outcome.set(null);
          this.unresolved.set(false);
          this.failed.set(null);
          this.sentFrom = null;
          void this.load();
        });
      }
    });
  }

  /** Reads the document as ERPNext has it; after a lost answer this is the check. */
  protected async load(): Promise<void> {
    const run = ++this.run;
    this.detail.set(null);
    this.loadFailed.set(false);
    this.failed.set(null);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const detail = await this.api.item(this.doctype(), this.name(), business);
      if (run !== this.run) {
        return;
      }
      this.detail.set(detail);
      if (this.sentFrom !== null && detail.state !== this.sentFrom) {
        this.outcome.set(this.done(detail.state));
      }
      this.unresolved.set(false);
      this.sentFrom = null;
    } catch {
      if (run === this.run) {
        this.loadFailed.set(true);
      }
    }
  }

  protected async apply(action: string): Promise<void> {
    const detail = this.detail();
    if (!detail || this.working() || this.unresolved()) {
      return;
    }
    this.working.set(true);
    this.failed.set(null);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const result = await this.api.apply(
        detail.doctype,
        detail.name,
        detail.state,
        action,
        business,
      );
      const { t } = this.i18n.tr();
      this.outcome.set(
        result.moved
          ? {
              title: t('approvals.moved.title'),
              message: t('approvals.moved.message', { state: result.state }),
            }
          : this.done(result.state),
      );
      this.detail.update((d) => (d ? { ...d, state: result.state, actions: [] } : d));
    } catch (error) {
      if (error instanceof UnresolvedError) {
        this.sentFrom = detail.state;
        this.unresolved.set(true);
      } else {
        const e = ErpnextError.from(error);
        if (e.kind === 'forbidden') {
          void this.session.checkExpired();
        }
        this.failed.set(
          e.kind === 'forbidden' ? 'permission' : e.kind === 'offline' ? 'offline' : 'error',
        );
      }
    } finally {
      this.working.set(false);
    }
  }

  private done(state: string) {
    const { t } = this.i18n.tr();
    return { title: t('approvals.done.title'), message: t('approvals.done.message', { state }) };
  }

  protected back(): void {
    void this.router.navigate(['/approvals']);
  }
}
