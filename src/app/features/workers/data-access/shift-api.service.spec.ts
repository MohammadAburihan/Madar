import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { ListQuery } from '../../../core/erpnext/erpnext-client';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { ShiftApiService, dayBefore } from './shift-api.service';

const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };
const api = () => TestBed.inject(ShiftApiService);
const VALUE = { worker: 'E1', shift: 'Morning', from: '2026-10-19', until: '' };
const TYPES = [
  { name: 'Morning', start_time: '7:00:00', end_time: '15:00:00' },
  { name: 'Evening', start_time: '13:00:00', end_time: '21:00:00' },
  { name: 'Night', start_time: '22:00:00', end_time: '6:00:00' },
];

const has = (q: ListQuery, field: string, op: string) =>
  (q.filters ?? []).some((f) => f[0] === field && f[1] === op);

describe('ShiftApiService', () => {
  it('reads shift times as HH:MM, the shift on a day and the next one', async () => {
    const { listCalls } = fakeErpnext({
      'Shift Type': () => TYPES,
      'Shift Assignment': (q) =>
        has(q, 'start_date', '>')
          ? [{ shift_type: 'Evening', start_date: '2026-10-26' }]
          : [{ shift_type: 'Morning' }],
    });
    expect((await api().shiftTypes())[0]).toEqual({
      name: 'Morning',
      start: '07:00',
      end: '15:00',
    });
    expect(await api().current('E1', '2026-10-17')).toEqual({
      name: 'Morning',
      start: '07:00',
      end: '15:00',
    });
    expect(await api().next('E1', '2026-10-17')).toEqual({
      shift: { name: 'Evening', start: '13:00', end: '21:00' },
      from: '2026-10-26',
    });
    const assignment = listCalls.find((c) => c.doctype === 'Shift Assignment')!.query;
    expect(assignment.orFilters).toEqual([
      ['end_date', 'is', 'not set'],
      ['end_date', '>=', '2026-10-17'],
    ]);
  });

  it('lists the shifts still running on the new start', async () => {
    const { listCalls } = fakeErpnext({
      'Shift Assignment': () => [{ name: 'SA-M', shift_type: 'Morning', end_date: null }],
    });
    expect(await api().running('E1', '2026-10-19')).toEqual([
      { name: 'SA-M', shift: 'Morning', until: null },
    ]);
    expect(listCalls[0].query.filters).toContainEqual(['start_date', '<', '2026-10-19']);
    expect(listCalls[0].query.orFilters).toEqual([
      ['end_date', 'is', 'not set'],
      ['end_date', '>=', '2026-10-19'],
    ]);
  });

  it('ends a running shift on a date, the day before the new one', async () => {
    const { postCalls } = fakeErpnext({}, { 'frappe.client.set_value': () => ({}) });
    await api().end('SA-M', dayBefore('2026-03-01'));
    expect(postCalls[0].body).toEqual({
      doctype: 'Shift Assignment',
      name: 'SA-M',
      fieldname: 'end_date',
      value: '2026-02-28',
    });
  });

  it('submits the new shift in one write, open-ended unless an end is given', async () => {
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
    expect(postCalls).toHaveLength(2);
  });

  it('finds a lost shift among active assignments by worker, shift and start', async () => {
    const { listCalls } = fakeErpnext(
      { 'Shift Assignment': () => [{ name: 'SA-1' }] },
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
    );
    await expect(api().assign(VALUE, BUSINESS)).rejects.toBeInstanceOf(UnresolvedError);
    expect(await api().find(VALUE)).toBe('SA-1');
    expect(listCalls[0].query.filters).toEqual([
      ['employee', '=', 'E1'],
      ['shift_type', '=', 'Morning'],
      ['start_date', '=', '2026-10-19'],
      ['docstatus', '=', 1],
      ['status', '=', 'Active'],
    ]);
  });
});
