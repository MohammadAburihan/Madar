import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { translocoTesting } from '../../../../testing/real-translator';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { RuntimeConfigService } from '../../../core/config/runtime-config';
import { ExternalLinkService } from '../../../core/platform/external-link.service';
import { ViewportService } from '../../../core/layout/viewport.service';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import { SettingsApiService } from '../data-access/settings-api.service';
import { SettingsContainer } from './settings.container';

const open = vi.fn().mockResolvedValue(undefined);

function setup(persona: string, deskUrl: string) {
  const business = { name: 'Rehan Nursery', currency: 'ILS' };
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: SettingsApiService, useValue: { currencyName: async () => 'Israeli New Shekel' } },
      {
        provide: BusinessService,
        useValue: { ensure: async () => business, active: () => business },
      },
      { provide: SessionService, useValue: { persona: signal(persona) } },
      {
        provide: RuntimeConfigService,
        useValue: { erpnextUrl: () => '', deskUrl: () => deskUrl },
      },
      { provide: ExternalLinkService, useValue: { open } },
      { provide: OpenTasksService, useValue: { any: () => false } },
      { provide: ViewportService, useValue: { viewport: signal('mobile') } },
    ],
  });
  const fixture = TestBed.createComponent(SettingsContainer);
  return fixture;
}

describe('SettingsContainer Open ERPNext', () => {
  beforeEach(() => open.mockClear());

  it('opens the Desk address for the owner', async () => {
    const fixture = setup('owner', 'https://desk.example.com');
    await fixture.whenStable();

    fixture.nativeElement.querySelector('app-open-desk-row button').click();

    expect(open).toHaveBeenCalledWith('https://desk.example.com');
  });

  it('shows no row without an address or for other roles', async () => {
    for (const [persona, url] of [
      ['owner', ''],
      ['salesperson', 'https://desk.example.com'],
    ]) {
      TestBed.resetTestingModule();
      const fixture = setup(persona, url);
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('app-open-desk-row')).toBeNull();
      expect(open).not.toHaveBeenCalled();
    }
  });
});
