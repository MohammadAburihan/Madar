import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { TimesheetApiService } from './timesheet-api.service';

const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };
const api = () => TestBed.inject(TimesheetApiService);
const VALUE = {
  worker: 'E1',
  date: '2026-10-17',
  hours: 6.5,
  activity: 'Execution',
  project: 'PROJ-0001',
  note: ' Front beds ',
};

describe('TimesheetApiService', () => {
  it('submits the hours from 08:00 with the reference after the note', async () => {
    const { postCalls } = fakeErpnext({}, { 'frappe.client.insert': () => ({ name: 'TS-1' }) });
    expect(await api().log(VALUE, 'TIME-1', BUSINESS)).toBe('TS-1');
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Timesheet',
      employee: 'E1',
      company: 'Rehan Nursery',
      note: 'Front beds\n\nMadar hours TIME-1',
      time_logs: [
        {
          from_time: '2026-10-17 08:00:00',
          to_time: '2026-10-17 14:30:00',
          hours: 6.5,
          activity_type: 'Execution',
          project: 'PROJ-0001',
          description: 'Front beds',
        },
      ],
      docstatus: 1,
    });
  });

  it('leaves out an empty activity and project, and finds a lost entry by reference', async () => {
    let finding = false;
    const { postCalls, listCalls } = fakeErpnext(
      { Timesheet: (q) => (q.filters?.[0]?.[0] === 'note' && finding ? [{ name: 'TS-1' }] : []) },
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
    );
    await expect(
      api().log({ ...VALUE, activity: '', project: '', note: '' }, 'TIME-1', BUSINESS),
    ).rejects.toBeInstanceOf(UnresolvedError);
    finding = true;
    expect((postCalls[0].body['doc'] as { time_logs: object[] }).time_logs[0]).toEqual({
      from_time: '2026-10-17 08:00:00',
      to_time: '2026-10-17 14:30:00',
      hours: 6.5,
    });
    expect(await api().find('TIME-1')).toBe('TS-1');
    expect(listCalls.at(-1)!.query.filters).toEqual([['note', 'like', '%Madar hours TIME-1%']]);
  });

  it('offers activities and open projects, each empty when the role can’t read it', async () => {
    fakeErpnext({
      'Activity Type': () => throwError(() => new HttpErrorResponse({ status: 403 })),
      Project: () => [{ name: 'PROJ-0001', project_name: 'Garden installation' }],
    });
    expect(await api().options(BUSINESS)).toEqual({
      activities: [],
      projects: [{ id: 'PROJ-0001', name: 'Garden installation' }],
    });
  });

  it('starts after the worker’s last log that day, as ERPNext refuses overlapping logs', async () => {
    const { postCalls, listCalls } = fakeErpnext(
      {
        Timesheet: (q) =>
          q.filters?.[0]?.[0] === 'note'
            ? []
            : [{ to_time: '2026-10-17 12:00:00' }, { to_time: '2026-10-17 10:00:00' }],
      },
      { 'frappe.client.insert': () => ({ name: 'TS-2' }) },
    );
    await api().log({ ...VALUE, hours: 3 }, 'TIME-2', BUSINESS);
    expect((postCalls[0].body['doc'] as { time_logs: object[] }).time_logs[0]).toMatchObject({
      from_time: '2026-10-17 12:00:00',
      to_time: '2026-10-17 15:00:00',
    });
    expect(listCalls[1].query.filters).toContainEqual([
      'Timesheet Detail',
      'from_time',
      '>=',
      '2026-10-17 00:00:00',
    ]);
  });

  it('returns a log a slow first try made instead of logging it twice', async () => {
    const { postCalls } = fakeErpnext({
      Timesheet: (q) => (q.filters?.[0]?.[0] === 'note' ? [{ name: 'TS-1' }] : []),
    });
    expect(await api().log(VALUE, 'TIME-1', BUSINESS)).toBe('TS-1');
    expect(postCalls).toEqual([]);
  });

  it('refuses hours that would run past midnight after the day’s earlier logs', async () => {
    const { postCalls } = fakeErpnext({
      Timesheet: (q) =>
        q.filters?.[0]?.[0] === 'note' ? [] : [{ to_time: '2026-10-17 20:00:00' }],
    });
    await expect(api().log({ ...VALUE, hours: 5 }, 'TIME-3', BUSINESS)).rejects.toMatchObject({
      left: 4,
    });
    expect(postCalls).toEqual([]);
  });

  it('refuses any hours when the day is full to midnight', async () => {
    fakeErpnext({
      Timesheet: (q) =>
        q.filters?.[0]?.[0] === 'note' ? [] : [{ to_time: '2026-10-18 00:00:00' }],
    });
    await expect(api().log({ ...VALUE, hours: 24 }, 'TIME-4', BUSINESS)).rejects.toMatchObject({
      left: 0,
    });
  });

  it('fits a long day by midnight when nothing else is logged', async () => {
    const { postCalls } = fakeErpnext(
      { Timesheet: () => [] },
      { 'frappe.client.insert': () => ({ name: 'TS-5' }) },
    );
    await api().log({ ...VALUE, hours: 20 }, 'TIME-5', BUSINESS);
    expect((postCalls[0].body['doc'] as { time_logs: object[] }).time_logs[0]).toMatchObject({
      from_time: '2026-10-17 04:00:00',
      to_time: '2026-10-18 00:00:00',
    });
  });
});
