import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { translocoTesting } from '../../../../testing/real-translator';
import { SessionService } from '../../../core/auth/session.service';
import { BusinessService } from '../../../core/business/business.service';
import { SiteClockService } from '../../../core/time/site-clock.service';
import { AttendanceApiService } from '../data-access/attendance-api.service';
import { MarkResult, SheetRow } from '../data-access/workers.models';
import { AttendanceContainer } from './attendance.container';

const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };
const open = (id: string): SheetRow => ({
  id,
  name: id,
  designation: null,
  state: { kind: 'open' },
});

function setup(mark: (id: string, date: string, status: string) => Promise<MarkResult>) {
  const sheets: string[] = [];
  const api = {
    sheet: async (date: string) => {
      sheets.push(date);
      return [open('E1'), open('E2')];
    },
    mark,
  };
  TestBed.configureTestingModule({
    imports: [translocoTesting()],
    providers: [
      provideRouter([]),
      { provide: AttendanceApiService, useValue: api },
      {
        provide: BusinessService,
        useValue: { active: signal(BUSINESS), ensure: async () => BUSINESS },
      },
      {
        provide: SiteClockService,
        useValue: { ensure: async () => undefined, now: () => new Date(2026, 9, 17) },
      },
      {
        provide: SessionService,
        useValue: { capabilities: signal({ manageWorkers: true }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(AttendanceContainer);
  // Protected members, driven as the template would.
  const page = fixture.componentInstance as unknown as {
    choose(id: string, status: string): void;
    choice(id: string): string;
    setDate(date: string): void;
    save(): Promise<void>;
    date(): string;
  };
  return { fixture, page, sheets };
}

describe('AttendanceContainer', () => {
  it('sends the choices made before saving, and keeps the day while it saves', async () => {
    const sent: string[] = [];
    let release!: () => void;
    const first = new Promise<void>((resolve) => (release = resolve));
    const { fixture, page } = setup(async (id, date, status) => {
      sent.push(`${id} ${date} ${status}`);
      if (id === 'E1') {
        await first;
      }
      return 'marked';
    });
    await fixture.whenStable();
    page.choose('E2', 'Absent');
    const saving = page.save();
    page.setDate('2026-10-10');
    release();
    await saving;
    expect(page.date()).toBe('2026-10-17');
    expect(sent).toEqual(['E1 2026-10-17 Present', 'E2 2026-10-17 Absent']);
  });

  it('keeps the choice of a row that failed, so saving again sends it unchanged', async () => {
    const { fixture, page, sheets } = setup(async (id) => {
      if (id === 'E2') {
        throw new HttpErrorResponse({ status: 417 });
      }
      return 'marked';
    });
    await fixture.whenStable();
    page.choose('E2', 'Absent');
    await page.save();
    expect(sheets).toEqual(['2026-10-17', '2026-10-17']);
    expect(page.choice('E2')).toBe('Absent');
    // Another day starts over.
    page.setDate('2026-10-16');
    await fixture.whenStable();
    expect(page.choice('E2')).toBe('Present');
  });
});
