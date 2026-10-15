import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { capabilitiesFor } from '../../../core/auth/capabilities';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { Viewport, ViewportService } from '../../../core/layout/viewport.service';
import { translocoTesting } from '../../../../testing/real-translator';
import { ShellContainer } from './shell.container';

let created = 0;

@Component({ template: 'page' })
class CountingPage {
  constructor() {
    created++;
  }
}

describe('ShellContainer', () => {
  it('keeps the routed page alive when the layout crosses a breakpoint', async () => {
    const viewport = signal<Viewport>('mobile');
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        provideRouter([{ path: '', component: CountingPage }]),
        { provide: ViewportService, useValue: { viewport } },
        {
          provide: SessionService,
          useValue: {
            user: () => null,
            persona: () => 'owner',
            capabilities: () => capabilitiesFor('owner'),
          },
        },
        {
          provide: BusinessService,
          useValue: { active: () => null, ensure: () => Promise.resolve(null) },
        },
      ],
    });
    const fixture = TestBed.createComponent(ShellContainer);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    created = 0;

    viewport.set('desktop');
    await fixture.whenStable();
    viewport.set('tablet');
    await fixture.whenStable();

    expect(created).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('router-outlet').length).toBe(1);
    expect(fixture.nativeElement.querySelector('app-sidebar-nav')).not.toBeNull();
  });
});
