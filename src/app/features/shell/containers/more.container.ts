import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { PageHeadingComponent } from '../../../shared/ui/page-heading.component';
import { buildMoreView } from './shell-view';

/** More, on phones: the role's other destinations, as on the More navigation mock. */
@Component({
  selector: 'app-more',
  imports: [LanguageSwitcherComponent, LucideDynamicIcon, PageHeadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task', '[class.desktop]': "viewport() !== 'mobile'" },
  styleUrl: '../../../shared/ui/task-page.scss',
  styles: `
    nav {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .md-btn {
      gap: 8px;
    }

    svg {
      flex: none;
    }
  `,
  template: `
    @let v = view();
    <app-language-switcher [language]="i18n.language()" (languageChange)="i18n.use($event)" />
    <app-page-heading [title]="v.title" [subtitle]="v.subtitle" />
    <nav [attr.aria-label]="v.title">
      @for (item of v.items; track item.id) {
        <button type="button" class="md-btn" (click)="router.navigate([item.route])">
          <svg [lucideIcon]="item.icon" [size]="20" aria-hidden="true"></svg>
          <span>{{ item.label }}</span>
        </button>
      }
    </nav>
  `,
})
export class MoreContainer {
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  protected readonly router = inject(Router);
  protected readonly viewport = inject(ViewportService).viewport;
  protected readonly i18n = injectI18n();

  protected readonly view = computed(() =>
    buildMoreView(
      {
        persona: this.session.persona(),
        capabilities: this.session.capabilities(),
        businessName: this.business.active()?.name ?? '',
        userName: this.session.user()?.fullName ?? '',
      },
      this.i18n.tr(),
    ),
  );
}
