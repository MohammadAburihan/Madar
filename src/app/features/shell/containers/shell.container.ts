import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { injectI18n } from '../../../core/i18n/i18n';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { FeedbackCardComponent } from '../../../shared/ui/feedback-card.component';
import { BottomNavComponent } from '../components/bottom-nav.component';
import { BusinessBarComponent } from '../../../shared/ui/business-bar.component';
import { SidebarNavComponent } from '../components/sidebar-nav.component';
import { buildShellView } from './shell-view';

@Component({
  selector: 'app-shell',
  imports: [
    BottomNavComponent,
    BusinessBarComponent,
    FeedbackCardComponent,
    RouterOutlet,
    SidebarNavComponent,
  ],
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
      @if (clock.unknownZone()) {
        <div class="clock">
          <app-feedback-card
            tone="warning"
            [title]="clockText().title"
            [message]="clockText().message"
          />
          <button type="button" class="md-btn" (click)="clock.retry()">
            {{ clockText().retry }}
          </button>
        </div>
      } @else if (clock.recovered()) {
        <div class="clock">
          <app-feedback-card
            tone="warning"
            [title]="clockText().recoveredTitle"
            [message]="clockText().recoveredMessage"
          />
          <button type="button" class="md-btn" (click)="reload()">{{ clockText().reload }}</button>
        </div>
      }
      <router-outlet />
    </main>
    @if (viewport() === 'mobile') {
      <app-bottom-nav [items]="text().mobileNav" [navLabel]="text().navLabel" [url]="url()" />
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

    .clock {
      display: grid;
      gap: 12px;
      padding: 16px 20px 0;
    }

    :host(.layout-tablet) .clock,
    :host(.layout-desktop) .clock {
      padding: 24px 40px 0;
    }
  `,
})
export class ShellContainer implements OnInit {
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  private readonly i18n = injectI18n();
  private readonly router = inject(Router);
  protected readonly clock = inject(SiteClockService);
  protected readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly viewport = inject(ViewportService).viewport;
  private readonly tr = this.i18n.tr;

  protected readonly businessName = computed(() => this.business.active()?.name ?? '');
  protected readonly text = computed(() =>
    buildShellView(
      {
        persona: this.session.persona(),
        capabilities: this.session.capabilities(),
        businessName: this.businessName(),
        userName: this.session.user()?.fullName ?? '',
      },
      this.tr(),
    ),
  );

  protected readonly clockText = computed(() => {
    const { t } = this.tr();
    return {
      title: t('clock.unknown.title'),
      message: t('clock.unknown.message'),
      retry: t('clock.unknown.retry'),
      recoveredTitle: t('clock.recovered.title'),
      recoveredMessage: t('clock.recovered.message'),
      reload: t('clock.recovered.reload'),
    };
  });

  /** A full reload, so every date on the page is worked out again in the business's time zone. */
  protected reload(): void {
    window.location.reload();
  }

  ngOnInit(): void {
    // Read the site's time zone early, so a failure shows here whichever page is open.
    void this.clock.ensure();
    void this.business.ensure().catch(() => undefined);
  }

  protected openBusinesses(): void {
    void this.router.navigate(['/businesses']);
  }
}
