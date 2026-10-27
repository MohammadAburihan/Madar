import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { translocoTesting } from '../../../../testing/real-translator';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { ViewportService } from '../../../core/layout/viewport.service';
import { SiteApiService } from '../data-access/site-api.service';
import { ProjectsApiService } from '../data-access/projects-api.service';
import { ProjectDetail } from '../data-access/project.models';
import { ProjectContainer } from './project.container';

describe('ProjectContainer sales', () => {
  it('offers the retry action when the first page of sales fails, and loads again with it', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({
        items: [{ kind: 'invoice', name: 'SI-1', status: 'Paid', isReturn: false, amount: 10 }],
        more: false,
      });
    const project = {
      name: 'PROJ-0001',
      title: 'Garden installation',
      kind: 'customer',
      customer: 'CUST-LINA',
      customerName: 'Lina Haddad',
      status: 'open',
      budget: 0,
      actual: null,
      plannedDate: null,
      tasks: null,
      requirements: [],
      siteItems: [],
      attachments: [],
      linked: [],
      customerActive: true,
      sales: { billed: 0, fetch },
    } as ProjectDetail;
    const business = { name: 'Rehan Nursery', currency: 'ILS' };
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ProjectsApiService, useValue: { project: async () => project } },
        { provide: SiteApiService, useValue: {} },
        {
          provide: BusinessService,
          useValue: { ensure: async () => business, active: () => business },
        },
        { provide: ViewportService, useValue: { viewport: signal('mobile') } },
        {
          provide: SessionService,
          useValue: {
            capabilities: signal(capabilitiesFor('owner')),
            persona: signal('owner'),
            user: signal({ id: 'lina@example.com' }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectContainer);
    fixture.componentRef.setInput('name', 'PROJ-0001');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const retry = () =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Try again');

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(retry()).toBeDefined();
    });
    retry()!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(retry()).toBeUndefined();
    });
  });
});
