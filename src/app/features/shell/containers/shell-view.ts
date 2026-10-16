import {
  LucideBoxes,
  LucideChartColumn,
  LucideHouse,
  LucideLayers,
  LucideMenu,
  LucideReceipt,
  LucideSettings,
  LucideShoppingBag,
  LucideUsers,
  LucideWallet,
} from '@lucide/angular';
import { Capabilities } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { Translator } from '../../../core/i18n/translator';
import { NavItem } from '../components/nav-item';

type NavDefinition = Omit<NavItem, 'label'> & {
  hiddenFor?: Persona[];
  shownIf?: (caps: Capabilities) => boolean;
};

// The warehouse mock drops Sales from the tab bar; money stays hidden from that role too. Purchasing
// officers neither sell nor see payments; salespeople neither buy nor receive goods (docs/PERMISSIONS.md).
const DESKTOP_NAV: NavDefinition[] = [
  { id: 'home', icon: LucideHouse, route: '/' },
  {
    id: 'sales',
    icon: LucideReceipt,
    route: '/sales',
    hiddenFor: ['warehouse', 'purchasing', 'projectManager'],
  },
  {
    id: 'purchases',
    icon: LucideShoppingBag,
    route: '/purchases',
    hiddenFor: ['salesperson', 'projectManager'],
  },
  { id: 'inventory', icon: LucideBoxes, route: '/inventory' },
  { id: 'contacts', icon: LucideUsers, route: '/contacts' },
  {
    id: 'money',
    icon: LucideWallet,
    route: '/money',
    hiddenFor: ['warehouse', 'purchasing', 'projectManager'],
  },
  // Projects are for the roles that run or supply them (docs/PERMISSIONS.md).
  {
    id: 'projects',
    icon: LucideLayers,
    route: '/projects',
    shownIf: (caps) => caps.manageProjects || caps.supplyProjects,
  },
  {
    id: 'reports',
    icon: LucideChartColumn,
    route: '/reports',
    shownIf: (caps) => caps.seeReports,
  },
  { id: 'settings', icon: LucideSettings, route: '/settings' },
];

const MOBILE_NAV: NavDefinition[] = [
  { id: 'home', icon: LucideHouse, route: '/' },
  {
    id: 'sales',
    icon: LucideReceipt,
    route: '/sales',
    hiddenFor: ['warehouse', 'purchasing', 'projectManager'],
  },
  { id: 'stock', icon: LucideBoxes, route: '/inventory' },
  {
    id: 'more',
    icon: LucideMenu,
    route: '/more',
    also: [
      '/money',
      '/purchases',
      '/contacts',
      '/projects',
      '/reports',
      '/settings',
      '/businesses',
    ],
  },
];

export interface ShellViewInput {
  persona: Persona;
  capabilities: Capabilities;
  businessName: string;
  userName: string;
}

export interface ShellView {
  brand: string;
  wordmark: string;
  wordmarkShort: string;
  navLabel: string;
  activeBusiness: string;
  switchBusiness: string;
  userMeta: string;
  userName: string;
  initials: string;
  desktopNav: NavItem[];
  mobileNav: NavItem[];
}

export function buildShellView(input: ShellViewInput, { t }: Translator): ShellView {
  const labelled = (items: NavDefinition[]): NavItem[] =>
    items
      .filter(
        (item) =>
          !item.hiddenFor?.includes(input.persona) && (item.shownIf?.(input.capabilities) ?? true),
      )
      .map(({ hiddenFor, shownIf, ...item }) => ({ ...item, label: t(`nav.${item.id}`) }));
  return {
    brand: t('app.name'),
    wordmark: t('app.wordmark'),
    wordmarkShort: t('app.wordmarkShort'),
    navLabel: t('nav.label'),
    activeBusiness: t('nav.activeBusiness'),
    switchBusiness: t('nav.switchBusiness', { business: input.businessName }),
    userMeta: t('nav.userMeta', { role: t(`home.role.${input.persona}`) }),
    userName: input.userName,
    initials: input.userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join(''),
    desktopNav: labelled(DESKTOP_NAV),
    mobileNav: labelled(MOBILE_NAV),
  };
}

export interface MoreView {
  title: string;
  subtitle: string;
  items: NavItem[];
}

/** The phone's More page: every destination the role has that the tab bar doesn't hold, then Switch business. */
export function buildMoreView(input: ShellViewInput, tr: Translator): MoreView {
  const shell = buildShellView(input, tr);
  const inTabs = new Set(shell.mobileNav.map((item) => item.route));
  return {
    title: tr.t('nav.more'),
    subtitle: tr.t('more.subtitle', {
      business: input.businessName,
      role: tr.t(`home.role.${input.persona}`),
    }),
    items: [
      ...shell.desktopNav.filter((item) => !inTabs.has(item.route)),
      {
        id: 'businesses',
        icon: LucideHouse,
        route: '/businesses',
        label: tr.t('more.switchBusiness'),
      },
    ],
  };
}
