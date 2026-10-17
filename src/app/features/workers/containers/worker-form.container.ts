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
import { toIsoDate } from '../../../core/format/format';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { WorkersApiService } from '../data-access/workers-api.service';
import { WorkerOptions } from '../data-access/workers.models';

/** "Add worker" / "Edit worker": the details ERPNext needs for an Employee, and how to reach them. */
@Component({
  selector: 'app-worker-form',
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
    @let errors = showErrors() ? invalid() : null;
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="back()" />
    <app-page-heading
      [title]="id() ? txt.editTitle : txt.newTitle"
      [subtitle]="id() ? name() : txt.newSubtitle"
    />
    @if (!allowed()) {
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
        [message]="id() ? txt.loadFailed.message : txt.optionsFailed"
      />
      <button type="button" class="md-btn" (click)="loadForm()">{{ txt.retry }}</button>
    } @else {
      <app-text-field
        [label]="txt.name"
        autocomplete="name"
        [error]="errors?.name ? txt.nameError : null"
        [value]="name()"
        (valueChange)="name.set($event)"
      />
      <app-select-field
        [label]="txt.gender"
        [options]="genderOptions()"
        [placeholder]="txt.gender"
        [value]="gender() || null"
        (valueChange)="gender.set($event ?? '')"
      />
      @if (errors?.gender) {
        <p class="muted" role="alert">{{ txt.genderError }}</p>
      }
      <app-text-field
        [label]="txt.birthDate"
        type="date"
        [error]="errors?.birthDate ? txt.birthDateError : null"
        [value]="birthDate()"
        (valueChange)="birthDate.set($event)"
      />
      <app-select-field
        [label]="txt.designation"
        [options]="designationOptions()"
        [value]="designation()"
        (valueChange)="designation.set($event ?? '')"
      />
      <app-select-field
        [label]="txt.department"
        [options]="departmentOptions()"
        [value]="department()"
        (valueChange)="department.set($event ?? '')"
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
        [label]="txt.joined"
        type="date"
        [error]="errors?.joined ? txt.joinedError : null"
        [value]="joined()"
        (valueChange)="joined.set($event)"
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
export class WorkerFormContainer {
  /** Set when editing. */
  readonly id = input<string | undefined>();

  private readonly api = inject(WorkersApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly name = signal('');
  protected readonly gender = signal('');
  protected readonly birthDate = signal('');
  protected readonly joined = signal('');
  protected readonly designation = signal('');
  protected readonly department = signal('');
  protected readonly phone = signal('');
  private readonly options = signal<WorkerOptions | null>(null);
  private readonly today = signal('');
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
  private readonly reference = newReference('EMP');
  /** The worker a lost create turned out to have made; saving again updates it. */
  private created: string | null = null;
  private loadRun = 0;

  protected readonly allowed = computed(() => this.session.capabilities().manageWorkers);

  /** What ERPNext would refuse: the required fields, and a birth date before today and joining. */
  protected readonly invalid = computed(() => {
    const birth = this.birthDate();
    const joined = this.joined();
    const errors = {
      name: !this.name().trim(),
      gender: !this.gender(),
      birthDate: !birth || birth >= (this.today() || '9999') || (!!joined && birth >= joined),
      joined: !joined,
    };
    return Object.values(errors).some(Boolean) ? errors : null;
  });

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('workers.back'),
      newTitle: t('workers.form.newTitle'),
      editTitle: t('workers.form.editTitle'),
      newSubtitle: t('workers.form.newSubtitle', { business: this.business.active()?.name ?? '' }),
      name: t('workers.form.name'),
      nameError: t('workers.form.nameError'),
      gender: t('workers.form.gender'),
      genderError: t('workers.form.genderError'),
      birthDate: t('workers.form.birthDate'),
      birthDateError: t('workers.form.birthDateError'),
      designation: t('workers.form.designation'),
      department: t('workers.form.department'),
      phone: t('workers.form.phone'),
      joined: t('workers.form.joined'),
      joinedError: t('workers.form.joinedError'),
      save: t('workers.form.save'),
      saving: t('workers.form.saving'),
      optionsFailed: t('workers.form.optionsFailed'),
      loading: t('workers.loading'),
      retry: t('workers.retry'),
      check: t('sale.checking.check'),
      checking: t('sale.checking.checkingNow'),
      pending: t('sale.checking.pending'),
      noAccess: block('workers.form.noAccess'),
      loadFailed: block('workers.loadFailed'),
      notCreated: block('workers.form.notCreated'),
      unresolved: {
        title: t('workers.form.unresolved.title'),
        message: t('workers.form.unresolved.message', { reference: this.reference }),
      },
      failed: {
        permission: block('workers.form.failed.permission'),
        offline: block('workers.form.failed.offline'),
        error: block('workers.form.failed.error'),
      },
    };
  });

  /** ERPNext's genders in the user's words where Madar knows them; others as ERPNext names them. */
  protected readonly genderOptions = computed(() => {
    const { t } = this.i18n.tr();
    return (this.options()?.genders ?? []).map((g) => {
      const key = `workers.form.genders.${g}`;
      const label = t(key);
      return { value: g, label: label === key ? g : label };
    });
  });

  protected readonly designationOptions = computed(() => {
    const designations = this.options()?.designations ?? [];
    const current = this.designation();
    return [
      { value: '', label: this.i18n.tr().t('workers.form.designationNone') },
      // An edited worker keeps a job title that's since been removed from the list.
      ...(current && !designations.includes(current) ? [current] : []),
      ...designations,
    ].map((d) => (typeof d === 'string' ? { value: d, label: d } : d));
  });

  protected readonly departmentOptions = computed(() => {
    const departments = this.options()?.departments ?? [];
    const current = this.department();
    return [
      { value: '', label: this.i18n.tr().t('workers.form.departmentNone') },
      ...(current && !departments.some((d) => d.id === current)
        ? [{ value: current, label: current }]
        : []),
      ...departments.map((d) => ({ value: d.id, label: d.name })),
    ];
  });

  constructor() {
    effect(() => {
      this.id();
      if (this.allowed()) {
        untracked(() => void this.loadForm());
      }
    });
  }

  protected async loadForm(): Promise<void> {
    const id = this.id();
    const run = ++this.loadRun;
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        throw new Error('No active business');
      }
      const [options, value] = await Promise.all([
        this.api.options(business),
        id ? this.api.load(id) : null,
      ]);
      if (run !== this.loadRun) {
        return;
      }
      const today = toIsoDate(this.clock.now());
      this.today.set(today);
      this.options.set(options);
      if (value) {
        this.name.set(value.name);
        this.gender.set(value.gender);
        this.birthDate.set(value.birthDate);
        this.joined.set(value.joined);
        this.designation.set(value.designation);
        this.department.set(value.department);
        this.phone.set(value.phone);
      } else if (!this.joined()) {
        this.joined.set(today);
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
    // Set before the first await: a double tap must not add the worker twice.
    if (
      this.invalid() ||
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
    const existing = this.id() ?? this.created;
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const saved = await this.api.save(
        {
          name: this.name(),
          gender: this.gender(),
          birthDate: this.birthDate(),
          joined: this.joined(),
          designation: this.designation(),
          department: this.department(),
          phone: this.phone(),
        },
        existing,
        this.reference,
        business,
      );
      void this.router.navigate(['/workers', saved], { replaceUrl: true });
    } catch (error) {
      if (error instanceof UnresolvedError && !existing) {
        // ERPNext may still be adding them: check by reference first, so they aren't added twice.
        this.unresolved.set(true);
      } else {
        const erpnextError = ErpnextError.from(error);
        this.failed.set(
          erpnextError.kind === 'forbidden'
            ? 'permission'
            : error instanceof UnresolvedError || erpnextError.kind === 'offline'
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
      const found = await this.api.find(this.reference);
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
    void this.router.navigate(id ? ['/workers', id] : ['/workers']);
  }
}
