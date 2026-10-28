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
import {
  PrefillNotice,
  PrefillUnavailableError,
  injectPrefillEntry,
  prefillNoticeText,
} from '../../../core/tasks/prefill-entry';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { BankDetailsSectionComponent } from '../components/bank-details-section.component';
import { BankChangedError, ContactBankApiService } from '../data-access/contact-bank-api.service';
import { ContactFormApiService } from '../data-access/contact-form-api.service';
import { BankAccountRecord, ContactKind } from '../data-access/contacts.models';
import {
  bankChanged,
  bankDetailsOf,
  bankErrors,
  bankSuggestions,
  resolveBank,
} from './bank-details-view';
import { editableKinds } from './contacts-access';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Add contact" / "Edit contact": a customer's or supplier's name and how to reach them. */
@Component({
  selector: 'app-contact-form',
  imports: [
    BackLinkComponent,
    BankDetailsSectionComponent,
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
    @if (assistantNotice(); as notice) {
      <app-feedback-card [tone]="notice.tone" [title]="notice.title" [message]="notice.message" />
    }
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
      @if (!id() && !lockedKind()) {
        <app-select-field
          [label]="txt.type"
          [options]="typeOptions()"
          [value]="contactKind()"
          (valueChange)="setKind($event)"
        />
      }
      <app-text-field
        [label]="txt.name"
        [readonly]="!!bankFailure()"
        autocomplete="name"
        [error]="showErrors() && !name().trim() ? txt.nameError : null"
        [value]="name()"
        (valueChange)="name.set($event)"
      />
      <app-text-field
        [label]="txt.phone"
        [readonly]="!!bankFailure()"
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        [ltr]="true"
        [value]="phone()"
        (valueChange)="phone.set($event)"
      />
      <app-text-field
        [label]="txt.email"
        [readonly]="!!bankFailure()"
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
        [readonly]="!!bankFailure()"
        autocomplete="street-address"
        [value]="address()"
        (valueChange)="address.set($event)"
      />
      @if (bankShown()) {
        @if (bankState() === 'loading') {
          <p class="muted" role="status">{{ txt.bank.loading }}</p>
        } @else if (bankState() === 'failed') {
          <app-feedback-card
            tone="danger"
            [title]="txt.bank.loadFailed.title"
            [message]="txt.bank.loadFailed.message"
          />
          <button type="button" class="md-btn" (click)="loadBank()">{{ txt.retry }}</button>
        } @else {
          <app-bank-details-section
            [text]="txt.bank.section"
            [bank]="bankText()"
            (bankChange)="bankText.set($event)"
            [iban]="iban()"
            (ibanChange)="iban.set($event)"
            [accountNo]="accountNo()"
            (accountNoChange)="accountNo.set($event)"
            [suggestions]="suggestions()"
            [bankError]="showErrors() ? bankFieldErrors().bank : null"
            [readonly]="!!bankFailure()"
            [ibanError]="bankFieldErrors().iban"
            [submitted]="showErrors()"
            [accountNoError]="bankFieldErrors().accountNo"
            (pick)="pickBank($event)"
          />
        }
      }
      @if (failed(); as f) {
        <app-feedback-card
          tone="danger"
          [title]="txt.failed[f].title"
          [message]="txt.failed[f].message"
        />
      }
      @if (bankFailure(); as bf) {
        <app-feedback-card
          tone="warning"
          [title]="txt.bank[bf].title"
          [message]="txt.bank[bf].message"
        />
        @if (bf === 'changed') {
          <button type="button" class="md-btn md-btn--primary" (click)="loadBank()">
            {{ txt.bank.reload }}
          </button>
        } @else {
          <button
            type="button"
            class="md-btn md-btn--primary"
            [disabled]="saving()"
            (click)="retryBank()"
          >
            {{ saving() ? txt.saving : txt.bank.retry }}
          </button>
        }
        <button type="button" class="md-btn" (click)="finish()">{{ txt.bank.continue }}</button>
      } @else if (unresolved()) {
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
        <button
          type="button"
          class="md-btn md-btn--primary"
          [disabled]="saving() || bankBlocked()"
          (click)="save()"
        >
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
  private readonly bank = inject(ContactBankApiService);
  private readonly business = inject(BusinessService);
  private readonly session = inject(SessionService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly assistantNotice = computed(() => {
    const notice = this.prefillNotice();
    return notice ? prefillNoticeText(this.i18n.tr(), notice, 'new_customer') : null;
  });
  private readonly prefillNotice = signal<PrefillNotice | null>(null);

  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly address = signal('');
  private readonly chosenKind = signal<ContactKind | null>(null);
  /** Fixed once a create is sent: checking and saving again must stay with that kind. */
  protected readonly lockedKind = signal<ContactKind | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failed = signal<'permission' | 'offline' | 'duplicate' | 'error' | null>(null);
  /** A create whose answer was lost: it may exist, so the user checks before saving again. */
  protected readonly unresolved = signal(false);
  protected readonly checking = signal(false);
  protected readonly pending = signal(false);
  protected readonly notCreated = signal(false);
  protected readonly bankText = signal('');
  protected readonly iban = signal('');
  protected readonly accountNo = signal('');
  protected readonly bankState = signal<'loading' | 'ready' | 'failed' | 'hidden'>('loading');
  /** The contact is saved but its bank step isn't: only that step is retried. */
  protected readonly bankFailure = signal<'notSaved' | 'changed' | null>(null);
  private readonly banks = signal<string[]>([]);
  private readonly addedBank = signal<string | null>(null);
  private loadedAccount: BankAccountRecord | null = null;
  private bankRun = 0;
  private savedId: string | null = null;
  private readonly referenceId = signal(newReference('CON'));
  /** The contact a lost create turned out to have made; saving again updates it. */
  private created: string | null = null;
  private loadRun = 0;
  private entered = false;
  private visit = 0;
  private finished = false;

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
    const wanted = this.lockedKind() ?? this.chosenKind() ?? (this.kind() || this.type());
    return kinds.find((k) => k === wanted) ?? kinds[0] ?? 'customers';
  });

  private readonly bankEntered = computed(
    () => !!(this.bankText().trim() || this.iban().trim() || this.accountNo().trim()),
  );
  protected readonly bankBlocked = computed(
    () => this.bankShown() && this.bankState() !== 'ready' && this.bankEntered(),
  );
  protected readonly bankShown = computed(
    () => this.session.capabilities().editBankDetails && this.bankState() !== 'hidden',
  );
  private readonly canAddBanks = computed(() => this.session.capabilities().addBanks);
  private readonly bankChoice = computed(() =>
    resolveBank(this.banks(), this.bankText(), this.addedBank()),
  );
  protected readonly suggestions = computed(() =>
    bankSuggestions(this.banks(), this.bankText(), this.canAddBanks(), this.i18n.tr()),
  );
  protected readonly bankFieldErrors = computed(() =>
    bankErrors(
      this.bankChoice(),
      this.iban(),
      this.accountNo(),
      this.canAddBanks(),
      this.i18n.tr(),
    ),
  );

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
      bank: {
        section: {
          heading: t('contacts.bank.heading'),
          bank: t('contacts.bank.bank'),
          bankPlaceholder: t('contacts.bank.bankPlaceholder'),
          iban: t('contacts.bank.iban'),
          accountNo: t('contacts.bank.accountNo'),
        },
        loading: t('contacts.bank.loading'),
        loadFailed: block('contacts.bank.loadFailed'),
        notSaved: block('contacts.bank.notSaved'),
        changed: block('contacts.bank.changed'),
        retry: t('contacts.bank.retry'),
        reload: t('contacts.bank.reload'),
        continue: t('contacts.bank.continue'),
      },
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
        message: t('contacts.form.unresolved.message', { reference: this.referenceId() }),
      },
      failed: {
        permission: block('contacts.form.failed.permission'),
        offline: block('contacts.form.failed.offline'),
        duplicate: block('contacts.form.failed.duplicate'),
        error: block('contacts.form.failed.error'),
      },
    };
  });

  protected readonly typeOptions = computed(() => {
    const { t } = this.i18n.tr();
    return this.kinds().map((k) => ({ value: k, label: t(`contacts.form.types.${k}`) }));
  });

  constructor() {
    injectPrefillEntry(
      ['new_customer', 'new_supplier'],
      async (payload, kind) => {
        const wanted: ContactKind = kind === 'new_supplier' ? 'suppliers' : 'customers';
        if (this.id() || !this.kinds().includes(wanted)) {
          throw new PrefillUnavailableError('not allowed for your role');
        }
        this.chosenKind.set(wanted);
        this.name.set(payload.name);
        this.phone.set(payload.phone ?? '');
        this.email.set(payload.email ?? '');
        this.address.set('address' in payload ? (payload.address ?? '') : '');
        this.prefillNotice.set('filled');
        return 'opened';
      },
      (notice) => this.prefillNotice.set(notice),
    );
    effect(() => {
      const id = this.id();
      if (id && this.kinds().length) {
        untracked(() => void this.loadExisting());
      }
    });
    effect(() => {
      this.id();
      if (this.kinds().length) {
        untracked(() => void this.loadBank());
      }
    });
  }

  /** Ionic keeps this page alive when it is left and reopened at the same address: each visit starts clean. */
  ionViewWillEnter(): void {
    if (!this.entered) {
      this.entered = true;
      return;
    }
    if (
      this.saving() ||
      (this.bankFailure() && !this.finished) ||
      this.unresolved() ||
      this.notCreated()
    ) {
      return;
    }
    this.visit++;
    this.finished = false;
    this.loadRun++;
    this.bankRun++;
    this.created = null;
    this.savedId = null;
    this.referenceId.set(newReference('CON'));
    this.lockedKind.set(null);
    this.chosenKind.set(null);
    this.prefillNotice.set(null);
    this.name.set('');
    this.phone.set('');
    this.email.set('');
    this.address.set('');
    this.showErrors.set(false);
    this.failed.set(null);
    this.unresolved.set(false);
    this.checking.set(false);
    this.pending.set(false);
    this.notCreated.set(false);
    this.saving.set(false);
    this.loadFailed.set(false);
    this.loading.set(false);
    this.bankFailure.set(null);
    this.loadedAccount = null;
    this.bankText.set('');
    this.iban.set('');
    this.accountNo.set('');
    this.addedBank.set(null);
    this.bankState.set('loading');
    if (this.id() && this.kinds().length) {
      void this.loadExisting();
    }
    if (this.kinds().length) {
      void this.loadBank();
    }
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

  protected pickBank(suggestion: { value: string; add: boolean }): void {
    this.addedBank.set(suggestion.add ? suggestion.value : null);
  }

  /** The bank list, and for an existing contact its account; a role ERPNext keeps out of them doesn't see the section. */
  protected async loadBank(): Promise<void> {
    if (!this.session.capabilities().editBankDetails) {
      this.bankState.set('hidden');
      return;
    }
    const run = ++this.bankRun;
    const id = this.id();
    const kind = this.contactKind();
    this.bankState.set('loading');
    this.bankFailure.set(null);
    try {
      const [banks, account] = await Promise.all([
        this.bank.banks(),
        id ? this.bank.account(kind, id) : Promise.resolve(null),
      ]);
      if (run !== this.bankRun) {
        return;
      }
      this.banks.set(banks);
      this.loadedAccount = account;
      const held = account && !account.disabled ? account : null;
      this.bankText.set(held?.bank ?? '');
      this.iban.set(held?.iban ?? '');
      this.accountNo.set(held?.accountNo ?? '');
      this.addedBank.set(null);
      this.bankState.set('ready');
    } catch (error) {
      if (run === this.bankRun) {
        this.bankState.set(ErpnextError.from(error).kind === 'forbidden' ? 'hidden' : 'failed');
      }
    }
  }

  /** The bank step on its own: it looks before it writes, so doing it again never doubles anything. */
  private async writeBank(kind: ContactKind, id: string): Promise<boolean> {
    if (!this.bankShown() || this.bankState() !== 'ready') {
      return true;
    }
    const visit = this.visit;
    const choice = this.bankChoice();
    const details = bankDetailsOf(choice, this.iban(), this.accountNo());
    if (!bankChanged(details, this.loadedAccount)) {
      return true;
    }
    try {
      const saved = await this.bank.save(
        kind,
        id,
        details,
        this.loadedAccount,
        choice.kind === 'new',
      );
      if (visit !== this.visit) {
        return false;
      }
      this.loadedAccount = saved;
      if (choice.kind === 'new') {
        this.banks.update((list) => [...list, saved?.bank ?? choice.name]);
      }
      this.bankFailure.set(null);
      return true;
    } catch (error) {
      if (visit !== this.visit) {
        return false;
      }
      if (ErpnextError.from(error).kind === 'forbidden') {
        void this.session.checkExpired();
      }
      this.bankFailure.set(error instanceof BankChangedError ? 'changed' : 'notSaved');
      return false;
    }
  }

  protected async retryBank(): Promise<void> {
    const id = this.savedId;
    this.showErrors.set(true);
    if (!id || this.saving() || Object.values(this.bankFieldErrors()).some((e) => !!e)) {
      return;
    }
    this.saving.set(true);
    try {
      if (await this.writeBank(this.contactKind(), id)) {
        this.finish();
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected finish(): void {
    if (this.savedId) {
      this.finished = true;
      void this.router.navigate(['/contacts', this.contactKind(), this.savedId], {
        replaceUrl: true,
      });
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
      this.unresolved() ||
      this.bankBlocked() ||
      (this.bankShown() &&
        this.bankState() === 'ready' &&
        Object.values(this.bankFieldErrors()).some((e) => !!e))
    ) {
      return;
    }
    this.saving.set(true);
    this.failed.set(null);
    this.notCreated.set(false);
    const visit = this.visit;
    const kind = this.contactKind();
    const existing = this.id() ?? this.created;
    if (!existing) {
      this.lockedKind.set(kind);
    }
    try {
      const business = await this.business.ensure();
      const saved = await this.api.save(
        kind,
        { name: this.name(), phone: this.phone(), email: this.email(), address: this.address() },
        existing,
        this.referenceId(),
        business?.country ?? '',
      );
      if (visit !== this.visit) {
        return;
      }
      if (!this.id()) {
        this.created = saved;
      }
      this.savedId = saved;
      if ((await this.writeBank(kind, saved)) && visit === this.visit) {
        void this.router.navigate(['/contacts', kind, saved], { replaceUrl: true });
      }
    } catch (error) {
      if (visit !== this.visit) {
        return;
      }
      if (error instanceof UnresolvedError && !existing) {
        // ERPNext may still be creating it: check by reference first, so it isn't created twice.
        this.unresolved.set(true);
      } else {
        const erpnextError = ErpnextError.from(error);
        this.failed.set(
          erpnextError.kind === 'forbidden'
            ? 'permission'
            : error instanceof UnresolvedError || erpnextError.kind === 'offline'
              ? 'offline'
              : erpnextError.excType === 'DuplicateEntryError'
                ? 'duplicate'
                : 'error',
        );
      }
    } finally {
      if (visit === this.visit) {
        this.saving.set(false);
      }
    }
  }

  protected async check(): Promise<void> {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    this.pending.set(false);
    const visit = this.visit;
    try {
      const found = await this.api.find(this.contactKind(), this.referenceId());
      if (visit !== this.visit) {
        return;
      }
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
      if (visit === this.visit) {
        this.pending.set(true);
      }
    } finally {
      if (visit === this.visit) {
        this.checking.set(false);
      }
    }
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/contacts', this.contactKind(), id] : ['/contacts'], {
      queryParams: id ? {} : { kind: this.contactKind() },
    });
  }
}
