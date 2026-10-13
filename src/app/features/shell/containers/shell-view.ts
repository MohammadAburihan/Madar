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
import { Persona } from '../../../core/auth/persona';
import { Translator } from '../../../core/i18n/translator';
import { NavItem } from '../components/nav-item';

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
  {
    id: 'more',
    icon: LucideMenu,
    route: '/more',
    also: ['/money', '/purchases', '/contacts', '/projects', '/settings'],
  },
];

export interface ShellViewInput {
  persona: Persona;
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
      .filter((item) => !item.hiddenFor?.includes(input.persona))
      .map(({ hiddenFor, ...item }) => ({ ...item, label: t(`nav.${item.id}`) }));
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
