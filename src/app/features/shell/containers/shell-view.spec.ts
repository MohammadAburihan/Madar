import { Persona } from '../../../core/auth/persona';
import { realTranslator } from '../../../../testing/real-translator';
import { buildPlaceholderView } from './placeholder-view';
import { buildShellView } from './shell-view';

const plain = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/[⁨⁩]/g, ''));

describe('buildShellView', () => {
  const build = (persona: Persona, language: 'en' | 'ar' = 'en') =>
    buildShellView(
      { persona, businessName: 'Rehan Nursery', userName: 'Rehan Mansour' },
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
    for (const persona of ['salesperson', 'storeAssociate', 'warehouse'] as const) {
      expect(build(persona).desktopNav.map((i) => i.id)).not.toContain('reports');
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
