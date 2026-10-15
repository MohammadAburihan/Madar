import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { ProjectSummary } from '../data-access/project.models';
import { ProjectsApiService } from '../data-access/projects-api.service';
import { projectCard } from './project-view';

/** Projects: the business's customer and internal projects, and a new one. */
@Component({
  selector: 'app-projects',
  imports: [FeedbackCardComponent, LanguageSwitcherComponent, PageHeadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    button.card {
      all: unset;
      display: block;
      cursor: pointer;
    }

    button.card:focus-visible {
      outline: 2px solid var(--md-primary);
      outline-offset: 2px;
      border-radius: 12px;
    }
  `,
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @if (!caps().manageProjects) {
      <app-feedback-card
        tone="warning"
        [title]="txt.noAccess.title"
        [message]="txt.noAccess.message"
      />
    } @else if (state() === 'loading') {
      <p class="muted" role="status">{{ txt.loading }}</p>
    } @else if (state() === 'error') {
      <app-feedback-card tone="danger" [title]="txt.error.title" [message]="txt.error.message" />
      <button type="button" class="md-btn" (click)="load()">{{ txt.retry }}</button>
    } @else {
      @for (card of cards(); track card.id) {
        <button type="button" class="card" (click)="open(card.id)">
          <app-feedback-card [title]="card.view.title" [message]="card.view.message" />
        </button>
      } @empty {
        <p class="muted">{{ txt.empty }}</p>
      }
      <button type="button" class="md-btn md-btn--primary" (click)="newProject()">
        {{ txt.newProject }}
      </button>
    }
  `,
})
export class ProjectsContainer implements OnInit {
  private readonly api = inject(ProjectsApiService);
  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly caps = inject(SessionService).capabilities;
  protected readonly i18n = injectI18n();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly projects = signal<ProjectSummary[]>([]);
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      title: t('project.title'),
      subtitle: t('project.subtitle'),
      newProject: t('project.newProject'),
      empty: t('project.empty'),
      loading: t('project.loading'),
      retry: t('project.retry'),
      error: { title: t('project.error.title'), message: t('project.error.message') },
      noAccess: { title: t('project.noAccess.title'), message: t('project.noAccess.message') },
    };
  });

  protected readonly cards = computed(() =>
    this.projects().map((p) => ({ id: p.name, view: projectCard(p, this.i18n.tr()) })),
  );

  ngOnInit(): void {
    if (this.caps().manageProjects) {
      void this.load();
    }
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const business = await this.business.ensure();
      if (!business) {
        this.state.set('error');
        return;
      }
      this.projects.set(await this.api.list(business.name));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected open(name: string): void {
    void this.router.navigate(['/projects', name]);
  }

  protected newProject(): void {
    void this.router.navigate(['/projects/new']);
  }
}
