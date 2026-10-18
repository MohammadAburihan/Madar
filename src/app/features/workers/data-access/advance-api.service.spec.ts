import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { AdvanceApiService, AdvanceNotPaidError } from './advance-api.service';

const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };
const api = () => TestBed.inject(AdvanceApiService);
const VALUE = {
  worker: 'E1',
  amount: 300,
  mode: 'Cash',
  account: 'Cash - RN',
  purpose: ' Medical bill ',
  date: '2026-10-17',
};
const TEMPLATE = { doctype: 'Payment Entry', __islocal: 1, paid_amount: 300, references: [{}] };
const posts = (insert: (body: Record<string, unknown>) => unknown) => ({
  'frappe.client.get_value': (params: Record<string, unknown>) =>
    params['doctype'] === 'Account'
      ? { account_type: 'Receivable' }
      : { default_employee_advance_account: 'Employee Advances - RN' },
  'hrms.overrides.employee_payment_entry.get_payment_entry_for_employee': () => TEMPLATE,
  'frappe.client.insert': insert,
});

describe('AdvanceApiService', () => {
  it('records the advance with its reference, then pays it from the chosen account', async () => {
    const { postCalls, getCalls } = fakeErpnext(
      {},
      posts((body) =>
        (body['doc'] as { doctype: string }).doctype === 'Employee Advance'
          ? { name: 'ADV-1', status: 'Unpaid', docstatus: 1 }
          : { name: 'PAY-1' },
      ),
    );
    expect(await api().give(VALUE, 'ADV-REF', BUSINESS)).toBe('ADV-1');
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Employee Advance',
      employee: 'E1',
      posting_date: '2026-10-17',
      purpose: 'Medical bill\n\nMadar advance ADV-REF',
      advance_amount: 300,
      company: 'Rehan Nursery',
      currency: 'ILS',
      advance_account: 'Employee Advances - RN',
      mode_of_payment: 'Cash',
      docstatus: 1,
    });
    expect(getCalls.at(-1)!.params).toEqual({ dt: 'Employee Advance', dn: 'ADV-1' });
    expect(postCalls[1].body['doc']).toMatchObject({
      doctype: 'Payment Entry',
      mode_of_payment: 'Cash',
      paid_from: 'Cash - RN',
      reference_no: 'ADV-REF',
      reference_date: '2026-10-17',
      docstatus: 1,
    });
  });

  it('finishes an advance given before: pays it once, never records it twice', async () => {
    const { postCalls } = fakeErpnext(
      { 'Employee Advance': () => [{ name: 'ADV-1', status: 'Unpaid', docstatus: 1 }] },
      posts(() => ({ name: 'PAY-1' })),
    );
    await api().give(VALUE, 'ADV-REF', BUSINESS);
    expect(postCalls.map((c) => (c.body['doc'] as { doctype: string }).doctype)).toEqual([
      'Payment Entry',
    ]);
    TestBed.resetTestingModule();
    const paid = fakeErpnext(
      {
        'Employee Advance': () => [{ name: 'ADV-1', status: 'Unpaid', docstatus: 1 }],
        'Payment Entry': () => [{ name: 'PAY-1' }],
      },
      posts(() => ({})),
    );
    await api().give(VALUE, 'ADV-REF', BUSINESS);
    expect(paid.postCalls).toEqual([]);
  });

  it('says when the advance is recorded but its payment failed, and keeps a lost answer unresolved', async () => {
    fakeErpnext(
      { 'Employee Advance': () => [{ name: 'ADV-1', status: 'Unpaid', docstatus: 1 }] },
      posts(() => throwError(() => new HttpErrorResponse({ status: 417 }))),
    );
    await expect(api().give(VALUE, 'ADV-REF', BUSINESS)).rejects.toBeInstanceOf(
      AdvanceNotPaidError,
    );
    TestBed.resetTestingModule();
    fakeErpnext(
      {},
      posts(() => throwError(() => new HttpErrorResponse({ status: 504 }))),
    );
    await expect(api().give(VALUE, 'ADV-REF', BUSINESS)).rejects.toBeInstanceOf(UnresolvedError);
  });

  it("says when the advance account isn't receivable, before recording anything", async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        ...posts(() => ({})),
        'frappe.client.get_value': (params: Record<string, unknown>) =>
          params['doctype'] === 'Account'
            ? { account_type: null }
            : { default_employee_advance_account: 'Employee Advances - RN' },
      },
    );
    await expect(api().give(VALUE, 'ADV-REF', BUSINESS)).rejects.toMatchObject({
      excType: 'AdvanceAccountNotReceivable',
    });
    expect(postCalls).toEqual([]);
  });
});
