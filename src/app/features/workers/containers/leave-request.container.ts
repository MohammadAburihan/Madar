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
import { LeaveApiService } from '../data-access/leave-api.service';
import { LeaveDecision, LeaveRequest } from '../data-access/workers.models';
import { leaveRequestView } from './leave-view';

/** One leave request: its days and what they do to the balance, and approving or rejecting it. */
@Component({
  selector: 'app-leave-request',
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
    <app-back-link [label]="txt.back" (back)="back()" />
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
      <app-totals-card density="compact" [rows]="v.totals" />
      <app-feedback-card
        [tone]="v.open ? 'tint' : request()?.status === 'Rejected' ? 'warning' : 'tint'"
        [title]="v.card.title"
        [message]="v.card.message"
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
        <button type="button" class="md-btn md-btn--primary" (click)="load()">
          {{ txt.check }}
        </button>
      } @else if (v.open) {
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="deciding()"
          (click)="decide('Approved')"
        >
          {{ deciding() ? txt.deciding : txt.approve }}
        </button>
        <button type="button" class="md-btn" [disabled]="deciding()" (click)="decide('Rejected')">
          {{ txt.reject }}
        </button>
      }
      <button
        type="button"
        class="md-btn"
        (click)="router.navigate(['/workers', request()!.worker])"
      >
        {{ txt.openWorker }}
      </button>
    } @else if (loadFailed()) {
      <app-page-heading [title]="txt.pageTitle" [subtitle]="id()" />
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
export class LeaveRequestContainer {
  readonly id = input.required<string>();

  private readonly api = inject(LeaveApiService);
  private readonly business = inject(BusinessService);
  private readonly session = inject(SessionService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().manageWorkers);
  protected readonly request = signal<LeaveRequest | null>(null);
  /** Days left of the request's leave type now; null when unpaid or unreadable. */
  private readonly left = signal<number | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly deciding = signal(false);
  protected readonly failed = signal<'permission' | 'offline' | 'error' | null>(null);
  protected readonly unresolved = signal(false);
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('workers.back'),
      pageTitle: t('workers.leave.title'),
      loading: t('workers.leave.loading'),
      retry: t('workers.retry'),
      approve: t('workers.leave.approve'),
      reject: t('workers.leave.reject'),
      deciding: t('workers.leave.deciding'),
      openWorker: t('workers.leave.openWorker'),
      check: t('workers.leave.check'),
      noAccess: block('workers.noAccess'),
      loadFailed: block('workers.leave.loadFailed'),
      unresolved: block('workers.leave.decideUnresolved'),
      failed: {
        permission: block('workers.leave.decideFailed.permission'),
        offline: block('workers.leave.decideFailed.offline'),
        error: block('workers.leave.decideFailed.error'),
      },
    };
  });

  protected readonly view = computed(() => {
    const request = this.request();
    return request
      ? leaveRequestView(request, this.left(), this.i18n.language(), this.i18n.tr())
      : null;
  });

  constructor() {
    effect(() => {
      this.id();
      if (this.allowed()) {
        untracked(() => void this.load());
      }
    });
  }

  /** Reads the request as ERPNext has it; after a lost decision this is the check. */
  protected async load(): Promise<void> {
    const run = ++this.run;
    const id = this.id();
    this.request.set(null);
    this.left.set(null);
    this.loadFailed.set(false);
    this.unresolved.set(false);
    this.failed.set(null);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const request = await this.api.request(id, business);
      if (run !== this.run) {
        return;
      }
      this.request.set(request);
      if (!request.decided) {
        const balances = await this.api.balances(request.worker, request.from).catch(() => []);
        if (run === this.run) {
          this.left.set(balances.find((b) => b.type === request.leaveType)?.left ?? null);
        }
      }
    } catch {
      if (run === this.run) {
        this.loadFailed.set(true);
      }
    }
  }

  protected async decide(decision: LeaveDecision): Promise<void> {
    if (this.deciding() || this.unresolved()) {
      return;
    }
    this.deciding.set(true);
    this.failed.set(null);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const decided = await this.api.decide(this.id(), decision, business);
      this.request.set(decided);
    } catch (error) {
      if (error instanceof UnresolvedError) {
        this.unresolved.set(true);
      } else {
        const kind = ErpnextError.from(error).kind;
        this.failed.set(
          kind === 'forbidden' ? 'permission' : kind === 'offline' ? 'offline' : 'error',
        );
      }
    } finally {
      this.deciding.set(false);
    }
  }

  protected back(): void {
    void this.router.navigate(['/workers/leave'], {
      queryParams: this.request()?.decided ? { tab: 'decided' } : {},
    });
  }
}
