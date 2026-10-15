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
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip.component';
import { TotalsCardComponent } from '../../../shared/ui/totals-card.component';
import { ProjectSectionComponent } from '../components/project-section.component';
import { ProjectDetail } from '../data-access/project.models';
import { ProjectsApiService } from '../data-access/projects-api.service';
import {
  attachmentCard,
  budgetStats,
  linkedRows,
  overviewHeading,
  requirementRow,
  taskCard,
} from './project-view';

/** One project: budget against cost, next tasks, material requirements, attachments and linked records. */
@Component({
  selector: 'app-project',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
    ProjectSectionComponent,
    StatCardComponent,
    StatusChipComponent,
    TotalsCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="router.navigate(['/projects'])" />
    @if (!caps().manageProjects) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (view(); as v) {
      <app-page-heading [title]="v.heading.title" [subtitle]="v.heading.subtitle" />
      <app-status-chip [label]="v.heading.chip.label" [tone]="v.heading.chip.tone" />
      <app-stat-card [stats]="v.stats" />
      <app-project-section [heading]="txt.tasks" [items]="v.tasks" [empty]="txt.noTasks" />
      <app-project-section
        [heading]="txt.requirements"
        [rows]="v.requirements"
        [empty]="txt.noRequirements"
      />
      <app-project-section
        [heading]="txt.attachments"
        [items]="v.attachments"
        [empty]="txt.noAttachments"
      />
      <app-project-section
        [heading]="txt.linked"
        [empty]="txt.noLinked"
        [hasContent]="!!v.linked.length"
      >
        <app-totals-card density="compact" [rows]="v.linked" />
      </app-project-section>
      <button type="button" class="md-btn md-btn--primary" (click)="addRequirement()">
        {{ txt.addRequirement }}
      </button>
      <button type="button" class="md-btn" (click)="edit()">{{ txt.edit }}</button>
    } @else if (failed()) {
      <app-page-heading [title]="txt.title" [subtitle]="name()" />
      <app-feedback-card
        tone="danger"
        [title]="txt.loadFailed.title"
        [message]="txt.loadFailed.message"
      />
      <button type="button" class="md-btn" (click)="load(name())">{{ txt.retry }}</button>
    } @else {
      <p class="muted" role="status">{{ txt.loading }}</p>
    }
  `,
})
export class ProjectContainer {
  readonly name = input.required<string>();

  private readonly api = inject(ProjectsApiService);
  private readonly business = inject(BusinessService);
  protected readonly router = inject(Router);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  private readonly project = signal<ProjectDetail | null>(null);
  protected readonly failed = signal(false);
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  private run = 0;

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('project.back'),
      title: t('project.title'),
      tasks: t('project.overview.tasks'),
      noTasks: t('project.overview.noTasks'),
      requirements: t('project.overview.requirements'),
      noRequirements: t('project.overview.noRequirements'),
      attachments: t('project.overview.attachments'),
      noAttachments: t('project.overview.noAttachments'),
      linked: t('project.overview.linked'),
      noLinked: t('project.overview.noLinked'),
      addRequirement: t('project.overview.addRequirement'),
      edit: t('project.overview.edit'),
      loading: t('project.loading'),
      retry: t('project.retry'),
      noAccess: { title: t('project.noAccess.title'), message: t('project.noAccess.message') },
      loadFailed: {
        title: t('project.overview.loadFailed.title'),
        message: t('project.overview.loadFailed.message'),
      },
    };
  });

  protected readonly view = computed(() => {
    const project = this.project();
    if (!project) {
      return null;
    }
    const tr = this.i18n.tr();
    const language = this.i18n.language();
    const currency = this.business.active()?.currency ?? '';
    return {
      heading: overviewHeading(project, tr),
      stats: budgetStats(project, currency, tr),
      tasks: project.tasks.map((task) => taskCard(task, language, tr)),
      requirements: project.requirements.map((r) => requirementRow(r, tr)),
      attachments: project.attachments.map((a) => attachmentCard(a, language)),
      linked: linkedRows(project.linked, currency, tr),
    };
  });

  constructor() {
    effect(() => {
      const name = this.name();
      if (this.caps().manageProjects) {
        untracked(() => void this.load(name));
      }
    });
  }

  protected async load(name: string): Promise<void> {
    const run = ++this.run;
    this.project.set(null);
    this.failed.set(false);
    try {
      await this.business.ensure();
      const project = await this.api.project(name);
      if (run === this.run) {
        this.project.set(project);
      }
    } catch {
      if (run === this.run) {
        this.failed.set(true);
      }
    }
  }

  protected addRequirement(): void {
    void this.router.navigate(['/projects', this.name(), 'requirement']);
  }

  protected edit(): void {
    void this.router.navigate(['/projects', this.name(), 'edit']);
  }
}
