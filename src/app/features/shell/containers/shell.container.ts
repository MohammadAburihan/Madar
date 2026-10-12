import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import {
  LucideBoxes,
  LucideHouse,
  LucideLayers,
  LucideMenu,
  LucideReceipt,
  LucideSettings,
  LucideShoppingBag,
  LucideUsers,
  LucideWallet,
} from '@lucide/angular';
import { TranslocoService } from '@jsverse/transloco';
import { Persona } from '../../../core/auth/persona';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { createTranslator } from '../../../core/i18n/translator';
import { ViewportService } from '../../../core/layout/viewport.service';
import { BottomNavComponent } from '../components/bottom-nav.component';
import { BusinessBarComponent } from '../../../shared/ui/business-bar.component';
import { NavItem } from '../components/nav-item';
import { SidebarNavComponent } from '../components/sidebar-nav.component';

type NavDefinition = Omit<NavItem, 'label'> & { hiddenFor?: Persona[] };

// The warehouse mock drops Sales from the tab bar; money stays hidden from that role too.
const DESKTOP_NAV: NavDefinition[] = [
  { id: 'home', icon: LucideHouse, route: '/' },
  { id: 'sales', icon: LucideReceipt, route: '/sales', hiddenFor: ['warehouse'] },
  { id: 'purchases', icon: LucideShoppingBag, route: '/purchases' },
  { id: 'inventory', icon: LucideBoxes, route: '/inventory' },
  { id: 'contacts', icon: LucideUsers, route: '/contacts' },
  { id: 'money', icon: LucideWallet, route: '/money', hiddenFor: ['warehouse'] },
  { id: 'projects', icon: LucideLayers, route: '/projects' },
  { id: 'settings', icon: LucideSettings, route: '/settings' },
];

const MOBILE_NAV: NavDefinition[] = [
  { id: 'home', icon: LucideHouse, route: '/' },
  { id: 'sales', icon: LucideReceipt, route: '/sales', hiddenFor: ['warehouse'] },
  { id: 'stock', icon: LucideBoxes, route: '/inventory' },
  { id: 'more', icon: LucideMenu, route: '/more' },
];

@Component({
  selector: 'app-shell',
  imports: [BottomNavComponent, BusinessBarComponent, RouterOutlet, SidebarNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ion-page', '[class]': "'layout-' + viewport()" },
  template: `
    @if (viewport() === 'mobile') {
      <main class="scroll">
        <app-business-bar
          class="bar"
          [businessName]="businessName()"
          [brand]="text().brand"
          [switchLabel]="text().switchBusiness"
          (switchBusiness)="openBusinesses()"
        />
        <router-outlet />
      </main>
      <app-bottom-nav [items]="mobileNav()" [navLabel]="text().navLabel" />
    } @else {
      <app-sidebar-nav
        [variant]="viewport() === 'desktop' ? 'full' : 'rail'"
        [items]="desktopNav()"
        [navLabel]="text().navLabel"
        [wordmark]="text().wordmark"
        [wordmarkShort]="text().wordmarkShort"
        [businessLabel]="text().activeBusiness"
        [businessName]="businessName()"
        [userName]="userName()"
        [userMeta]="text().userMeta"
        [initials]="initials()"
        (switchBusiness)="openBusinesses()"
      />
      <main class="scroll">
        <router-outlet />
      </main>
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
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService).language;
  private readonly router = inject(Router);

  protected readonly viewport = inject(ViewportService).viewport;
  private readonly tr = computed(() => createTranslator(this.transloco, this.language()));

  protected readonly businessName = computed(() => this.business.active()?.name ?? '');
  protected readonly userName = computed(() => this.session.user()?.fullName ?? '');
  protected readonly initials = computed(() =>
    this.userName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join(''),
  );

  protected readonly desktopNav = computed(() => this.labelled(DESKTOP_NAV));
  protected readonly mobileNav = computed(() => this.labelled(MOBILE_NAV));

  protected readonly text = computed(() => {
    const { t } = this.tr();
    const business = this.businessName();
    return {
      brand: t('app.name'),
      wordmark: t('app.wordmark'),
      wordmarkShort: t('app.wordmarkShort'),
      navLabel: t('nav.label'),
      activeBusiness: t('nav.activeBusiness'),
      switchBusiness: t('nav.switchBusiness', { business }),
      userMeta: t('nav.userMeta', { role: t(`home.role.${this.session.persona()}`) }),
    };
  });

  ngOnInit(): void {
    void this.business.ensure().catch(() => undefined);
  }

  protected openBusinesses(): void {
    void this.router.navigate(['/businesses']);
  }

  private labelled(items: NavDefinition[]): NavItem[] {
    const { t } = this.tr();
    const persona = this.session.persona();
    return items
      .filter((item) => !item.hiddenFor?.includes(persona))
      .map(({ hiddenFor, ...item }) => ({ ...item, label: t(`nav.${item.id}`) }));
  }
}
