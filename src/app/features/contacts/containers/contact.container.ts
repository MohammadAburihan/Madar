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
import { OWN_SALES_ONLY } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { ContactsApiService } from '../data-access/contacts-api.service';
import { ContactKind, CustomerDetail, SupplierDetail } from '../data-access/contacts.models';
import { contactActions, contactKinds } from './contacts-access';
import { contactLines, contactSubtitle, customerView, supplierView } from './contacts-view';

/** One customer or supplier: how to reach them, what they owe or are owed, and what to do next. */
@Component({
  selector: 'app-contact',
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
      <app-page-heading [title]="v.name" [subtitle]="v.subtitle" />
      @if (v.lines) {
        <p class="lines">{{ v.lines }}</p>
      }
      @if (v.totals.length) {
        <app-totals-card density="compact" [rows]="v.totals" />
      }
      @for (card of v.cards; track card.title) {
        <app-feedback-card [title]="card.title" [message]="card.message" />
      }
      @for (action of v.actions; track action.id; let first = $first) {
        <button
          type="button"
          class="md-btn"
          [class.md-btn--primary]="first"
          (click)="router.navigate(action.route, { queryParams: action.query })"
        >
          {{ action.label }}
        </button>
      }
    } @else if (failed()) {
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
export class ContactContainer {
  readonly kind = input.required<string>();
  readonly id = input.required<string>();

  private readonly api = inject(ContactsApiService);
  private readonly business = inject(BusinessService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  private readonly session = inject(SessionService);
  private readonly caps = this.session.capabilities;
  /** Salespeople and store associates see their own sales only (docs/PERMISSIONS.md). */
  private readonly owner = computed(() =>
    OWN_SALES_ONLY.includes(this.session.persona()) ? (this.session.user()?.id ?? null) : null,
  );
  protected readonly i18n = injectI18n();

  private readonly detail = signal<CustomerDetail | SupplierDetail | null>(null);
  protected readonly failed = signal(false);
  private run = 0;

  private readonly contactKind = computed<ContactKind>(() =>
    this.kind() === 'suppliers' ? 'suppliers' : 'customers',
  );

  /** Opened by URL too: only the kinds of contact the role works with (docs/PERMISSIONS.md). */
  protected readonly allowed = computed(() =>
    contactKinds(this.caps()).includes(this.contactKind()),
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('contacts.back'),
      pageTitle: t('contacts.title'),
      loading: t('contacts.loading'),
      retry: t('contacts.retry'),
      noAccess: { title: t('contacts.noAccess.title'), message: t('contacts.noAccess.message') },
      loadFailed: {
        title: t('contacts.loadFailed.title'),
        message: t('contacts.loadFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const detail = this.detail();
    if (!detail) {
      return null;
    }
    const tr = this.i18n.tr();
    const kind = this.contactKind();
    const currency = this.business.active()?.currency ?? '';
    const base = {
      name: detail.name,
      subtitle: contactSubtitle(kind, detail.id, tr),
      lines: contactLines(detail),
      actions: contactActions(kind, detail, this.caps(), tr),
    };
    if ('totals' in detail) {
      const view = customerView(detail, currency, this.i18n.language(), tr);
      return {
        ...base,
        totals: view.totals,
        cards: view.latest ? [{ title: view.latest.title, message: view.latest.message }] : [],
      };
    }
    const view = supplierView(detail, currency, tr);
    return {
      ...base,
      totals: [],
      cards: [view.balance, view.order].filter((c) => !!c),
    };
  });

  constructor() {
    effect(() => {
      const kind = this.contactKind();
      const id = this.id();
      if (!this.allowed()) {
        return;
      }
      untracked(() => void this.load(kind, id));
    });
  }

  protected async load(kind = this.contactKind(), id = this.id()): Promise<void> {
    const run = ++this.run;
    this.detail.set(null);
    this.failed.set(false);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const detail =
        kind === 'customers'
          ? await this.api.customer(id, business, this.owner())
          : await this.api.supplier(id, business, this.caps().seeCosts);
      if (run === this.run) {
        this.detail.set(detail);
      }
    } catch {
      if (run === this.run) {
        this.failed.set(true);
      }
    }
  }

  protected back(): void {
    void this.router.navigate(['/contacts'], { queryParams: { kind: this.contactKind() } });
  }
}
