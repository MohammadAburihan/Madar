import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { translocoTesting } from '../../../../testing/real-translator';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ViewportService } from '../../../core/layout/viewport.service';
import { ProjectsApiService } from '../data-access/projects-api.service';
import { ProjectsContainer } from './projects.container';

const lina = {
  name: 'PROJ-0001',
  title: 'Garden installation',
  kind: 'customer' as const,
  customer: 'CUST-LINA',
  customerName: 'Lina Haddad',
  status: 'open' as const,
};

function setup(list: ReturnType<typeof vi.fn>) {
  const business = { name: 'Rehan Nursery', currency: 'ILS' };
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: ProjectsApiService, useValue: { search: list } },
      { provide: BusinessService, useValue: { ensure: async () => business } },
      { provide: ViewportService, useValue: { viewport: signal('mobile') } },
      {
        provide: SessionService,
        useValue: { capabilities: signal(capabilitiesFor('owner')), persona: signal('owner') },
      },
    ],
  });
  const fixture = TestBed.createComponent(ProjectsContainer);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = () => el.querySelector('app-search-field input') as HTMLInputElement;
  const type = (text: string) => {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const page = fixture.componentInstance as unknown as { ionViewWillEnter(): void };
  return { fixture, el, input, type, page };
}

describe('ProjectsContainer search', () => {
  it('loads everything first, then searches the typed text after a pause', async () => {
    const list = vi.fn().mockResolvedValue({ projects: [lina], capped: false });
    const { type } = setup(list);
    await vi.waitFor(() => expect(list).toHaveBeenCalledWith('Rehan Nursery', ''));
    type('Lina');
    expect(list).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(list).toHaveBeenCalledWith('Rehan Nursery', 'Lina'));
  });

  it('says nothing matches the typed text, and the plain empty text when nothing is typed', async () => {
    const list = vi.fn().mockResolvedValue({ projects: [], capped: false });
    const { fixture, el, type } = setup(list);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).toContain('No projects yet.');
    });
    type('Zed');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).toMatch(/No projects match “.?Zed.?”/);
    });
  });

  it('starts every visit with an empty search', async () => {
    const list = vi.fn().mockResolvedValue({ projects: [lina], capped: false });
    const { fixture, input, type, page } = setup(list);
    type('Lina');
    page.ionViewWillEnter();
    fixture.detectChanges();
    expect(input().value).toBe('');
  });
});

describe('ProjectsContainer many matching customers', () => {
  it('tells the user to type more only when the customer search was cut', async () => {
    const list = vi.fn().mockResolvedValue({ projects: [lina], capped: true });
    const { fixture, el } = setup(list);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).toContain('Many customers match; type more of the name');
    });
  });
});
