import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BackLinkComponent } from '../../../shared/ui/back-link.component';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { newActions } from './new-actions';

/** "+ New": every task the user's role can start, in one list. */
@Component({
  selector: 'app-new',
  imports: [BackLinkComponent, LanguageSwitcherComponent, PageHeadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  template: `
    @let txt = text();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-back-link [label]="txt.back" (back)="router.navigate(['/'])" />
    <app-page-heading [title]="txt.title" [subtitle]="txt.subtitle" />
    @for (action of actions(); track action.id) {
      <button type="button" class="md-btn" (click)="router.navigate(action.route)">
        {{ action.label }}
      </button>
    } @empty {
      <p class="muted">{{ txt.none }}</p>
    }
    <p class="muted">{{ txt.note }}</p>
  `,
})
export class NewContainer {
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly actions = computed(() =>
    newActions(this.session.capabilities(), this.i18n.tr()),
  );

  protected readonly text = computed(() => {
    const { t } = this.i18n.tr();
    return {
      back: t('contacts.back'),
      title: t('newMenu.title'),
      subtitle: t('newMenu.subtitle', {
        business: this.business.active()?.name ?? '',
        role: t(`home.role.${this.session.persona()}`),
      }),
      note: t('newMenu.note'),
      none: t('newMenu.none'),
    };
  });

  constructor() {
    void this.business.ensure().catch(() => undefined);
  }
}
