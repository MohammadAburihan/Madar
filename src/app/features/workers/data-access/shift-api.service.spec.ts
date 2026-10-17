import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { ShiftApiService } from './shift-api.service';

const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };
const api = () => TestBed.inject(ShiftApiService);
const VALUE = { worker: 'E1', shift: 'Morning', from: '2026-10-19', until: '' };

describe('ShiftApiService', () => {
  it('reads shift times as HH:MM, and the shift covering a day', async () => {
    const { listCalls } = fakeErpnext({
      'Shift Type': () => [{ name: 'Morning', start_time: '7:00:00', end_time: '15:00:00' }],
      'Shift Assignment': () => [{ shift_type: 'Morning' }],
    });
    expect(await api().shiftTypes()).toEqual([{ name: 'Morning', start: '07:00', end: '15:00' }]);
    expect(await api().current('E1', '2026-10-17')).toEqual({
      name: 'Morning',
      start: '07:00',
      end: '15:00',
    });
    const assignment = listCalls.find((c) => c.doctype === 'Shift Assignment')!.query;
    expect(assignment.filters).toContainEqual(['start_date', '<=', '2026-10-17']);
    expect(assignment.orFilters).toEqual([
      ['end_date', 'is', 'not set'],
      ['end_date', '>=', '2026-10-17'],
    ]);
  });

  it('has no shift for a worker without an assignment', async () => {
    fakeErpnext({ 'Shift Assignment': () => [] });
    expect(await api().current('E1', '2026-10-17')).toBeNull();
  });

  it('submits the assignment, open-ended unless an end is given', async () => {
    const { postCalls } = fakeErpnext({}, { 'frappe.client.insert': () => ({ name: 'SA-1' }) });
    await api().assign(VALUE, BUSINESS);
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Shift Assignment',
      employee: 'E1',
      shift_type: 'Morning',
      start_date: '2026-10-19',
      company: 'Rehan Nursery',
      status: 'Active',
      docstatus: 1,
    });
    await api().assign({ ...VALUE, until: '2026-12-31' }, BUSINESS);
    expect(postCalls[1].body['doc']).toMatchObject({ end_date: '2026-12-31' });
  });

  it('finds a lost assignment by worker, shift and start', async () => {
    const { listCalls } = fakeErpnext(
      { 'Shift Assignment': () => [{ name: 'SA-1' }] },
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
    );
    await expect(api().assign(VALUE, BUSINESS)).rejects.toBeInstanceOf(UnresolvedError);
    expect(await api().find(VALUE)).toBe('SA-1');
    expect(listCalls.at(-1)!.query.filters).toEqual([
      ['employee', '=', 'E1'],
      ['shift_type', '=', 'Morning'],
      ['start_date', '=', '2026-10-19'],
      ['docstatus', '=', 1],
    ]);
  });

  it('ends the shift worked until now the day before the new one starts', async () => {
    const { postCalls, listCalls } = fakeErpnext(
      { 'Shift Assignment': () => [{ name: 'SA-0' }] },
      { 'frappe.client.insert': () => ({ name: 'SA-1' }) },
    );
    await api().assign({ ...VALUE, from: '2026-03-01' }, BUSINESS);
    expect(listCalls[0].query.filters).toContainEqual(['start_date', '<', '2026-03-01']);
    expect(postCalls[0]).toEqual({
      method: 'frappe.client.set_value',
      body: {
        doctype: 'Shift Assignment',
        name: 'SA-0',
        fieldname: 'end_date',
        value: '2026-02-28',
      },
    });
    expect(postCalls[1].method).toBe('frappe.client.insert');
  });

  it("reads the worker's next shift after a day", async () => {
    fakeErpnext({
      'Shift Type': () => [{ name: 'Evening', start_time: '13:00:00', end_time: '21:00:00' }],
      'Shift Assignment': () => [{ shift_type: 'Evening', start_date: '2026-10-26' }],
    });
    expect(await api().next('E1', '2026-10-17')).toEqual({
      shift: { name: 'Evening', start: '13:00', end: '21:00' },
      from: '2026-10-26',
    });
  });
});
