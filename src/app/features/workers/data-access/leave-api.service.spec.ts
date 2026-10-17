import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { LeaveApiService } from './leave-api.service';

const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };
const api = () => TestBed.inject(LeaveApiService);
const DOC = {
  name: 'HR-LAP-1',
  employee: 'E1',
  employee_name: 'Khaled Omar',
  leave_type: 'Privilege Leave',
  from_date: '2026-10-26',
  to_date: '2026-10-28',
  total_leave_days: 3,
  description: 'Family visit\n\nMadar leave LEV-0ABC123',
  status: 'Open',
  docstatus: 0,
  posting_date: '2026-10-17',
  company: 'Rehan Nursery',
  modified: 'v1',
};
const VALUE = {
  worker: 'E1',
  leaveType: 'Privilege Leave',
  from: '2026-10-26',
  to: '2026-10-28',
  reason: ' Family visit ',
};

describe('LeaveApiService', () => {
  it('lists waiting requests oldest first and decided ones newest first, without the reference', async () => {
    const { listCalls } = fakeErpnext({ 'Leave Application': () => [DOC] });
    const [row] = await api().requests('waiting', '', BUSINESS);
    expect(row).toEqual({
      id: 'HR-LAP-1',
      worker: 'E1',
      workerName: 'Khaled Omar',
      leaveType: 'Privilege Leave',
      from: '2026-10-26',
      to: '2026-10-28',
      days: 3,
      reason: 'Family visit',
      status: 'Open',
      decided: false,
      requested: '2026-10-17',
    });
    // Every request not yet submitted waits, a Desk draft given a status included.
    expect(listCalls[0].query.filters).toEqual([
      ['company', '=', 'Rehan Nursery'],
      ['docstatus', '=', 0],
    ]);
    expect(listCalls[0].query.orderBy).toBe('from_date asc, name asc');
    await api().requests('decided', 'Kha', BUSINESS);
    expect(listCalls[1].query.filters).toContainEqual(['status', 'in', ['Approved', 'Rejected']]);
    expect(listCalls[1].query.orderBy).toBe('modified desc');
    expect(listCalls[1].query.orFilters).toContainEqual(['employee_name', 'like', '%Kha%']);
  });

  it('offers allocated types with their days left, then unpaid ones', async () => {
    fakeErpnext(
      {},
      {
        'hrms.hr.doctype.leave_application.leave_application.get_leave_details': () => ({
          leave_allocation: { 'Privilege Leave': { remaining_leaves: 9 } },
          lwps: ['Leave Without Pay'],
        }),
      },
    );
    expect(await api().balances('E1', '2026-10-17')).toEqual([
      { type: 'Privilege Leave', left: 9 },
      { type: 'Leave Without Pay', left: null },
    ]);
  });

  it('sends an open request with the reference after the reason, and finds a lost one', async () => {
    const { postCalls, listCalls } = fakeErpnext(
      { 'Leave Application': () => [{ name: 'HR-LAP-1' }] },
      { 'frappe.client.insert': () => ({ name: 'HR-LAP-1' }) },
    );
    expect(await api().requestLeave(VALUE, 'LEV-1', '2026-10-17', BUSINESS)).toBe('HR-LAP-1');
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Leave Application',
      employee: 'E1',
      leave_type: 'Privilege Leave',
      from_date: '2026-10-26',
      to_date: '2026-10-28',
      posting_date: '2026-10-17',
      status: 'Open',
      company: 'Rehan Nursery',
      description: 'Family visit\n\nMadar leave LEV-1',
    });
    expect(await api().find('LEV-1')).toBe('HR-LAP-1');
    expect(listCalls[0].query.filters).toEqual([['description', 'like', '%Madar leave LEV-1%']]);
  });

  it('reports a lost request as unresolved', async () => {
    fakeErpnext(
      {},
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
    );
    await expect(
      api().requestLeave({ ...VALUE, reason: '' }, 'LEV-1', '2026-10-17', BUSINESS),
    ).rejects.toBeInstanceOf(UnresolvedError);
  });

  it('approves by submitting with the status, and never decides a decided request again', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.submit': (body) => ({ ...(body['doc'] as object), docstatus: 1 }) },
      { 'Leave Application/HR-LAP-1': DOC },
    );
    const decided = await api().decide('HR-LAP-1', 'Approved', BUSINESS);
    expect(postCalls[0].body['doc']).toMatchObject({
      name: 'HR-LAP-1',
      status: 'Approved',
      modified: 'v1',
    });
    expect(decided).toMatchObject({ status: 'Approved', decided: true });
    TestBed.resetTestingModule();
    const again = fakeErpnext(
      {},
      {},
      { 'Leave Application/HR-LAP-1': { ...DOC, status: 'Rejected', docstatus: 1 } },
    );
    expect(await api().decide('HR-LAP-1', 'Approved', BUSINESS)).toMatchObject({
      status: 'Rejected',
    });
    expect(again.postCalls).toEqual([]);
  });

  it("refuses another company's request", async () => {
    fakeErpnext({}, {}, { 'Leave Application/HR-LAP-1': { ...DOC, company: 'Other' } });
    await expect(api().request('HR-LAP-1', BUSINESS)).rejects.toMatchObject({
      excType: 'DoesNotExistError',
    });
  });
});
