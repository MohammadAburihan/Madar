import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LucideHouse, LucideReceipt } from '@lucide/angular';
import { BottomNavComponent } from './bottom-nav.component';
import { SidebarNavComponent } from './sidebar-nav.component';

const ITEMS = [
  { id: 'home', label: 'Home', icon: LucideHouse, route: '/' },
  { id: 'sales', label: 'Sales', icon: LucideReceipt, route: '/sales' },
];

const SIDEBAR_INPUTS = {
  items: ITEMS,
  navLabel: 'Main navigation',
  wordmark: 'Madar / مدار',
  wordmarkShort: 'M',
  businessLabel: 'Active business',
  businessName: 'Rehan Nursery',
  userName: 'Rehan Mansour',
  userMeta: 'Owner · English / العربية',
  initials: 'RM',
};

async function renderSidebar(variant: 'full' | 'rail') {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(SidebarNavComponent);
  for (const [name, value] of Object.entries({ ...SIDEBAR_INPUTS, variant })) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

describe('Shell presenters', () => {
  it('BottomNav renders a labelled link per item', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BottomNavComponent);
    fixture.componentRef.setInput('items', ITEMS);
    fixture.componentRef.setInput('navLabel', 'Main navigation');
    await fixture.whenStable();
    const links: HTMLAnchorElement[] = [...fixture.nativeElement.querySelectorAll('a')];

    expect(fixture.nativeElement.querySelector('nav').getAttribute('aria-label')).toBe(
      'Main navigation',
    );
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Home', 'Sales']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/sales']);
  });

  it('SidebarNav (full) shows the business, labels, and user, and emits switchBusiness', async () => {
    const fixture = await renderSidebar('full');
    const el: HTMLElement = fixture.nativeElement;
    let switched = 0;
    fixture.componentInstance.switchBusiness.subscribe(() => switched++);

    el.querySelector<HTMLButtonElement>('.control')!.click();

    expect(el.querySelector('.wordmark')?.textContent).toBe('Madar / مدار');
    expect([...el.querySelectorAll('a')].map((a) => a.textContent?.trim())).toEqual([
      'Home',
      'Sales',
    ]);
    expect(el.querySelector('.user')?.textContent).toContain('Rehan Mansour');
    expect(switched).toBe(1);
  });

  it('SidebarNav (rail) keeps icons with accessible names and hides text', async () => {
    const fixture = await renderSidebar('rail');
    const el: HTMLElement = fixture.nativeElement;

    expect(el.classList).toContain('rail');
    expect(el.querySelector('.wordmark')?.textContent).toBe('M');
    expect(el.querySelector('.control')).toBeNull();
    expect(
      [...el.querySelectorAll('a')].map((a) => [
        a.textContent?.trim(),
        a.getAttribute('aria-label'),
      ]),
    ).toEqual([
      ['', 'Home'],
      ['', 'Sales'],
    ]);
    expect(el.querySelector('.user [aria-label]')?.textContent).toBe('RM');
  });
});
