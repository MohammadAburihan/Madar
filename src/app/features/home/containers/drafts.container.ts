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
import { OWN_SALES_ONLY } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { DraftsListComponent } from '../components/drafts-list.component';
import { DraftsApiService } from '../data-access/drafts-api.service';
import { DraftEntry } from '../data-access/drafts.models';
import { buildDraftsView, draftId, draftTarget } from './drafts-view';

/** Unfinished work: every draft sale, quotation, order, purchase and supplier payment the user can continue. */
@Component({
  selector: 'app-drafts',
  imports: [
    BackLinkComponent,
    DraftsListComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SearchFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="back()" />
    @if (!hasAccess()) {
      <app-page-heading [title]="txt.title" />
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      @let v = view();
      <app-page-heading [title]="txt.title" [subtitle]="state() === 'ready' ? v.subtitle : null" />
      @if (state() === 'loading') {
        <p class="muted" role="status">{{ txt.loading }}</p>
      } @else if (state() === 'error') {
        <app-feedback-card tone="danger" [title]="txt.error.title" [message]="txt.error.message" />
        <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
      } @else {
        <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
        <app-drafts-list [cards]="v.cards" [empty]="v.empty" (continued)="open($event)" />
        <p class="muted">{{ v.note }}</p>
      }
    }
  `,
})
export class DraftsContainer {
  private readonly api = inject(DraftsApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly term = signal('');
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly entries = signal<DraftEntry[]>([]);
  private readonly now = signal(new Date());
  private run = 0;

  private readonly caps = this.session.capabilities;
  protected readonly hasAccess = computed(
    () => this.caps().sell || this.caps().orderPurchases || this.caps().paySuppliers,
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('sale.back'),
      title: t('drafts.heading'),
      search: t('drafts.search'),
      placeholder: t('drafts.placeholder'),
      loading: t('drafts.loading'),
      retry: t('sales.records.retry'),
      error: { title: t('drafts.error.title'), message: t('drafts.error.message') },
      noAccess: { title: t('drafts.noAccess.title'), message: t('drafts.noAccess.message') },
    };
  });

  protected readonly view = computed(() =>
    buildDraftsView(
      {
        entries: this.entries(),
        term: this.term(),
        business: this.business.active()?.name ?? '',
        currency: this.business.active()?.currency ?? '',
        seeCosts: this.caps().seeCosts,
        now: this.now(),
      },
      this.i18n.tr(),
    ),
  );

  constructor() {
    effect(() => {
      const userId = this.session.user()?.id;
      untracked(() => {
        if (userId && this.hasAccess()) {
          void this.load();
        }
      });
    });
  }

  protected async load(): Promise<void> {
    const run = ++this.run;
    this.state.set('loading');
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      const userId = this.session.user()?.id;
      if (!business || !userId) {
        throw new Error('No business or user');
      }
      const caps = this.caps();
      const result = await this.api.load({
        company: business.name,
        userId,
        ownSalesOnly: OWN_SALES_ONLY.includes(this.session.persona()),
        sell: caps.sell,
        orderPurchases: caps.orderPurchases,
        paySuppliers: caps.paySuppliers,
      });
      if (result.allForbidden) {
        // 403 is also how an expired session answers; that one goes back to sign-in.
        await this.session.checkExpired();
      }
      if (run === this.run) {
        this.now.set(this.clock.now());
        this.entries.set(result.entries);
        this.state.set(result.allForbidden ? 'error' : 'ready');
      }
    } catch (error) {
      if (ErpnextError.from(error).kind === 'forbidden') {
        void this.session.checkExpired();
      }
      if (run === this.run) {
        this.state.set('error');
      }
    }
  }

  protected open(id: string): void {
    const entry = this.entries().find((e) => draftId(e) === id);
    if (entry) {
      const target = draftTarget(entry);
      void this.router.navigate(target.commands, {
        queryParams: target.draft ? { draft: target.draft } : undefined,
      });
    }
  }

  protected back(): void {
    void this.router.navigate(['/']);
  }
}
