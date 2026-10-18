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
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { PersonCardComponent } from '../../../shared/ui/person-card.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { APPROVAL_LIMIT, ApprovalsApiService } from '../data-access/approvals-api.service';
import { ApprovalItem } from '../data-access/approvals.models';
import { approvalCard } from './approvals-view';

/** Approvals: what waits for the user, from ERPNext's workflows and leave requests. */
@Component({
  selector: 'app-approvals',
  imports: [
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    PersonCardComponent,
    SearchFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (!allowed()) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
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
          <p class="muted">{{ term().trim() ? txt.noResults : txt.empty }}</p>
        }
        @if (capped()) {
          <p class="muted">{{ txt.capped }}</p>
        }
      }
      @if (manageWorkers()) {
        <button
          type="button"
          class="md-btn md-btn--primary"
          (click)="router.navigate(['/workers/leave'])"
        >
          {{ txt.leaveRequests }}
        </button>
      }
      <button type="button" class="md-btn" (click)="router.navigate(['/'])">
        {{ txt.backHome }}
      </button>
    }
  `,
})
export class ApprovalsContainer {
  private readonly api = inject(ApprovalsApiService);
  private readonly business = inject(BusinessService);
  private readonly session = inject(SessionService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().approve);
  protected readonly manageWorkers = computed(() => this.session.capabilities().manageWorkers);
  protected readonly term = signal('');
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly items = signal<ApprovalItem[]>([]);
  protected readonly capped = signal(false);
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      title: t('approvals.title'),
      subtitle: t('approvals.subtitle', { business: this.business.active()?.name ?? '' }),
      search: t('approvals.search'),
      placeholder: t('approvals.placeholder'),
      loading: t('approvals.loading'),
      empty: t('approvals.empty'),
      noResults: t('approvals.noResults'),
      capped: t('approvals.capped', { count: APPROVAL_LIMIT }),
      leaveRequests: t('approvals.leaveRequests'),
      backHome: t('approvals.backHome'),
      retry: t('workers.retry'),
      error: block('approvals.error'),
      noAccess: block('approvals.noAccess'),
    };
  });

  protected readonly cards = computed(() => {
    const term = this.term().trim().toLowerCase();
    // Searched as shown, so the doctype matches in the user's language.
    return this.items()
      .map((i) =>
        approvalCard(
          i,
          this.business.active()?.currency ?? '',
          this.i18n.language(),
          this.i18n.tr(),
          this.session.capabilities().seeCosts,
        ),
      )
      .filter((c) => !term || `${c.title} ${c.meta}`.toLowerCase().includes(term));
  });

  constructor() {
    effect(() => {
      if (this.allowed()) {
        untracked(() => void this.load());
      }
    });
  }

  protected async load(): Promise<void> {
    const run = ++this.run;
    this.state.set('loading');
    this.items.set([]);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const [workflow, leave] = await Promise.all([
        this.api.inbox(business),
        this.manageWorkers()
          ? this.api.leaveWaiting(business).catch((error: unknown) => {
              // A role that can't read leave still sees its workflow items.
              if (ErpnextError.from(error).kind === 'forbidden') {
                return [];
              }
              throw error;
            })
          : Promise.resolve([]),
      ]);
      if (run === this.run) {
        // A site with a workflow on leave lists the same request twice: the leave row opens the leave page.
        const leaveIds = new Set(leave.map((l) => l.name));
        const others = workflow.items.filter(
          (w) => w.doctype !== 'Leave Application' || !leaveIds.has(w.name),
        );
        this.capped.set(workflow.capped || leave.length >= APPROVAL_LIMIT);
        this.items.set([...leave, ...others]);
        this.state.set('ready');
      }
    } catch {
      if (run === this.run) {
        this.state.set('error');
      }
    }
  }

  protected open(id: string): void {
    const [doctype, ...rest] = id.split('/');
    const name = rest.join('/');
    void this.router.navigate(
      // Leave pages are for HR roles; others act on a leave workflow from the approval page.
      doctype === 'Leave Application' && this.manageWorkers()
        ? ['/workers/leave', name]
        : ['/approvals', doctype, name],
    );
  }
}
