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
import {
  CustomerDirectoryService,
  CustomerOption,
} from '../../../core/customers/customer-directory.service';
import { UnresolvedError, newReference } from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { parseNumber } from '../../../core/format/number';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { ProjectKind } from '../data-access/project.models';
import { ProjectsApiService } from '../data-access/projects-api.service';

const SEARCH_DELAY_MS = 250;

/** Create or edit a project: name, customer or internal, an optional budget and planned date. */
@Component({
  selector: 'app-project-form',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SearchFieldComponent,
    SelectFieldComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="back()" />
    <app-page-heading [title]="name() ? txt.editTitle : txt.newTitle" [subtitle]="txt.required" />
    @if (!caps().manageProjects) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (loading()) {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else if (loadFailed()) {
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="retry()">{{ txt.retry }}</button>
    } @else {
      <app-text-field [label]="txt.name" [value]="title()" (valueChange)="title.set($event)" />
      <app-select-field
        [label]="txt.type"
        [options]="txt.kinds"
        [value]="kind()"
        (valueChange)="kind.set(($event ?? 'customer') === 'internal' ? 'internal' : 'customer')"
      />
      @if (kind() === 'customer') {
        @if (customer(); as c) {
          <app-text-field [label]="txt.customer" [value]="c.name" [readonly]="true" />
          <button type="button" class="md-btn" (click)="customer.set(null)">
            {{ txt.changeCustomer }}
          </button>
        } @else {
          <app-search-field
            [label]="txt.customer"
            [placeholder]="txt.searchCustomer"
            [(value)]="term"
          />
          @for (option of customers(); track option.id) {
            <app-item-card
              [interactive]="true"
              [title]="option.name"
              [meta]="option.phone ?? option.city"
              kind="service"
              (selected)="customer.set({ id: option.id, name: option.name })"
            />
          } @empty {
            @if (term().trim()) {
              <p class="muted">{{ txt.noCustomers }}</p>
            }
          }
        }
      }
      <app-text-field
        [label]="txt.budget"
        inputmode="decimal"
        [ltr]="true"
        [suffix]="currency()"
        [value]="budget()"
        (valueChange)="budget.set($event)"
      />
      <app-text-field
        [label]="txt.plannedDate"
        type="date"
        [value]="plannedDate()"
        (valueChange)="plannedDate.set($event)"
      />
      <app-feedback-card [title]="txt.internalTitle" [message]="txt.internalMessage" />
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
          <app-feedback-card [title]="txt.notCreated.title" [message]="txt.notCreated.message" />
        }
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="!ready() || saving()"
          (click)="save()"
        >
          {{ saving() ? txt.saving : txt.save }}
        </button>
      }
    }
  `,
})
export class ProjectFormContainer {
  /** The project being edited; absent when creating one. */
  readonly name = input<string | undefined>();

  private readonly api = inject(ProjectsApiService);
  private readonly business = inject(BusinessService);
  private readonly customersApi = inject(CustomerDirectoryService);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportService).viewport;
  private readonly session = inject(SessionService);
  protected readonly caps = this.session.capabilities;
  protected readonly i18n = injectI18n();

  protected readonly title = signal('');
  protected readonly kind = signal<ProjectKind>('customer');
  protected readonly customer = signal<{ id: string; name: string } | null>(null);
  protected readonly budget = signal('');
  protected readonly plannedDate = signal('');
  protected readonly term = signal('');
  protected readonly customers = signal<CustomerOption[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly failed = signal<'offline' | 'error' | null>(null);
  /** A create whose answer was lost: it may exist, so the user checks before saving again. */
  protected readonly unresolved = signal(false);
  protected readonly checking = signal(false);
  protected readonly pending = signal(false);
  protected readonly notCreated = signal(false);
  private readonly reference = newReference('PRJ');
  /** The project a lost create turned out to have made; later saves update it instead of creating another. */
  private created: string | null = null;
  protected readonly loadFailed = signal(false);
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  protected readonly currency = computed(() => this.business.active()?.currency ?? '');
  private searchRun = 0;
  private loadRun = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('project.back'),
      newTitle: t('project.form.newTitle'),
      editTitle: t('project.form.editTitle'),
      required: t('project.form.required'),
      name: t('project.form.name'),
      type: t('project.form.type'),
      kinds: [
        { value: 'customer', label: t('project.form.customerType') },
        { value: 'internal', label: t('project.form.internalType') },
      ],
      customer: t('project.form.customer'),
      searchCustomer: t('project.form.searchCustomer'),
      noCustomers: t('project.form.noCustomers'),
      changeCustomer: t('project.form.changeCustomer'),
      budget: t('project.form.budget'),
      plannedDate: t('project.form.plannedDate'),
      internalTitle: t('project.form.internalTitle'),
      internalMessage: t('project.form.internalMessage'),
      save: t('project.form.save'),
      saving: t('project.form.saving'),
      loading: t('project.loading'),
      retry: t('project.retry'),
      loadFailed: {
        title: t('project.overview.loadFailed.title'),
        message: t('project.overview.loadFailed.message'),
      },
      unresolved: {
        title: t('project.form.unresolved.title'),
        message: t('project.form.unresolved.message', { reference: this.reference }),
      },
      notCreated: {
        title: t('project.form.notCreated.title'),
        message: t('project.form.notCreated.message'),
      },
      check: t('sale.checking.check'),
      checking: t('sale.checking.checkingNow'),
      pending: t('sale.checking.pending'),
      failed: {
        error: { title: t('project.form.failed.title'), message: t('project.form.failed.message') },
        offline: {
          title: t('project.form.offline.title'),
          message: t('project.form.offline.message'),
        },
      },
      noAccess: {
        title: t('project.form.noAccess.title'),
        message: t('project.form.noAccess.message'),
      },
    };
  });

  private readonly budgetValue = computed(() => {
    const raw = this.budget().trim();
    return raw ? parseNumber(raw) : null;
  });

  protected readonly ready = computed(() => {
    const budget = this.budgetValue();
    return (
      !!this.title().trim() &&
      (this.kind() === 'internal' || !!this.customer()) &&
      (budget === null || (Number.isFinite(budget) && budget >= 0))
    );
  });

  constructor() {
    effect(() => {
      const name = this.name();
      if (name && this.caps().manageProjects) {
        untracked(() => void this.loadExisting(name));
      }
    });
    effect((onCleanup) => {
      const term = this.term();
      if (this.kind() !== 'customer' || this.customer()) {
        return;
      }
      const timer = setTimeout(() => untracked(() => void this.search(term)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected async save(): Promise<void> {
    // Set before the first await: a double tap must not create the project twice.
    if (
      !this.ready() ||
      this.saving() ||
      this.loading() ||
      this.loadFailed() ||
      this.unresolved()
    ) {
      return;
    }
    this.saving.set(true);
    this.failed.set(null);
    this.notCreated.set(false);
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No business to create the project in');
      }
      const saved = await this.api.save(
        business.name,
        {
          title: this.title(),
          kind: this.kind(),
          customer: this.customer()?.id ?? null,
          budget: this.budgetValue(),
          plannedDate: this.plannedDate() || null,
        },
        this.name() ?? this.created,
        this.reference,
      );
      void this.router.navigate(['/projects', saved, 'saved'], { replaceUrl: true });
    } catch (error) {
      // Only a lost insert may have created it; other failures happened before anything was sent.
      if (error instanceof UnresolvedError && !this.name() && !this.created) {
        // ERPNext may still be creating it: check by reference first, so it isn't created twice.
        this.unresolved.set(true);
      } else {
        this.failed.set(
          error instanceof UnresolvedError || ErpnextError.from(error).kind === 'offline'
            ? 'offline'
            : 'error',
        );
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async check(): Promise<void> {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    this.pending.set(false);
    try {
      const found = await this.api.findProject(this.reference);
      this.unresolved.set(false);
      if (found) {
        // Edits made while waiting are saved over it, as saving again would have.
        this.created = found;
        this.checking.set(false);
        await this.save();
        return;
      }
      this.notCreated.set(true);
    } catch (error) {
      if (ErpnextError.from(error).kind === 'forbidden') {
        // 403 is also how an expired session answers; that one goes back to sign-in.
        void this.session.checkExpired();
      }
      this.pending.set(true);
    } finally {
      this.checking.set(false);
    }
  }

  protected back(): void {
    const name = this.name();
    void this.router.navigate(name ? ['/projects', name] : ['/projects']);
  }

  protected retry(): void {
    const name = this.name();
    if (name) {
      void this.loadExisting(name);
    }
  }

  private async loadExisting(name: string): Promise<void> {
    const run = ++this.loadRun;
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const project = await this.api.projectBasics(name);
      // Moving from one project's edit page to another's reuses this form: a slow earlier load must not win.
      if (run !== this.loadRun) {
        return;
      }
      this.title.set(project.title);
      this.kind.set(project.kind);
      this.customer.set(
        project.customer
          ? { id: project.customer, name: project.customerName ?? project.customer }
          : null,
      );
      this.budget.set(project.budget ? project.budget.toFixed(2) : '');
      this.plannedDate.set(project.plannedDate ?? '');
    } catch {
      if (run === this.loadRun) {
        this.loadFailed.set(true);
      }
    } finally {
      if (run === this.loadRun) {
        this.loading.set(false);
      }
    }
  }

  private async search(term: string): Promise<void> {
    const run = ++this.searchRun;
    const found = await this.customersApi.search(term).catch(() => []);
    if (run === this.searchRun) {
      this.customers.set(found);
    }
  }
}
