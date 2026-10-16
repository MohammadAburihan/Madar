import { capabilitiesFor } from '../../../core/auth/capabilities';
import { Persona } from '../../../core/auth/persona';
import { realTranslator } from '../../../../testing/real-translator';
import { buildPlaceholderView } from './placeholder-view';
import { buildMoreView, buildShellView } from './shell-view';

const plain = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, ''));

describe('buildShellView', () => {
  const build = (persona: Persona, language: 'en' | 'ar' = 'en', roles?: string[]) =>
    buildShellView(
      {
        persona,
        capabilities: capabilitiesFor(persona, roles),
        businessName: 'Rehan Nursery',
        userName: 'Rehan Mansour',
      },
      realTranslator(language),
    );

  it('labels navigation and the user for the owner', () => {
    const view = build('owner');
    expect(view.desktopNav.map((i) => i.label)).toEqual([
      'Home',
      'Sales',
      'Purchases',
      'Inventory',
      'Contacts',
      'Money',
      'Projects',
      'Reports',
      'Settings',
    ]);
    expect(view.mobileNav.map((i) => i.label)).toEqual(['Home', 'Sales', 'Stock', 'More']);
    expect(plain(view)).toMatchObject({ initials: 'RM', userMeta: 'Owner · English / العربية' });
  });

  it('shows Reports to the owner only, in English and Arabic', () => {
    expect(build('owner', 'ar').desktopNav.find((i) => i.id === 'reports')).toMatchObject({
      label: 'التقارير',
      route: '/reports',
    });
    for (const persona of ['salesperson', 'storeAssociate', 'warehouse', 'purchasing'] as const) {
      expect(build(persona).desktopNav.map((i) => i.id)).not.toContain('reports');
    }
    // An owner whose roles can't read the ledger would only reach an error.
    expect(build('owner', 'en', ['Sales Manager']).desktopNav.map((i) => i.id)).not.toContain(
      'reports',
    );
  });

  it('hides Sales, Money and Projects from the purchasing officer', () => {
    expect(build('purchasing').desktopNav.map((i) => i.id)).toEqual([
      'home',
      'purchases',
      'inventory',
      'contacts',
      'settings',
    ]);
    expect(build('purchasing').mobileNav.map((i) => i.id)).toEqual(['home', 'stock', 'more']);
  });

  it('hides Purchases from the salesperson only; store associates receive goods there', () => {
    expect(build('salesperson').desktopNav.map((i) => i.id)).not.toContain('purchases');
    for (const persona of ['storeAssociate', 'warehouse', 'purchasing', 'owner'] as const) {
      expect(build(persona).desktopNav.map((i) => i.id)).toContain('purchases');
    }
  });

  it('marks More as current on the Reports page', () => {
    expect(build('owner').mobileNav.find((i) => i.id === 'more')?.also).toContain('/reports');
  });

  it('hides Sales and Money from warehouse workers, as in the warehouse mock', () => {
    const view = build('warehouse', 'ar');
    expect(view.mobileNav.map((i) => i.id)).toEqual(['home', 'stock', 'more']);
    expect(view.desktopNav.map((i) => i.id)).not.toContain('money');
    expect(view.wordmark).toBe('مدار');
  });

  it('shows Projects to the roles that run projects, and to those that supply them', () => {
    for (const persona of ['owner', 'projectManager'] as const) {
      expect(build(persona).desktopNav.map((i) => i.id)).toContain('projects');
    }
    for (const persona of ['salesperson', 'purchasing'] as const) {
      expect(build(persona).desktopNav.map((i) => i.id)).not.toContain('projects');
    }
    for (const persona of ['storeAssociate', 'warehouse'] as const) {
      const stock = ['Sales User', 'Stock User'];
      expect(build(persona, 'en', stock).desktopNav.map((i) => i.id)).not.toContain('projects');
      expect(
        build(persona, 'en', [...stock, 'Projects User']).desktopNav.map((i) => i.id),
      ).toContain('projects');
    }
    expect(build('projectManager').desktopNav.map((i) => i.id)).toEqual([
      'home',
      'inventory',
      'contacts',
      'projects',
      'settings',
    ]);
  });
});

describe('buildMoreView', () => {
  const more = (persona: Persona, roles?: string[], language: 'en' | 'ar' = 'en') =>
    buildMoreView(
      {
        persona,
        capabilities: capabilitiesFor(persona, roles),
        businessName: 'Rehan Nursery',
        userName: 'Rehan Mansour',
      },
      realTranslator(language),
    );

  it("lists the owner's destinations the tab bar doesn't hold, as on the More mock", () => {
    const view = plain(more('owner'));
    expect(view.subtitle).toBe('Rehan Nursery · Owner');
    expect(view.items.map((i: { label: string }) => i.label)).toEqual([
      'Purchases',
      'Contacts',
      'Money',
      'Projects',
      'Reports',
      'Settings',
      'Switch business',
    ]);
    expect(plain(more('owner', undefined, 'ar')).items.at(-1).label).toBe('تبديل المنشأة');
  });

  it('follows the role: a warehouse worker has no Sales tab, so nothing is duplicated or missing', () => {
    const ids = more('warehouse', ['Stock User']).items.map((i) => i.id);
    expect(ids).toEqual(['purchases', 'contacts', 'settings', 'businesses']);
  });
});

describe('buildPlaceholderView', () => {
  it('names the area from a quick action or a nav key', () => {
    expect(plain(buildPlaceholderView('nav.sales', '', realTranslator('en'))).title).toBe(
      "Sales isn't available yet",
    );
    expect(plain(buildPlaceholderView('', 'receivePayment', realTranslator('en'))).area).toBe(
      'Receive payment',
    );
  });
});
