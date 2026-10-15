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
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { ProjectsApiService } from '../data-access/projects-api.service';

/** The saved project, ready for its material requirements. */
@Component({
  selector: 'app-project-saved',
  imports: [
    BackLinkComponent,
    FeedbackCardComponent,
    LanguageSwitcherComponent,
    PageHeadingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': 'desktop()' },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="router.navigate(['/projects'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    <app-feedback-card [title]="txt.card" [message]="txt.message" />
    <button
      type="button"
      class="md-btn md-btn--primary"
      (click)="router.navigate(['/projects', name()])"
    >
      {{ txt.open }}
    </button>
    <button type="button" class="md-btn" (click)="router.navigate(['/projects'])">
      {{ txt.all }}
    </button>
  `,
})
export class ProjectSavedContainer {
  readonly name = input.required<string>();

  private readonly api = inject(ProjectsApiService);
  private readonly business = inject(BusinessService);
  protected readonly router = inject(Router);
  private readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();
  private readonly projectTitle = signal('');
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('project.back'),
      title: t('project.saved.title'),
      subtitle: t('project.saved.subtitle', {
        name: this.name(),
        business: this.business.active()?.name ?? '',
      }),
      card: t('project.saved.card'),
      message: t('project.saved.message', { title: this.projectTitle() || this.name() }),
      open: t('project.saved.open'),
      all: t('project.saved.all'),
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
  }
}
