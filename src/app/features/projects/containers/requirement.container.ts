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
import { parseNumber } from '../../../core/format/number';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { ItemCardComponent } from '../../../shared/ui/item-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { ProjectsApiService, SiteWarehouseMissingError } from '../data-access/projects-api.service';

const SEARCH_DELAY_MS = 250;

type Failure = 'permission' | 'offline' | 'error' | 'warehouse';
type Item = { code: string; name: string; uom: string };

/** Adds what a project needs: an item and its quantity, recorded as a material request. */
@Component({
  selector: 'app-requirement',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    ItemCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    SearchFieldComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="back()" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (!caps().manageProjects) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (state() === 'unresolved' || state() === 'checking') {
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
        [disabled]="state() !== 'unresolved'"
        (click)="check()"
      >
        {{ state() === 'checking' ? txt.checking : txt.check }}
      </button>
    } @else {
      @if (item(); as chosen) {
        <app-item-card [title]="chosen.name" [meta]="chosen.code + ' · ' + chosen.uom" />
        <button type="button" class="md-btn" (click)="item.set(null)">{{ txt.change }}</button>
        <app-text-field
          [label]="txt.qty"
          inputmode="decimal"
          [ltr]="true"
          [suffix]="chosen.uom"
          [error]="qtyError()"
          [value]="qtyInput()"
          (valueChange)="qtyInput.set($event)"
        />
        <p class="muted">{{ txt.note }}</p>
      } @else {
        <app-search-field [label]="txt.search" [placeholder]="txt.placeholder" [(value)]="term" />
        @for (result of results(); track result.code) {
          <app-item-card
            [interactive]="true"
            [title]="result.name"
            [meta]="result.code + ' · ' + result.uom"
            (selected)="item.set(result)"
          />
        } @empty {
          <p class="muted">{{ txt.noResults }}</p>
        }
      }
      @if (failure(); as f) {
        <app-feedback-card
          tone="danger"
          [title]="txt.failed[f].title"
          [message]="txt.failed[f].message"
        />
      }
      <button
        type="button"
        class="md-btn md-btn--primary"
        [disabled]="!ready() || state() === 'confirming'"
        (click)="confirm()"
      >
        {{ state() === 'confirming' ? txt.confirming : txt.confirm }}
      </button>
    }
  `,
})
export class RequirementContainer {
  readonly name = input.required<string>();

  private readonly api = inject(ProjectsApiService);
  private readonly business = inject(BusinessService);
  private readonly clock = inject(SiteClockService);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  protected readonly term = signal('');
  protected readonly results = signal<Item[]>([]);
  protected readonly item = signal<Item | null>(null);
  protected readonly qtyInput = signal('');
  protected readonly state = signal<'idle' | 'confirming' | 'unresolved' | 'checking'>('idle');
  protected readonly failure = signal<Failure | null>(null);
  protected readonly pending = signal(false);
  private readonly projectTitle = signal('');
  private reference = newReference('REQ');
  private draft: string | null = null;
  private searchRun = 0;
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');

  private readonly qty = computed(() => parseNumber(this.qtyInput()));
  protected readonly ready = computed(
    () => !!this.item() && Number.isFinite(this.qty()) && this.qty() > 0,
  );
  protected readonly qtyError = computed(() =>
    this.qtyInput().trim() && !this.ready()
      ? this.i18n.tr().t('project.requirement.qtyError')
      : null,
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    const block = (key: string) => ({ title: t(`${key}.title`), message: t(`${key}.message`) });
    return {
      back: t('project.back'),
      title: t('project.requirement.title'),
      subtitle: t('project.requirement.subtitle', {
        project: this.projectTitle() || this.name(),
        name: this.name(),
      }),
      search: t('project.requirement.search'),
      placeholder: t('project.requirement.placeholder'),
      noResults: t('project.requirement.noResults'),
      qty: t('project.requirement.qty'),
      change: t('project.requirement.change'),
      note: t('project.requirement.note'),
      confirm: t('project.requirement.confirm'),
      confirming: t('project.requirement.confirming'),
      check: t('project.requirement.check'),
      checking: t('project.requirement.checking'),
      pending: t('project.requirement.pending'),
      unresolved: block('project.requirement.unresolved'),
      noAccess: block('project.form.noAccess'),
      failed: {
        permission: block('project.requirement.failed.permission'),
        offline: block('project.requirement.failed.offline'),
        error: block('project.requirement.failed.error'),
        warehouse: block('project.requirement.failed.warehouse'),
      },
    };
  });

  constructor() {
    effect(() => {
      const name = this.name();
      untracked(
        () =>
          void this.api
            .project(name)
            .then((p) => this.projectTitle.set(p.title))
            .catch(() => undefined),
      );
    });
    effect((onCleanup) => {
      const term = this.term();
      if (this.item()) {
        return;
      }
      const timer = setTimeout(() => untracked(() => void this.search(term)), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected async confirm(): Promise<void> {
    // Set before the first await: a double tap must not add the requirement twice.
    const item = this.item();
    if (!item || !this.ready() || this.state() !== 'idle') {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    try {
      const [business] = await Promise.all([this.business.ensure(), this.clock.ensure()]);
      if (!business) {
        throw new Error('No business to add the requirement for');
      }
      await this.api.addRequirement(
        business.name,
        {
          reference: this.reference,
          project: this.name(),
          item: item.code,
          uom: item.uom,
          qty: Math.round(this.qty() * 1e6) / 1e6,
        },
        toIsoDate(this.clock.now()),
        this.draft,
        (draft) => (this.draft = draft),
      );
      this.done();
    } catch (error) {
      if (error instanceof UnresolvedError) {
        this.state.set('unresolved');
        return;
      }
      const erpnext = ErpnextError.from(error);
      this.failure.set(
        error instanceof SiteWarehouseMissingError
          ? 'warehouse'
          : erpnext.kind === 'forbidden'
            ? 'permission'
            : erpnext.kind === 'offline'
              ? 'offline'
              : 'error',
      );
      this.state.set('idle');
    }
  }

  /** Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was added. */
  protected async check(): Promise<void> {
    if (this.state() !== 'unresolved') {
      return;
    }
    this.pending.set(false);
    this.state.set('checking');
    try {
      const found = await this.api.findRequirement(this.reference);
      if (found !== 'not-found' && 'requirement' in found) {
        this.done();
        return;
      }
      if (found !== 'not-found') {
        this.draft = found.draft;
      }
      this.state.set('idle');
    } catch {
      this.pending.set(true);
      this.state.set('unresolved');
    }
  }

  protected back(): void {
    void this.router.navigate(['/projects', this.name()]);
  }

  private done(): void {
    this.reference = newReference('REQ');
    this.draft = null;
    void this.router.navigate(['/projects', this.name()], { replaceUrl: true });
  }

  private async search(term: string): Promise<void> {
    const run = ++this.searchRun;
    const found = await this.api.searchItems(term).catch(() => []);
    if (run === this.searchRun) {
      this.results.set(found);
    }
  }
}
