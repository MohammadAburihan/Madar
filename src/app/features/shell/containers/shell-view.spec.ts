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
      'Workers',
      'Approvals',
      'Money',
      'Projects',
      'Reports',
      'Assistant',
      'Settings',
    ]);
    expect(view.mobileNav.map((i) => i.label)).toEqual(['Home', 'Sales', 'Stock', 'More']);
    expect(plain(view)).toMatchObject({ initials: 'RM', userMeta: 'Owner · English / العربية' });
  });

  it('shows Workers only to roles holding HR User or HR Manager, in English and Arabic', () => {
    expect(build('owner', 'ar').desktopNav.find((i) => i.id === 'workers')).toMatchObject({
      label: 'العمال',
      route: '/workers',
    });
    expect(
      build('owner', 'en', ['System Manager']).desktopNav.some((i) => i.id === 'workers'),
    ).toBe(false);
    expect(
      build('storeAssociate', 'en', ['Sales User', 'Stock User', 'HR User']).desktopNav.some(
        (i) => i.id === 'workers',
      ),
    ).toBe(true);
    expect(build('salesperson').desktopNav.some((i) => i.id === 'workers')).toBe(false);
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

  it('shows the Assistant to every role, in English and Arabic', () => {
    for (const persona of [
      'owner',
      'salesperson',
      'storeAssociate',
      'warehouse',
      'purchasing',
      'projectManager',
    ] as const) {
      expect(build(persona).desktopNav.find((i) => i.id === 'assistant')).toMatchObject({
        label: 'Assistant',
        route: '/assistant',
      });
      expect(build(persona).mobileNav.map((i) => i.id)).not.toContain('assistant');
    }
    expect(build('owner', 'ar').desktopNav.find((i) => i.id === 'assistant')?.label).toBe(
      'المساعد',
    );
  });

  it('hides Sales, Money and Projects from the purchasing officer', () => {
    expect(build('purchasing').desktopNav.map((i) => i.id)).toEqual([
      'home',
      'purchases',
      'inventory',
      'contacts',
      'assistant',
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

  it('leaves Sales and Inventory to their own tabs, not More', () => {
    const also = build('owner').mobileNav.find((i) => i.id === 'more')?.also;
    expect(also).not.toContain('/sales');
    expect(also).not.toContain('/inventory');
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
      'assistant',
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

  it("lists all of the owner's destinations except Home, tab bar ones included", () => {
    const view = plain(more('owner'));
    expect(view.subtitle).toBe('Rehan Nursery · Owner');
    expect(view.items.map((i: { label: string }) => i.label)).toEqual([
      'Sales',
      'Purchases',
      'Inventory',
      'Contacts',
      'Workers',
      'Approvals',
      'Money',
      'Projects',
      'Reports',
      'Assistant',
      'Settings',
      'Switch business',
    ]);
    expect(plain(more('owner', undefined, 'ar')).items.at(-1).label).toBe('تبديل المنشأة');
  });

  it('gives every item an icon', () => {
    expect(more('owner').items.every((i) => !!i.icon)).toBe(true);
  });

  it('follows the role: a warehouse worker has no Sales', () => {
    const ids = more('warehouse', ['Stock User']).items.map((i) => i.id);
    expect(ids).toEqual([
      'purchases',
      'inventory',
      'contacts',
      'assistant',
      'settings',
      'businesses',
    ]);
    expect(more('owner').items.map((i) => i.id)).not.toContain('home');
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
