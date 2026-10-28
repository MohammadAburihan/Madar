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
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { BankDetailsCardComponent } from '../components/bank-details-card.component';
import { ContactBankApiService } from '../data-access/contact-bank-api.service';
import { ContactsApiService } from '../data-access/contacts-api.service';
import {
  BankAccountRecord,
  ContactKind,
  CustomerDetail,
  SupplierDetail,
} from '../data-access/contacts.models';
import { bankRows } from './bank-details-view';
import { contactActions, contactKinds, editableKinds, isWalkIn } from './contacts-access';
import {
  activationDialog,
  contactLines,
  contactSubtitle,
  customerView,
  supplierView,
} from './contacts-view';

/** One customer or supplier: how to reach them, what they owe or are owed, and what to do next. */
@Component({
  selector: 'app-contact',
  imports: [
    BackLinkComponent,
    BankDetailsCardComponent,
    ConfirmDialogComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    StatusChipComponent,
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
      @if (!v.active) {
        <app-status-chip [label]="txt.inactive" tone="warning" />
      }
      @if (notice(); as n) {
        <app-feedback-card
          [tone]="n.tone"
          [status]="true"
          [title]="n.title"
          [message]="n.message"
        />
      }
      @if (v.lines) {
        <p class="lines">{{ v.lines }}</p>
      }
      @if (bankView(); as b) {
        <app-bank-details-card [title]="b.title" [rows]="b.rows" />
      } @else if (bankFailed()) {
        <app-feedback-card
          tone="danger"
          [title]="txt.bankFailed.title"
          [message]="txt.bankFailed.message"
        />
        <button type="button" class="md-btn" (click)="loadBank()">{{ txt.retry }}</button>
      }
      @if (v.totals.length) {
        <app-totals-card density="compact" [rows]="v.totals" />
      }
      @for (card of v.cards; track card.title) {
        <app-feedback-card [title]="card.title" [message]="card.message" />
      }
      @if (!v.active && editable()) {
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="switching()"
          (click)="asking.set(true)"
        >
          {{ contactKind() === 'customers' ? txt.reactivateCustomer : txt.reactivateSupplier }}
        </button>
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
      <button type="button" class="md-btn" (click)="router.navigate([...base(), 'history'])">
        {{ txt.history }}
      </button>
      @if (editable()) {
        <button type="button" class="md-btn" (click)="router.navigate([...base(), 'edit'])">
          {{ contactKind() === 'customers' ? txt.editCustomer : txt.editSupplier }}
        </button>
        @if (v.active && !walkIn()) {
          <button type="button" class="md-btn" [disabled]="switching()" (click)="asking.set(true)">
            {{ contactKind() === 'customers' ? txt.deactivateCustomer : txt.deactivateSupplier }}
          </button>
        }
      }
      @if (dialog(); as d) {
        <app-confirm-dialog
          [open]="asking()"
          [title]="d.title"
          [message]="d.message"
          [actions]="d.actions"
          (chosen)="answer($event)"
        />
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
  /** "inactive" when opened from the Inactive list. */
  readonly status = input<string | undefined>();

  private readonly api = inject(ContactsApiService);
  private readonly bankApi = inject(ContactBankApiService);
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
  private readonly bankRecord = signal<BankAccountRecord | null>(null);
  protected readonly bankFailed = signal(false);
  private bankRun = 0;
  /** The deactivate or reactivate question is open. */
  protected readonly asking = signal(false);
  protected readonly switching = signal(false);
  /** What the last deactivate or reactivate came to. */
  private readonly outcome = signal<
    'deactivated' | 'reactivated' | 'permission' | 'offline' | 'error' | null
  >(null);
  private run = 0;

  private readonly contactKind = computed<ContactKind>(() =>
    this.kind() === 'suppliers' ? 'suppliers' : 'customers',
  );

  /** Opened by URL too: only the kinds of contact the role works with (docs/PERMISSIONS.md). */
  protected readonly allowed = computed(() =>
    contactKinds(this.caps()).includes(this.contactKind()),
  );

  protected readonly editable = computed(() =>
    editableKinds(this.caps(), 'edit').includes(this.contactKind()),
  );

  protected base(): string[] {
    return ['/contacts', this.contactKind(), this.id()];
  }

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('contacts.back'),
      pageTitle: t('contacts.title'),
      loading: t('contacts.loading'),
      retry: t('contacts.retry'),
      noAccess: { title: t('contacts.noAccess.title'), message: t('contacts.noAccess.message') },
      history: t('contacts.viewTransactions'),
      editCustomer: t('contacts.editContact'),
      editSupplier: t('contacts.editSupplier'),
      inactive: t('contacts.activation.inactive'),
      deactivateCustomer: t('contacts.activation.deactivateCustomer'),
      deactivateSupplier: t('contacts.activation.deactivateSupplier'),
      reactivateCustomer: t('contacts.activation.reactivateCustomer'),
      reactivateSupplier: t('contacts.activation.reactivateSupplier'),
      loadFailed: {
        title: t('contacts.loadFailed.title'),
        message: t('contacts.loadFailed.message'),
      },
      bankFailed: {
        title: t('contacts.bank.loadFailed.title'),
        message: t('contacts.bank.detailFailed'),
      },
    };
  });

  protected readonly bankView = computed(() => {
    const record = this.bankRecord();
    const tr = this.i18n.tr();
    return record ? { title: tr.t('contacts.bank.detailTitle'), rows: bankRows(record, tr) } : null;
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
      active: detail.active,
      subtitle: contactSubtitle(kind, detail.id, tr),
      lines: contactLines(detail),
      // ERPNext refuses new sales or purchases with an inactive contact: none are offered.
      actions: detail.active ? contactActions(kind, detail, this.caps(), tr) : [],
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

  /** Every walk-in sale posts to this customer: it is never deactivated. */
  protected readonly walkIn = computed(() =>
    isWalkIn(this.contactKind(), this.id(), this.detail()?.name ?? null),
  );

  protected readonly dialog = computed(() => {
    const detail = this.detail();
    return detail
      ? activationDialog(
          this.contactKind(),
          detail,
          this.business.active()?.currency ?? '',
          this.i18n.tr(),
          this.contactKind() === 'suppliers'
            ? 'outstanding' in detail && detail.outstanding !== null
            : !this.owner() && 'totals' in detail && detail.totals !== null,
        )
      : null;
  });

  protected readonly notice = computed(() => {
    const outcome = this.outcome();
    if (!outcome) {
      return null;
    }
    const { t } = this.i18n.tr();
    const done = outcome === 'deactivated' || outcome === 'reactivated';
    return {
      tone: done ? ('tint' as const) : ('danger' as const),
      title: t(`contacts.activation.outcome.${outcome}.title`),
      message: t(`contacts.activation.outcome.${outcome}.message`),
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

  protected async answer(choice: string): Promise<void> {
    this.asking.set(false);
    const detail = this.detail();
    if (choice !== 'confirm' || !detail || this.switching()) {
      return;
    }
    const kind = this.contactKind();
    const active = !detail.active;
    this.switching.set(true);
    this.outcome.set(null);
    // A late answer for a contact the page has since moved away from isn't shown on the new one.
    const here = () => this.id() === detail.id && this.contactKind() === kind;
    try {
      await this.api.setActive(kind, detail.id, active);
      if (!here()) {
        return;
      }
      await this.load(kind, detail.id, true);
      if (!here()) {
        return;
      }
      this.outcome.set(active ? 'reactivated' : 'deactivated');
    } catch (error) {
      const e = ErpnextError.from(error);
      if (e.kind === 'forbidden') {
        void this.session.checkExpired();
      }
      if (!here()) {
        return;
      }
      this.outcome.set(
        e.kind === 'forbidden' ? 'permission' : e.kind === 'offline' ? 'offline' : 'error',
      );
      // The value may have been set before the answer was lost: show what ERPNext holds.
      void this.load(kind, detail.id, true);
    } finally {
      this.switching.set(false);
    }
  }

  /** `keep` leaves the outcome notice on screen: the reload after deactivating shows the new state under it. */
  protected async load(kind = this.contactKind(), id = this.id(), keep = false): Promise<void> {
    const run = ++this.run;
    if (!keep) {
      this.outcome.set(null);
    }
    this.detail.set(null);
    this.failed.set(false);
    void this.loadBank(kind, id);
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

  /** Only for roles that keep bank details; a role ERPNext keeps them from sees no block, other failures say so. */
  protected async loadBank(kind = this.contactKind(), id = this.id()): Promise<void> {
    const run = ++this.bankRun;
    this.bankRecord.set(null);
    this.bankFailed.set(false);
    if (!this.caps().editBankDetails) {
      return;
    }
    try {
      const account = await this.bankApi.account(kind, id);
      if (run === this.bankRun) {
        this.bankRecord.set(account && !account.disabled ? account : null);
      }
    } catch (error) {
      if (run === this.bankRun && ErpnextError.from(error).kind !== 'forbidden') {
        this.bankFailed.set(true);
      }
    }
  }

  protected back(): void {
    // Back to the list it was opened from: an inactive contact's is the Inactive one.
    const detail = this.detail();
    void this.router.navigate(['/contacts'], {
      queryParams: {
        kind: this.contactKind(),
        ...((detail ? !detail.active : this.status() === 'inactive') ? { status: 'inactive' } : {}),
      },
    });
  }
}
