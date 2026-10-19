import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OWN_SALES_ONLY } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { DataTableComponent } from '../../../shared/ui/data-table.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { FilterChipsComponent } from '../../../shared/ui/filter-chips.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { PersonCardComponent } from '../../../shared/ui/person-card.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { ContactsApiService, LIST_LIMIT } from '../data-access/contacts-api.service';
import {
  ContactKind,
  ContactRow,
  CustomerDetail,
  SupplierDetail,
} from '../data-access/contacts.models';
import { contactActions, contactKinds, editableKinds } from './contacts-access';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog.component';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import {
  activationDialog,
  contactCard,
  contactLines,
  contactRow,
  customerView,
  supplierView,
} from './contacts-view';

const SEARCH_DELAY_MS = 250;

/** Customers & suppliers: search them, see what each owes, and act on one. */
@Component({
  selector: 'app-contacts',
  imports: [
    ConfirmDialogComponent,
    DataTableComponent,
    FeedbackCardComponent,
    FilterChipsComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    PersonCardComponent,
    SearchFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': 'desktop()', '[class.tablet]': "viewport() === 'tablet'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    h2 {
      margin: 0;
      color: var(--md-ink);
      font: 600 20px / var(--md-lh) var(--md-font);
    }

    .lines {
      margin: 0;
      color: var(--md-ink);
      font: 400 15px / var(--md-lh) var(--md-font);
      white-space: pre-line;
    }
  `,
  template: `
    @let txt = text();
    @if (desktop()) {
      <app-page-heading layout="desktop" [title]="txt.title" [subtitle]="txt.workspaceSubtitle">
        @if (canAdd()) {
          <button type="button" class="md-btn md-btn--primary" (click)="add()">
            {{ txt.addDesktop }}
          </button>
        }
      </app-page-heading>
    }
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    @if (!desktop()) {
      <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    }
    @if (!kinds().length) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
      @if (kinds().length > 1) {
        <app-filter-chips [label]="txt.title" [options]="txt.kindOptions" [(value)]="kind" />
      }
      <app-filter-chips
        [label]="txt.statusLabel"
        [options]="txt.statusOptions"
        [(value)]="status"
      />
      @if (state() === 'loading') {
        <p class="muted" role="status">{{ txt.loading }}</p>
      } @else if (state() === 'error') {
        <app-feedback-card tone="danger" [title]="txt.error.title" [message]="txt.error.message" />
        <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
      } @else if (desktop()) {
        @if (switchNotice(); as n) {
          <app-feedback-card
            [tone]="n.tone"
            [status]="true"
            [title]="n.title"
            [message]="n.message"
          />
        }
        <div class="split">
          <div class="main">
            <app-data-table
              [label]="txt.title"
              [headers]="headers()"
              [rows]="tableRows()"
              [interactive]="true"
              [empty]="emptyText()"
              [ltrColumns]="[2]"
              (opened)="pick($event)"
            />
          </div>
          <section class="panel" [attr.aria-label]="txt.title">
            @if (panel(); as p) {
              <h2>{{ p.name }}</h2>
              @if (p.lines) {
                <p class="lines">{{ p.lines }}</p>
              }
              @if (p.card) {
                <app-feedback-card [title]="p.card.title" [message]="p.card.message" />
              }
              @for (action of p.actions; track action.id; let first = $first) {
                <button
                  type="button"
                  class="md-btn"
                  [class.md-btn--primary]="first"
                  (click)="act(action.route, action.query)"
                >
                  {{ action.label }}
                </button>
              }
              @if (p.recent.length) {
                <p class="lines muted">{{ p.recent.join('\\n') }}</p>
              }
              <button type="button" class="md-btn" (click)="openDetail(p.id, 'history')">
                {{ txt.history }}
              </button>
              @if (editable()) {
                <button type="button" class="md-btn" (click)="openDetail(p.id, 'edit')">
                  {{ current() === 'customers' ? txt.editCustomer : txt.editSupplier }}
                </button>
                <button
                  type="button"
                  class="md-btn"
                  [disabled]="switching()"
                  (click)="asking.set(true)"
                >
                  {{ p.activationLabel }}
                </button>
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
              <button type="button" class="md-btn" (click)="openDetail(p.id)">
                {{ txt.openDetail }}
              </button>
            } @else if (panelFailed()) {
              <p class="muted">{{ txt.panelFailed }}</p>
            } @else if (selectedId()) {
              <p class="muted" role="status">{{ txt.loading }}</p>
            } @else {
              <p class="muted">{{ txt.choose }}</p>
            }
          </section>
        </div>
      } @else {
        @for (card of cards(); track card.id) {
          <app-person-card
            [title]="card.title"
            [meta]="card.meta"
            [balance]="card.balance"
            (picked)="openDetail(card.id)"
          />
        } @empty {
          <p class="muted">{{ emptyText() }}</p>
        }
      }
      @if (state() === 'ready' && capped()) {
        <p class="muted">{{ txt.capped }}</p>
      }
      @if (!desktop() && canAdd()) {
        <button type="button" class="md-btn md-btn--primary" (click)="add()">
          {{ txt.add }}
        </button>
      }
    }
  `,
})
export class ContactsContainer {
  private readonly api = inject(ContactsApiService);
  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly viewport = inject(ViewportService).viewport;
  private readonly session = inject(SessionService);
  private readonly caps = this.session.capabilities;
  /** Salespeople and store associates see their own sales only (docs/PERMISSIONS.md). */
  private readonly owner = computed(() =>
    OWN_SALES_ONLY.includes(this.session.persona()) ? (this.session.user()?.id ?? null) : null,
  );
  protected readonly i18n = injectI18n();

  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  private readonly currency = computed(() => this.business.active()?.currency ?? '');
  protected readonly kinds = computed(() => contactKinds(this.caps()));
  protected readonly kind = signal<string>('customers');
  protected readonly term = signal('');
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly rows = signal<ContactRow[]>([]);
  /** The kind the loaded rows are; the filter changes before the new list arrives. */
  private readonly rowsKind = signal<ContactKind | null>(null);
  protected readonly selected = signal<string | null>(null);
  private readonly detail = signal<CustomerDetail | SupplierDetail | null>(null);
  protected readonly panelFailed = signal(false);
  /** Active or inactive contacts: deactivated ones are kept, and listed apart. */
  protected readonly status = signal<string>('active');
  protected readonly asking = signal(false);
  protected readonly switching = signal(false);
  /** What the panel's last deactivate or reactivate came to, shown until another contact is picked. */
  protected readonly switchOutcome = signal<
    'deactivated' | 'reactivated' | 'permission' | 'offline' | 'error' | null
  >(null);
  private run = 0;
  private detailRun = 0;

  protected readonly editable = computed(() =>
    editableKinds(this.caps(), 'edit').includes(this.current()),
  );

  protected readonly current = computed(() =>
    this.kinds().includes(this.kind() as ContactKind)
      ? (this.kind() as ContactKind)
      : (this.kinds()[0] ?? 'customers'),
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      title: t('contacts.title'),
      subtitle: t('contacts.subtitle', { business: this.business.active()?.name ?? '' }),
      workspaceSubtitle: t('contacts.workspaceSubtitle', {
        business: this.business.active()?.name ?? '',
        kind: t(`contacts.kinds.${this.current()}`),
      }),
      search: t('contacts.search'),
      placeholder: t('contacts.placeholder'),
      kindOptions: (['customers', 'suppliers'] as const).map((k) => ({
        value: k,
        label: t(`contacts.kinds.${k}`),
      })),
      loading: t('contacts.loading'),
      retry: t('contacts.retry'),
      choose: t('contacts.choose'),
      openDetail: t('contacts.openDetail'),
      statusLabel: t('contacts.activation.status'),
      statusOptions: (['active', 'inactive'] as const).map((k) => ({
        value: k,
        label: t(`contacts.activation.filters.${k}`),
      })),

      history: t('contacts.viewTransactions'),
      editCustomer: t('contacts.editContact'),
      editSupplier: t('contacts.editSupplier'),
      panelFailed: t('contacts.panelFailed'),
      capped: t('contacts.capped', { count: LIST_LIMIT }),
      add: t('contacts.add'),
      addDesktop: t('contacts.addDesktop'),
      error: { title: t('contacts.error.title'), message: t('contacts.error.message') },
      noAccess: { title: t('contacts.noAccess.title'), message: t('contacts.noAccess.message') },
    };
  });

  /** Balances where the rows have them: supplier money is for cost roles, and invoices may be unreadable. */
  private readonly withMoney = computed(() => {
    const rows = this.rows();
    return rows.length
      ? rows[0].outstanding !== null
      : this.current() === 'customers' || this.caps().seeCosts;
  });

  protected readonly headers = computed(() => {
    const { t } = this.i18n.tr();
    return [
      t(`contacts.headers.${this.current() === 'customers' ? 'customer' : 'supplier'}`),
      t('contacts.headers.city'),
      ...(this.withMoney() ? [t('contacts.headers.outstanding')] : []),
    ];
  });

  protected readonly cards = computed(() =>
    this.rows().map((r) => contactCard(r, this.currency(), this.i18n.tr())),
  );

  protected readonly tableRows = computed(() =>
    this.rows().map((r) => ({ id: r.id, cells: contactRow(r, this.currency()) })),
  );

  /** A full page of rows: there may be more, found by searching. */
  protected readonly capped = computed(() => this.rows().length >= LIST_LIMIT);

  protected readonly emptyText = computed(() =>
    this.i18n
      .tr()
      .t(
        this.term().trim()
          ? 'contacts.noResults'
          : this.status() === 'inactive'
            ? 'contacts.activation.noneInactive'
            : `contacts.empty.${this.current()}`,
      ),
  );

  /** The row shown in the desktop panel: the one picked, else the first, never one from another list. */
  protected readonly selectedId = computed(() => {
    const rows = this.rows();
    return rows.find((r) => r.id === this.selected())?.id ?? rows[0]?.id ?? null;
  });

  protected readonly panel = computed(() => {
    const detail = this.detail();
    if (!detail || detail.id !== this.selectedId()) {
      return null;
    }
    const tr = this.i18n.tr();
    const caps = this.caps();
    const currency = this.currency();
    if ('totals' in detail) {
      const view = customerView(detail, currency, this.i18n.language(), tr);
      return {
        id: detail.id,
        name: detail.name,
        lines: contactLines(detail),
        card: view.due
          ? { title: view.due, message: view.latest?.summary ?? '' }
          : view.latest
            ? { title: view.latest.title, message: view.latest.summary }
            : null,
        actions: detail.active ? contactActions('customers', detail, caps, tr) : [],
        recent: view.recent,
        activationLabel: tr.t(
          detail.active
            ? 'contacts.activation.deactivateCustomer'
            : 'contacts.activation.reactivateCustomer',
        ),
      };
    }
    const view = supplierView(detail, currency, tr);
    return {
      id: detail.id,
      name: detail.name,
      lines: contactLines(detail),
      card: view.balance ?? view.order,
      actions: detail.active ? contactActions('suppliers', detail, caps, tr) : [],
      recent: [],
      activationLabel: tr.t(
        detail.active
          ? 'contacts.activation.deactivateSupplier'
          : 'contacts.activation.reactivateSupplier',
      ),
    };
  });

  constructor() {
    const kind = this.route.snapshot.queryParamMap.get('kind');
    if (kind === 'customers' || kind === 'suppliers') {
      this.kind.set(kind);
    }
    if (this.route.snapshot.queryParamMap.get('status') === 'inactive') {
      this.status.set('inactive');
    }
    effect((onCleanup) => {
      const kind = this.current();
      const term = this.term();
      this.status();
      if (!this.kinds().length) {
        return;
      }
      const timer = setTimeout(
        () => untracked(() => void this.load(kind, term)),
        term ? SEARCH_DELAY_MS : 0,
      );
      onCleanup(() => clearTimeout(timer));
    });
    effect(() => {
      const kind = this.current();
      const id = this.desktop() && this.rowsKind() === kind ? this.selectedId() : null;
      untracked(() => void this.loadDetail(kind, id));
    });
  }

  protected async load(kind = this.current(), term = this.term()): Promise<void> {
    const run = ++this.run;
    this.state.set('loading');
    // A previous list's rows must not stay selectable under the new one.
    this.rows.set([]);
    this.rowsKind.set(null);
    this.selected.set(null);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const rows =
        kind === 'customers'
          ? await this.api.customerList(term, business, this.owner(), this.status() === 'active')
          : await this.api.supplierList(
              term,
              business,
              this.caps().seeCosts,
              this.status() === 'active',
            );
      if (run === this.run) {
        this.rows.set(rows);
        this.rowsKind.set(kind);
        this.state.set('ready');
      }
    } catch {
      if (run === this.run) {
        this.state.set('error');
      }
    }
  }

  private async loadDetail(kind: ContactKind, id: string | null): Promise<void> {
    const run = ++this.detailRun;
    this.detail.set(null);
    this.panelFailed.set(false);
    if (!id) {
      return;
    }
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const detail =
        kind === 'customers'
          ? await this.api.customer(id, business, this.owner())
          : await this.api.supplier(id, business, this.caps().seeCosts);
      if (run === this.detailRun) {
        this.detail.set(detail);
      }
    } catch {
      if (run === this.detailRun) {
        this.panelFailed.set(true);
      }
    }
  }

  protected readonly canAdd = computed(() => editableKinds(this.caps(), 'add').length > 0);

  protected readonly switchNotice = computed(() => {
    const outcome = this.switchOutcome();
    if (!outcome) {
      return null;
    }
    const { t } = this.i18n.tr();
    return {
      tone:
        outcome === 'deactivated' || outcome === 'reactivated'
          ? ('tint' as const)
          : ('danger' as const),
      title: t(`contacts.activation.outcome.${outcome}.title`),
      message: t(`contacts.activation.outcome.${outcome}.message`),
    };
  });

  protected readonly dialog = computed(() => {
    const detail = this.detail();
    return detail
      ? activationDialog(
          this.current(),
          detail,
          this.business.active()?.currency ?? '',
          this.i18n.tr(),
          // Own-sales roles load only their share of what a customer owes.
          this.current() === 'suppliers'
            ? 'outstanding' in detail && detail.outstanding !== null
            : !this.owner() && 'totals' in detail && detail.totals !== null,
        )
      : null;
  });

  /** Deactivates or reactivates the contact in the panel; it then leaves this list for the other one. */
  protected async answer(choice: string): Promise<void> {
    this.asking.set(false);
    const detail = this.detail();
    if (choice !== 'confirm' || !detail || this.switching()) {
      return;
    }
    this.switching.set(true);
    this.switchOutcome.set(null);
    const active = !detail.active;
    let outcome: NonNullable<ReturnType<typeof this.switchOutcome>>;
    try {
      await this.api.setActive(this.current(), detail.id, active);
      outcome = active ? 'reactivated' : 'deactivated';
    } catch (error) {
      const e = ErpnextError.from(error);
      if (e.kind === 'forbidden') {
        void this.session.checkExpired();
      }
      outcome = e.kind === 'forbidden' ? 'permission' : e.kind === 'offline' ? 'offline' : 'error';
    }
    // The value may have been set even when the answer was lost: list what ERPNext holds, and keep the
    // contact in the panel when it is still in this list.
    await this.load();
    if (this.rows().some((r) => r.id === detail.id)) {
      this.selected.set(detail.id);
    }
    this.switchOutcome.set(outcome);
    this.switching.set(false);
  }

  protected add(): void {
    void this.router.navigate(['/contacts/new'], { queryParams: { type: this.current() } });
  }

  protected pick(id: string): void {
    this.switchOutcome.set(null);
    this.selected.set(id);
  }

  protected openDetail(id: string, page?: 'history' | 'edit'): void {
    void this.router.navigate(['/contacts', this.current(), id, ...(page ? [page] : [])], {
      queryParams: this.status() === 'inactive' ? { status: 'inactive' } : {},
    });
  }

  protected act(route: string[], query: Record<string, string>): void {
    void this.router.navigate(route, { queryParams: query });
  }
}
