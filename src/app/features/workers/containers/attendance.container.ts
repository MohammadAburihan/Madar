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
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { formatShortDate, toIsoDate } from '../../../core/format/format';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SelectFieldComponent } from '../../../shared/ui/select-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { AttendanceApiService } from '../data-access/attendance-api.service';
import { AttendanceStatus, SheetRow } from '../data-access/workers.models';
import { saveLabel, sheetRowView, statusOptions } from './attendance-view';

/** "Mark attendance": the day's sheet of active workers, each marked present, absent, half day or from home. */
@Component({
  selector: 'app-attendance',
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
  styles: `
    .row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .row .label {
      margin: 0;
      color: var(--md-ink);
      font: 600 15px / var(--md-lh) var(--md-font);
    }
  `,
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="back()" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (!allowed()) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else {
      <app-text-field
        [label]="txt.date"
        type="date"
        [error]="dateInvalid() ? txt.dateError : null"
        [readonly]="saving()"
        [value]="date()"
        (valueChange)="setDate($event)"
      />
      @if (state() === 'loading') {
        <p class="muted" role="status">{{ txt.loading }}</p>
      } @else if (state() === 'error') {
        <app-feedback-card
          tone="danger"
          [title]="txt.loadFailed.title"
          [message]="txt.loadFailed.message"
        />
        <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
      } @else {
        @for (row of rowViews(); track row.id) {
          @if (row.note) {
            <div class="row" role="group" [attr.aria-label]="row.label">
              <p class="label">{{ row.label }}</p>
              <p class="muted">{{ row.note }}</p>
            </div>
          } @else {
            <app-select-field
              [label]="row.label"
              [options]="options()"
              [value]="choice(row.id)"
              (valueChange)="choose(row.id, $event)"
            />
          }
        } @empty {
          @if (!dateInvalid()) {
            <p class="muted">{{ txt.empty }}</p>
          }
        }
        @if (saved(); as s) {
          <app-feedback-card tone="tint" [title]="txt.saved.title" [message]="s" />
        }
        @if (failed(); as f) {
          <app-feedback-card
            tone="danger"
            [title]="txt.failed[f].title"
            [message]="f === 'error' ? refusedText() : txt.failed[f].message"
          />
        }
        @if (unresolved()) {
          <app-feedback-card
            tone="warning"
            [title]="txt.unresolved.title"
            [message]="txt.unresolved.message"
          />
          <button type="button" class="md-btn md-btn--primary" (click)="check()">
            {{ txt.check }}
          </button>
        } @else if (open().length) {
          <button
            type="button"
            class="md-btn md-btn--primary"
            [disabled]="saving() || dateInvalid()"
            (click)="save()"
          >
            {{ saving() ? txt.saving : saveText() }}
          </button>
        } @else if (rows().length) {
          <p class="muted">{{ txt.none }}</p>
        }
        <p class="muted">{{ txt.note }}</p>
      }
    }
  `,
})
export class AttendanceContainer {
  /** Optional: the day to open, as on a link. */
  readonly day = input<string | undefined>(undefined, { alias: 'date' });

  private readonly api = inject(AttendanceApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly allowed = computed(() => this.session.capabilities().manageWorkers);
  protected readonly date = signal('');
  private readonly today = signal('');
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly rows = signal<SheetRow[]>([]);
  private readonly choices = signal<Record<string, AttendanceStatus>>({});
  protected readonly saving = signal(false);
  protected readonly saved = signal<string | null>(null);
  protected readonly failed = signal<'permission' | 'offline' | 'error' | null>(null);
  protected readonly unresolved = signal(false);
  /** Workers ERPNext refused in the last save, named so the user can fix their setup. */
  protected readonly refused = signal<string[]>([]);
  private run = 0;
  private loadedDate = '';

  protected readonly dateInvalid = computed(
    () => !this.date() || (!!this.today() && this.date() > this.today()),
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('workers.back'),
      title: t('workers.attendance.title'),
      subtitle: t('workers.attendance.subtitle', { business: this.business.active()?.name ?? '' }),
      date: t('workers.attendance.date'),
      dateError: t('workers.attendance.dateError'),
      loading: t('workers.attendance.loading'),
      retry: t('workers.retry'),
      empty: t('workers.attendance.empty'),
      none: t('workers.attendance.none'),
      note: t('workers.attendance.note'),
      saving: t('workers.attendance.saving'),
      check: t('workers.attendance.check'),
      saved: { title: t('workers.attendance.saved.title') },
      unresolved: block('workers.attendance.unresolved'),
      loadFailed: block('workers.attendance.loadFailed'),
      noAccess: block('workers.noAccess'),
      failed: {
        permission: block('workers.attendance.failed.permission'),
        offline: block('workers.attendance.failed.offline'),
        error: block('workers.attendance.failed.error'),
      },
    };
  });

  protected readonly options = computed(() => statusOptions(this.i18n.tr()));

  protected readonly rowViews = computed(() =>
    this.rows().map((r) => sheetRowView(r, this.i18n.language(), this.i18n.tr())),
  );

  protected readonly open = computed(() => this.rows().filter((r) => r.state.kind === 'open'));

  protected readonly refusedText = computed(() => {
    const { t } = this.i18n.tr();
    const names = this.refused();
    return names.length
      ? t('workers.attendance.failed.error.message', {
          workers: names.join(this.i18n.language() === 'ar' ? '، ' : ', '),
        })
      : t('workers.error.message');
  });

  protected readonly saveText = computed(() => saveLabel(this.open().length, this.i18n.tr()));

  constructor() {
    effect(() => {
      const day = this.day();
      if (this.allowed()) {
        untracked(() => void this.start(day));
      }
    });
  }

  protected choice(id: string): AttendanceStatus {
    return this.choices()[id] ?? 'Present';
  }

  protected choose(id: string, status: string | null): void {
    this.choices.update((c) => ({ ...c, [id]: (status ?? 'Present') as AttendanceStatus }));
  }

  protected setDate(date: string): void {
    // The day stays put while a save for it runs, and until the site's today is known.
    if (this.saving() || !this.today() || date === this.date()) {
      return;
    }
    this.date.set(date);
    this.saved.set(null);
    this.failed.set(null);
    this.unresolved.set(false);
    if (!this.dateInvalid()) {
      void this.load();
    } else {
      // No sheet for a day that can't be marked; a load still running for the last day is dropped.
      this.run++;
      this.rows.set([]);
      this.state.set('ready');
    }
  }

  private async start(day: string | undefined): Promise<void> {
    await this.clock.ensure();
    const today = toIsoDate(this.clock.now());
    this.today.set(today);
    this.date.set(day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today ? day : today);
    await this.load();
  }

  protected async load(): Promise<void> {
    const run = ++this.run;
    const date = this.date();
    this.state.set('loading');
    this.rows.set([]);
    // Choices belong to the day they were made for; reloading the same day keeps those still to save.
    if (date !== this.loadedDate) {
      this.choices.set({});
    }
    this.loadedDate = date;
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      const rows = await this.api.sheet(date, business);
      if (run === this.run) {
        this.rows.set(rows);
        this.state.set('ready');
      }
    } catch {
      if (run === this.run) {
        this.state.set('error');
      }
    }
  }

  protected async save(): Promise<void> {
    if (this.saving() || this.dateInvalid() || this.unresolved()) {
      return;
    }
    const date = this.date();
    // What to send, fixed now: nothing the user does while it runs changes it.
    const marks = this.open().map((row) => ({
      id: row.id,
      name: row.name,
      status: this.choice(row.id),
    }));
    const refused: string[] = [];
    this.saving.set(true);
    this.saved.set(null);
    this.failed.set(null);
    let marked = 0;
    let unresolved = false;
    let failure: 'permission' | 'offline' | 'error' | null = null;
    try {
      const business = await this.business.ensure();
      if (!business) {
        throw new Error('No active business');
      }
      for (const row of marks) {
        try {
          const result = await this.api.mark(row.id, date, row.status, business);
          if (result === 'marked') {
            marked++;
          } else if (result === 'unresolved') {
            unresolved = true;
          }
        } catch (error) {
          const kind = ErpnextError.from(error).kind;
          failure = kind === 'forbidden' ? 'permission' : kind === 'offline' ? 'offline' : 'error';
          if (failure === 'error') {
            refused.push(row.name);
          } else {
            if (kind === 'forbidden') {
              // A 403 is also what an expired session gets; the shell then asks to sign in again.
              void this.session.checkExpired();
            }
            // The rest would fail the same way.
            break;
          }
        }
      }
    } catch {
      failure = 'error';
    } finally {
      this.saving.set(false);
    }
    // The day as ERPNext now has it: rows just marked, by this save or a lost answer, leave the sheet.
    if (date !== this.date()) {
      return;
    }
    // Notices first: picking another day during the reload below clears them, never the other way round.
    this.failed.set(failure);
    this.refused.set(refused);
    if (marked && !unresolved) {
      const tr = this.i18n.tr();
      this.saved.set(
        tr.t('workers.attendance.saved.message', {
          workers: tr.plural('workers.attendance.workers', marked),
          date: formatShortDate(date, this.i18n.language()),
        }),
      );
    }
    if (unresolved) {
      this.unresolved.set(true);
    } else {
      await this.load();
    }
  }

  /** Reads the day again: whatever a lost answer saved shows as marked, the rest can be saved again. */
  protected async check(): Promise<void> {
    this.unresolved.set(false);
    this.failed.set(null);
    await this.load();
  }

  protected back(): void {
    void this.router.navigate(['/workers']);
  }
}
