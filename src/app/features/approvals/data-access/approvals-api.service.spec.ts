import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { ApprovalsApiService } from './approvals-api.service';

const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };
const api = () => TestBed.inject(ApprovalsApiService);
const CLAIM = {
  doctype: 'Expense Claim',
  name: 'HR-EXP-1',
  employee_name: 'Rana Saleh',
  total_claimed_amount: 120,
  posting_date: '2026-10-17',
  workflow_state: 'Draft',
  company: 'Rehan Nursery',
  expenses: [{ description: 'Fuel for the delivery van' }],
};

describe('ApprovalsApiService', () => {
  it('lists what waits for the user once each, leaving other companies and unreadable ones out', async () => {
    const { listCalls } = fakeErpnext(
      {
        'Workflow Action': () => [
          {
            reference_doctype: 'Expense Claim',
            reference_name: 'HR-EXP-1',
            workflow_state: 'Draft',
            creation: '2026-10-17 10:00:00',
          },
          {
            reference_doctype: 'Expense Claim',
            reference_name: 'HR-EXP-1',
            workflow_state: 'Draft',
            creation: '2026-10-17 10:00:00',
          },
          {
            reference_doctype: 'Expense Claim',
            reference_name: 'HR-EXP-2',
            workflow_state: 'Draft',
            creation: '2026-10-17 09:00:00',
          },
          {
            reference_doctype: 'Purchase Order',
            reference_name: 'PO-9',
            workflow_state: 'Draft',
            creation: '2026-10-16 09:00:00',
          },
        ],
      },
      {},
      {
        'Expense Claim/HR-EXP-1': CLAIM,
        'Expense Claim/HR-EXP-2': { ...CLAIM, name: 'HR-EXP-2', company: 'Other Co' },
        'Purchase Order/PO-9': () => throwError(() => new HttpErrorResponse({ status: 403 })),
      },
    );
    expect(await api().inbox(BUSINESS)).toEqual({
      items: [
        {
          doctype: 'Expense Claim',
          name: 'HR-EXP-1',
          title: 'Rana Saleh',
          amount: 120,
          state: 'Draft',
          date: '2026-10-17',
        },
      ],
      capped: false,
    });
    expect(listCalls[0].query.filters).toEqual([['status', '=', 'Open']]);
  });

  it('says the inbox is capped by the actions ERPNext returned, not those left after filtering', async () => {
    const actions = Array.from({ length: 50 }, (_, i) => ({
      reference_doctype: 'Expense Claim',
      reference_name: `HR-EXP-${i}`,
      workflow_state: 'Draft',
      creation: '2026-10-17 10:00:00',
    }));
    fakeErpnext({ 'Workflow Action': () => actions }, {}, {});
    expect(await api().inbox(BUSINESS)).toEqual({ items: [], capped: true });
  });

  it('takes the grand total when rounding is off (rounded total 0)', async () => {
    fakeErpnext(
      {},
      { 'frappe.model.workflow.get_transitions': () => [] },
      {
        'Purchase Order/PO-9': {
          doctype: 'Purchase Order',
          name: 'PO-9',
          supplier_name: 'Green Clay',
          base_rounded_total: 0,
          base_grand_total: 412.5,
          company: 'Rehan Nursery',
        },
      },
    );
    expect((await api().item('Purchase Order', 'PO-9', BUSINESS)).amount).toBe(412.5);
  });

  it('reads an item with the actions the user may take', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.model.workflow.get_transitions': () => [
          { action: 'Approve' },
          { action: 'Reject' },
          { action: 'Approve' },
        ],
      },
      { 'Expense Claim/HR-EXP-1': CLAIM },
    );
    expect(await api().item('Expense Claim', 'HR-EXP-1', BUSINESS)).toMatchObject({
      title: 'Rana Saleh',
      amount: 120,
      state: 'Draft',
      actions: ['Approve', 'Reject'],
      lines: ['Fuel for the delivery van'],
    });
    expect(postCalls[0].body).toEqual({ doc: CLAIM });
  });

  it('applies an action once: a document that moved on is returned as it stands', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.model.workflow.apply_workflow': (body) => ({
          ...(body['doc'] as object),
          workflow_state: 'Approved',
        }),
      },
      { 'Expense Claim/HR-EXP-1': CLAIM },
    );
    expect(await api().apply('Expense Claim', 'HR-EXP-1', 'Draft', 'Approve', BUSINESS)).toEqual({
      state: 'Approved',
      moved: false,
    });
    expect(postCalls[0].body).toMatchObject({ action: 'Approve' });
    expect(await api().apply('Expense Claim', 'HR-EXP-1', 'Pending', 'Approve', BUSINESS)).toEqual({
      state: 'Draft',
      moved: true,
    });
    expect(postCalls).toHaveLength(1);
  });

  it('reports a lost answer as unresolved, and refuses another company’s document', async () => {
    fakeErpnext(
      {},
      {
        'frappe.model.workflow.apply_workflow': () =>
          throwError(() => new HttpErrorResponse({ status: 504 })),
      },
      { 'Expense Claim/HR-EXP-1': CLAIM, 'Expense Claim/X': { ...CLAIM, company: 'Other Co' } },
    );
    await expect(
      api().apply('Expense Claim', 'HR-EXP-1', 'Draft', 'Approve', BUSINESS),
    ).rejects.toBeInstanceOf(UnresolvedError);
    await expect(api().item('Expense Claim', 'X', BUSINESS)).rejects.toMatchObject({
      excType: 'DoesNotExistError',
    });
  });

  it('lists leave waiting for a decision', async () => {
    fakeErpnext({
      'Leave Application': () => [
        {
          name: 'HR-LAP-1',
          employee_name: 'Khaled Omar',
          leave_type: 'Privilege Leave',
          from_date: '2026-10-26',
          to_date: '2026-10-28',
          status: 'Open',
        },
      ],
    });
    expect(await api().leaveWaiting(BUSINESS)).toEqual([
      {
        doctype: 'Leave Application',
        name: 'HR-LAP-1',
        title: 'Khaled Omar · Privilege Leave',
        amount: null,
        state: 'Open',
        date: '2026-10-26',
      },
    ]);
  });
});
