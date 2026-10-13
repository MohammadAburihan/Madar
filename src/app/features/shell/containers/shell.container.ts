import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BottomNavComponent } from '../components/bottom-nav.component';
import { BusinessBarComponent } from '../../../shared/ui/business-bar.component';
import { SidebarNavComponent } from '../components/sidebar-nav.component';
import { buildShellView } from './shell-view';

@Component({
  selector: 'app-shell',
  imports: [BottomNavComponent, BusinessBarComponent, RouterOutlet, SidebarNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ion-page', '[class]': "'layout-' + viewport()" },
  // One outlet for every layout: crossing a breakpoint must not destroy and reload the page.
  template: `
    @if (viewport() !== 'mobile') {
      <app-sidebar-nav
        [variant]="viewport() === 'desktop' ? 'full' : 'rail'"
        [items]="text().desktopNav"
        [navLabel]="text().navLabel"
        [wordmark]="text().wordmark"
        [wordmarkShort]="text().wordmarkShort"
        [businessLabel]="text().activeBusiness"
        [businessName]="businessName()"
        [userName]="text().userName"
        [userMeta]="text().userMeta"
        [initials]="text().initials"
        (switchBusiness)="openBusinesses()"
      />
    }
    <main class="scroll">
      @if (viewport() === 'mobile') {
        <app-business-bar
          class="bar"
          [businessName]="businessName()"
          [brand]="text().brand"
          [switchLabel]="text().switchBusiness"
          (switchBusiness)="openBusinesses()"
        />
      }
      <router-outlet />
    </main>
    @if (viewport() === 'mobile') {
      <app-bottom-nav [items]="text().mobileNav" [navLabel]="text().navLabel" />
    }
  `,
  styles: `
    :host {
      display: flex;
      block-size: 100%;
      background: var(--md-bg);
    }

    .scroll {
      flex: 1;
      min-inline-size: 0;
      overflow-y: auto;
    }

    /* Ionic's .ion-page defaults to a column; the sidebar layouts need a row. */
    :host(.layout-tablet),
    :host(.layout-desktop) {
      flex-direction: row;
    }

    :host(.layout-mobile) {
      flex-direction: column;
      padding-block-start: env(safe-area-inset-top);
    }

    .bar {
      padding: 16px 20px 0;
    }
  `,
})
export class ShellContainer implements OnInit {
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  private readonly i18n = injectI18n();
  private readonly router = inject(Router);

  protected readonly viewport = inject(ViewportService).viewport;
  private readonly tr = this.i18n.tr;

  protected readonly businessName = computed(() => this.business.active()?.name ?? '');
  protected readonly text = computed(() =>
    buildShellView(
      {
        persona: this.session.persona(),
        businessName: this.businessName(),
        userName: this.session.user()?.fullName ?? '',
      },
      this.tr(),
    ),
  );

  ngOnInit(): void {
    void this.business.ensure().catch(() => undefined);
  }

  protected openBusinesses(): void {
    void this.router.navigate(['/businesses']);
  }
}
