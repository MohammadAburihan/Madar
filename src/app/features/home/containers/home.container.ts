import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  untracked,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { Language, LanguageService } from '../../../core/i18n/language.service';
import { createTranslator } from '../../../core/i18n/translator';
import { ViewportService } from '../../../core/layout/viewport.service';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { ActionGridComponent } from '../components/action-grid.component';
import { AttentionCardsComponent } from '../components/attention-cards.component';
import { AttentionTableComponent } from '../components/attention-table.component';
import { GlancePanelComponent } from '../components/glance-panel.component';
import { HomeHeaderComponent } from '../components/home-header.component';
import { HomeFacade } from '../data-access/home.facade';
import { buildHomeView } from './home-view';

@Component({
  selector: 'app-home-container',
  imports: [
    ActionGridComponent,
    AttentionCardsComponent,
    AttentionTableComponent,
    FeedbackCardComponent,
    GlancePanelComponent,
    HomeHeaderComponent,
    LanguageSwitcherComponent,
    NgTemplateOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.desktop]': 'desktop()', '[class.tablet]': "viewport() === 'tablet'" },
  templateUrl: './home.container.html',
  styleUrl: './home.container.scss',
})
export class HomeContainer {
  protected readonly facade = inject(HomeFacade);
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  private readonly languages = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly language = this.languages.language;
  protected readonly desktop = computed(() => this.viewport() !== 'mobile');
  private readonly tr = computed(() => createTranslator(this.transloco, this.language()));

  protected readonly view = computed(() =>
    buildHomeView(
      {
        data: this.facade.data() ?? {},
        persona: this.session.persona(),
        firstName: this.session.user()?.firstName ?? '',
        business: this.business.active() ?? { name: '', currency: '' },
        language: this.language(),
        now: this.facade.now(),
      },
      this.tr(),
    ),
  );

  protected readonly text = computed(() => {
    const { t } = this.tr();
    const business = this.business.active()?.name ?? '';
    return {
      newLabel: t('home.new'),
      actionsHeading: t('home.actionsHeading'),
      attentionHeading: t('home.attentionHeading'),
      glanceHeading: t('home.glance.heading'),
      headers: { work: t('home.table.work'), due: t('home.table.due'), next: t('home.table.next') },
      loading: { title: t('home.loading.title'), message: t('home.loading.message', { business }) },
      offline: {
        title: t('state.offline.title'),
        message: t('state.offline.message'),
        retry: t('state.offline.retry'),
      },
      error: {
        title: t('home.error.title'),
        message: t('home.error.message'),
        retry: t('home.error.retry'),
      },
    };
  });

  constructor() {
    // Ionic keeps this page cached across a sign-in round trip, so reload whenever the signed-in user changes.
    effect(() => {
      this.session.user()?.id;
      untracked(() => void this.facade.load());
    });
    effect(() => {
      if (this.facade.status() === 'expired') {
        untracked(() =>
          this.router.navigate(['/sign-in'], {
            queryParams: { expired: 1, returnUrl: this.router.url },
          }),
        );
      }
    });
  }

  protected changeLanguage(language: Language): void {
    void this.languages.use(language);
  }

  protected openNew(): void {
    void this.router.navigate(['/new']);
  }

  protected openAction(id: string): void {
    void this.router.navigate(['/task', id]);
  }

  protected openDrafts(): void {
    void this.router.navigate(['/drafts']);
  }
}
