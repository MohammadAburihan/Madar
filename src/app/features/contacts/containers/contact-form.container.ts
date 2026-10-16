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
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { ContactFormApiService } from '../data-access/contact-form-api.service';
import { ContactKind } from '../data-access/contacts.models';
import { editableKinds } from './contacts-access';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Add contact" / "Edit contact": a customer's or supplier's name and how to reach them. */
@Component({
  selector: 'app-contact-form',
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
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="back()" />
    <app-page-heading
      [title]="id() ? txt.editTitle : txt.newTitle"
      [subtitle]="id() ? name() : txt.newSubtitle"
    />
    @if (!kinds().length) {
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
      <button type="button" class="md-btn" (click)="loadExisting()">{{ txt.retry }}</button>
    } @else {
      @if (!id()) {
        <app-select-field
          [label]="txt.type"
          [options]="typeOptions()"
          [value]="contactKind()"
          (valueChange)="setKind($event)"
        />
      }
      <app-text-field
        [label]="txt.name"
        autocomplete="name"
        [error]="showErrors() && !name().trim() ? txt.nameError : null"
        [value]="name()"
        (valueChange)="name.set($event)"
      />
      <app-text-field
        [label]="txt.phone"
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        [ltr]="true"
        [value]="phone()"
        (valueChange)="phone.set($event)"
      />
      <app-text-field
        [label]="txt.email"
        type="email"
        inputmode="email"
        autocomplete="email"
        [ltr]="true"
        [error]="emailInvalid() ? txt.emailError : null"
        [value]="email()"
        (valueChange)="email.set($event)"
      />
      <app-text-field
        [label]="txt.address"
        autocomplete="street-address"
        [value]="address()"
        (valueChange)="address.set($event)"
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
          <app-feedback-card
            tone="warning"
            [title]="txt.notCreated.title"
            [message]="txt.notCreated.message"
          />
        }
        <button type="button" class="md-btn md-btn--primary" [disabled]="saving()" (click)="save()">
          {{ saving() ? txt.saving : txt.save }}
        </button>
      }
    }
  `,
})
export class ContactFormContainer {
  /** Set when editing: the contact's kind and id from the route. */
  readonly kind = input<string | undefined>();
  readonly id = input<string | undefined>();
  /** "Add" from a list: the kind it was on. */
  readonly type = input<string | undefined>();

  private readonly api = inject(ContactFormApiService);
  private readonly business = inject(BusinessService);
  private readonly session = inject(SessionService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly address = signal('');
  private readonly chosenKind = signal<ContactKind | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failed = signal<'permission' | 'offline' | 'error' | null>(null);
  /** A create whose answer was lost: it may exist, so the user checks before saving again. */
  protected readonly unresolved = signal(false);
  protected readonly checking = signal(false);
  protected readonly pending = signal(false);
  protected readonly notCreated = signal(false);
  private readonly reference = newReference('CON');
  /** The contact a lost create turned out to have made; saving again updates it. */
  private created: string | null = null;
  private loadRun = 0;

  /** Which kinds the role may add, or the one being edited when the role may edit it. */
  protected readonly kinds = computed(() => {
    const caps = this.session.capabilities();
    const kind = this.kind();
    if (this.id()) {
      const editing: ContactKind = kind === 'suppliers' ? 'suppliers' : 'customers';
      return editableKinds(caps, 'edit').includes(editing) ? [editing] : [];
    }
    return editableKinds(caps, 'add');
  });

  protected readonly contactKind = computed<ContactKind>(() => {
    const kinds = this.kinds();
    const wanted = this.chosenKind() ?? (this.kind() || this.type());
    return kinds.find((k) => k === wanted) ?? kinds[0] ?? 'customers';
  });

  protected readonly emailInvalid = computed(
    () => !!this.email().trim() && !EMAIL.test(this.email().trim()),
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('contacts.back'),
      newTitle: t('contacts.form.newTitle'),
      editTitle: t('contacts.form.editTitle'),
      newSubtitle: t('contacts.form.newSubtitle'),
      type: t('contacts.form.type'),
      name: t('contacts.form.name'),
      nameError: t('contacts.form.nameError'),
      phone: t('contacts.form.phone'),
      email: t('contacts.form.email'),
      emailError: t('contacts.form.emailError'),
      address: t('contacts.form.address'),
      save: t('contacts.form.save'),
      saving: t('contacts.form.saving'),
      loading: t('contacts.loading'),
      retry: t('contacts.retry'),
      check: t('sale.checking.check'),
      checking: t('sale.checking.checkingNow'),
      pending: t('sale.checking.pending'),
      noAccess: block('contacts.form.noAccess'),
      loadFailed: block('contacts.loadFailed'),
      notCreated: block('contacts.form.notCreated'),
      unresolved: {
        title: t('contacts.form.unresolved.title'),
        message: t('contacts.form.unresolved.message', { reference: this.reference }),
      },
      failed: {
        permission: block('contacts.form.failed.permission'),
        offline: block('contacts.form.failed.offline'),
        error: block('contacts.form.failed.error'),
      },
    };
  });

  protected readonly typeOptions = computed(() => {
    const { t } = this.i18n.tr();
    return this.kinds().map((k) => ({ value: k, label: t(`contacts.form.types.${k}`) }));
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (id && this.kinds().length) {
        untracked(() => void this.loadExisting());
      }
    });
  }

  protected setKind(kind: string | null): void {
    this.chosenKind.set(kind === 'suppliers' ? 'suppliers' : 'customers');
  }

  protected async loadExisting(): Promise<void> {
    const id = this.id();
    if (!id) {
      return;
    }
    const run = ++this.loadRun;
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const value = await this.api.load(this.contactKind(), id);
      if (run === this.loadRun) {
        this.name.set(value.name);
        this.phone.set(value.phone);
        this.email.set(value.email);
        this.address.set(value.address);
      }
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

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    // Set before the first await: a double tap must not create the contact twice.
    if (
      !this.name().trim() ||
      this.emailInvalid() ||
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
    const kind = this.contactKind();
    const existing = this.id() ?? this.created;
    try {
      const business = await this.business.ensure();
      const saved = await this.api.save(
        kind,
        { name: this.name(), phone: this.phone(), email: this.email(), address: this.address() },
        existing,
        this.reference,
        business?.country ?? '',
      );
      void this.router.navigate(['/contacts', kind, saved], { replaceUrl: true });
    } catch (error) {
      if (error instanceof UnresolvedError && !existing) {
        // ERPNext may still be creating it: check by reference first, so it isn't created twice.
        this.unresolved.set(true);
      } else {
        const kindOf = ErpnextError.from(error).kind;
        this.failed.set(
          kindOf === 'forbidden'
            ? 'permission'
            : error instanceof UnresolvedError || kindOf === 'offline'
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
      const found = await this.api.find(this.contactKind(), this.reference);
      this.unresolved.set(false);
      if (found) {
        // Edits made while waiting are saved over it, as saving again would have.
        this.created = found;
        this.checking.set(false);
        await this.save();
        return;
      }
      this.notCreated.set(true);
    } catch {
      this.pending.set(true);
    } finally {
      this.checking.set(false);
    }
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/contacts', this.contactKind(), id] : ['/contacts'], {
      queryParams: id ? {} : { kind: this.contactKind() },
    });
  }
}
