import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { AttendanceApiService } from './attendance-api.service';

const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };
const DAY = '2026-10-17';
const api = () => TestBed.inject(AttendanceApiService);

describe('AttendanceApiService', () => {
  it("lists the active workers who had joined, with the day's records and approved leave", async () => {
    const { listCalls } = fakeErpnext({
      Employee: () => [
        { name: 'E1', employee_name: 'Khaled Omar', designation: 'Gardener' },
        { name: 'E2', employee_name: 'Rana Saleh', designation: 'Cashier' },
        { name: 'E3', employee_name: 'Yousef Darwish', designation: null },
      ],
      Attendance: () => [
        { employee: 'E1', status: 'Absent' },
        { employee: 'E1', status: 'Present' },
        { employee: 'E2', status: 'On Leave' },
      ],
      'Leave Application': () => [{ employee: 'E2', to_date: '2026-10-20' }],
    });
    expect((await api().sheet(DAY, BUSINESS)).map((r) => [r.id, r.state])).toEqual([
      ['E1', { kind: 'marked', status: 'Present' }],
      ['E2', { kind: 'leave', until: '2026-10-20' }],
      ['E3', { kind: 'open' }],
    ]);
    // Employed that day: joined by then and not relieved before, so a past day lists those who left since.
    expect(listCalls[0].query.filters).toEqual([
      ['company', '=', 'Rehan Nursery'],
      ['status', 'in', ['Active', 'Left']],
      ['date_of_joining', '<=', DAY],
    ]);
    expect(listCalls[0].query.orFilters).toEqual([
      ['relieving_date', 'is', 'not set'],
      ['relieving_date', '>=', DAY],
    ]);
    // By company and day: no worker ids in the URL, however many workers there are.
    for (const doctype of ['Attendance', 'Leave Application']) {
      const filters = listCalls.find((c) => c.doctype === doctype)!.query.filters!;
      expect(filters).toContainEqual(['company', '=', 'Rehan Nursery']);
      expect(filters.some((f) => f[0] === 'employee')).toBe(false);
    }
  });

  it('reads nothing more when no one is active', async () => {
    const { listCalls } = fakeErpnext({ Employee: () => [] });
    expect(await api().sheet(DAY, BUSINESS)).toEqual([]);
    expect(listCalls).toHaveLength(1);
  });

  it('submits one record for the worker and day', async () => {
    const { postCalls } = fakeErpnext({}, { 'frappe.client.insert': () => ({ name: 'ATT-1' }) });
    expect(await api().mark('E1', DAY, 'Half Day', BUSINESS)).toBe('marked');
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Attendance',
      employee: 'E1',
      attendance_date: DAY,
      status: 'Half Day',
      company: 'Rehan Nursery',
      docstatus: 1,
    });
  });

  it('reads a repeat as already marked and a lost answer as unresolved; other errors stay errors', async () => {
    const answer = (status: number, exc_type?: string) => () =>
      throwError(() => new HttpErrorResponse({ status, error: { exc_type } }));
    fakeErpnext({}, { 'frappe.client.insert': answer(417, 'DuplicateAttendanceError') });
    expect(await api().mark('E1', DAY, 'Present', BUSINESS)).toBe('already');
    TestBed.resetTestingModule();
    fakeErpnext({}, { 'frappe.client.insert': answer(504) });
    expect(await api().mark('E1', DAY, 'Present', BUSINESS)).toBe('unresolved');
    TestBed.resetTestingModule();
    fakeErpnext({}, { 'frappe.client.insert': answer(403) });
    await expect(api().mark('E1', DAY, 'Present', BUSINESS)).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });
});
