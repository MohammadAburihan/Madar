import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { ListQuery } from '../../../core/erpnext/erpnext-client';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { ShiftApiService, ShiftIncompleteError, ShiftPlan } from './shift-api.service';

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

/** Shift Assignment lists by query: later ones, running ones, and the lookup by worker, shift and start. */
function assignments(
  running: { name: string; shift_type: string; end_date: string | null }[],
  later: { name: string }[] = [],
  found: (q: ListQuery) => { name: string }[] = () => [],
) {
  return (q: ListQuery) =>
    has(q, 'start_date', '>=') ? later : has(q, 'start_date', '<') ? running : found(q);
}

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

  it('refuses a shift a later one overlaps before anything is written', async () => {
    const { postCalls } = fakeErpnext({
      'Shift Assignment': assignments([], [{ name: 'SA-9' }]),
    });
    await expect(api().plan(VALUE)).rejects.toMatchObject({ excType: 'OverlappingShiftError' });
    expect(postCalls).toEqual([]);
  });

  it('ends every running shift, one shift per worker, and resumes it after a temporary one', async () => {
    fakeErpnext({
      'Shift Assignment': assignments([{ name: 'SA-N', shift_type: 'Night', end_date: null }]),
    });
    const plan = await api().plan({ ...VALUE, shift: 'Early', until: '2026-10-21' });
    expect(plan.running.map((r) => r.name)).toEqual(['SA-N']);
    expect(plan.resume).toEqual([{ shift_type: 'Night', from: '2026-10-22', until: null }]);
    expect((await api().plan(VALUE)).resume).toEqual([]);
  });

  it('keeps the running shift ended when a retry fails for another reason than ERPNext refusing it', async () => {
    const { postCalls } = fakeErpnext(
      { 'Shift Assignment': assignments([]) },
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 0 })) },
    );
    const plan: ShiftPlan = {
      value: VALUE,
      running: [{ name: 'SA-M', shift_type: 'Morning', end_date: null }],
      resume: [],
    };
    await expect(api().apply(plan, BUSINESS)).rejects.toBeTruthy();
    expect(postCalls.filter((c) => c.method === 'frappe.client.set_value')).toHaveLength(1);
  });

  it('ends the running shift the day before, then submits the new one and the resumed one', async () => {
    const { postCalls } = fakeErpnext(
      { 'Shift Assignment': assignments([]) },
      { 'frappe.client.insert': () => ({ name: 'SA-1' }) },
    );
    const plan: ShiftPlan = {
      value: { ...VALUE, shift: 'Evening', until: '2026-10-21' },
      running: [{ name: 'SA-M', shift_type: 'Morning', end_date: null }],
      resume: [{ shift_type: 'Morning', from: '2026-10-22', until: null }],
    };
    await api().apply(plan, BUSINESS);
    expect(postCalls.map((c) => c.method)).toEqual([
      'frappe.client.set_value',
      'frappe.client.insert',
      'frappe.client.insert',
    ]);
    expect(postCalls[0].body).toEqual({
      doctype: 'Shift Assignment',
      name: 'SA-M',
      fieldname: 'end_date',
      value: '2026-10-18',
    });
    expect(postCalls[1].body['doc']).toEqual({
      doctype: 'Shift Assignment',
      employee: 'E1',
      shift_type: 'Evening',
      start_date: '2026-10-19',
      end_date: '2026-10-21',
      company: 'Rehan Nursery',
      status: 'Active',
      docstatus: 1,
    });
    expect(postCalls[2].body['doc']).toMatchObject({
      shift_type: 'Morning',
      start_date: '2026-10-22',
    });
    expect(postCalls[2].body['doc']).not.toHaveProperty('end_date');
  });

  it('puts the running shift back when the new one is refused', async () => {
    const { postCalls } = fakeErpnext(
      { 'Shift Assignment': assignments([]) },
      {
        'frappe.client.insert': () =>
          throwError(
            () => new HttpErrorResponse({ status: 417, error: { exc_type: 'ValidationError' } }),
          ),
      },
    );
    const plan: ShiftPlan = {
      value: VALUE,
      running: [{ name: 'SA-M', shift_type: 'Morning', end_date: '2026-12-31' }],
      resume: [],
    };
    await expect(api().apply(plan, BUSINESS)).rejects.toBeTruthy();
    expect(postCalls.at(-1)!.body).toEqual({
      doctype: 'Shift Assignment',
      name: 'SA-M',
      fieldname: 'end_date',
      value: '2026-12-31',
    });
  });

  it('finishes a change again without doing any step twice', async () => {
    // The new shift was made by the lost answer; only the resume is left.
    const { postCalls } = fakeErpnext(
      {
        'Shift Assignment': assignments([], [], (q) =>
          q.filters!.some((f) => f[0] === 'shift_type' && f[2] === 'Evening')
            ? [{ name: 'SA-1' }]
            : [],
        ),
      },
      { 'frappe.client.insert': () => ({ name: 'SA-2' }) },
    );
    const plan: ShiftPlan = {
      value: { ...VALUE, shift: 'Evening', until: '2026-10-21' },
      running: [{ name: 'SA-M', shift_type: 'Morning', end_date: null }],
      resume: [{ shift_type: 'Morning', from: '2026-10-22', until: null }],
    };
    await api().apply(plan, BUSINESS);
    const inserts = postCalls.filter((c) => c.method === 'frappe.client.insert');
    expect(inserts.map((c) => (c.body['doc'] as { shift_type: string }).shift_type)).toEqual([
      'Morning',
    ]);
  });

  it('reports a lost answer as unresolved, and a failed resume as incomplete', async () => {
    fakeErpnext(
      { 'Shift Assignment': assignments([]) },
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
    );
    const plan: ShiftPlan = { value: VALUE, running: [], resume: [] };
    await expect(api().apply(plan, BUSINESS)).rejects.toBeInstanceOf(UnresolvedError);
    TestBed.resetTestingModule();
    let inserts = 0;
    fakeErpnext(
      { 'Shift Assignment': assignments([]) },
      {
        'frappe.client.insert': () =>
          ++inserts === 1
            ? { name: 'SA-1' }
            : throwError(() => new HttpErrorResponse({ status: 500 })),
      },
    );
    await expect(
      api().apply(
        { ...plan, resume: [{ shift_type: 'Morning', from: '2026-10-22', until: null }] },
        BUSINESS,
      ),
    ).rejects.toBeInstanceOf(ShiftIncompleteError);
  });
});
