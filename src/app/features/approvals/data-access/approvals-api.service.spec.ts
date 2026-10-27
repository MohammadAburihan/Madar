import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
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
    expect(await api().inbox(BUSINESS, false)(0, 50)).toMatchObject({
      more: false,
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
    });
    expect(listCalls[0].query.filters).toEqual([['status', '=', 'Open']]);
  });

  it('keeps reading actions past a run of documents it drops, so a short page never hides the rest', async () => {
    const actions = Array.from({ length: 120 }, (_, i) => ({
      reference_doctype: 'Expense Claim',
      reference_name: `HR-EXP-${String(i).padStart(3, '0')}`,
      workflow_state: 'Draft',
      creation: `2026-10-17 ${String(23 - Math.floor(i / 6)).padStart(2, '0')}:00:00`,
    }));
    const docs = Object.fromEntries(
      actions.map((a, i) => [
        `Expense Claim/${a.reference_name}`,
        { ...CLAIM, name: a.reference_name, company: i < 70 ? 'Other Co' : 'Rehan Nursery' },
      ]),
    );
    const { listCalls } = fakeErpnext(
      {
        'Workflow Action': (q) =>
          actions.slice(q.limitStart ?? 0, (q.limitStart ?? 0) + (q.limit ?? 20)),
      },
      {},
      docs,
    );
    const page = await api().inbox(BUSINESS, false)(0, 50);

    expect(page.items).toHaveLength(50);
    expect(page.more).toBe(false);
    const reads = listCalls.filter((c) => c.doctype === 'Workflow Action');
    expect(reads.map((c) => c.query.limitStart ?? 0)).toEqual([0, 51, 102]);
    expect(reads[0].query.orderBy).toBe('creation desc, name desc');
  });

  it('merges leave waiting into the inbox by creation time, from its own cursor', async () => {
    const leave = Array.from({ length: 3 }, (_, i) => ({
      name: `HR-LAP-${i}`,
      employee_name: 'Khaled Omar',
      leave_type: 'Privilege Leave',
      from_date: '2026-10-26',
      to_date: '2026-10-28',
      status: 'Open',
      creation: `2026-10-17 1${i}:30:00`,
    }));
    fakeErpnext(
      {
        'Leave Application': () => [...leave].reverse(),
        'Workflow Action': () => [
          {
            reference_doctype: 'Expense Claim',
            reference_name: 'HR-EXP-1',
            workflow_state: 'Draft',
            creation: '2026-10-17 11:45:00',
          },
        ],
      },
      {},
      { 'Expense Claim/HR-EXP-1': CLAIM },
    );
    const { items } = await api().inbox(BUSINESS, true)(0, 50);

    expect(items.map((i) => i.name)).toEqual(['HR-LAP-2', 'HR-EXP-1', 'HR-LAP-1', 'HR-LAP-0']);
    expect(items.filter((i) => i.leaveOnly).map((i) => i.name)).toEqual([
      'HR-LAP-2',
      'HR-LAP-1',
      'HR-LAP-0',
    ]);
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
    expect(
      (await api().item('Purchase Order', 'PO-9', BUSINESS, 'rehan@rehan.example')).amount,
    ).toBe(412.5);
  });

  it('reads the state from the field the workflow keeps it in', async () => {
    fakeErpnext(
      { Workflow: () => [{ workflow_state_field: 'approval_state' }] },
      {
        'frappe.model.workflow.get_transitions': () => [],
        'frappe.model.workflow.apply_workflow': (body) => ({
          ...(body['doc'] as object),
          approval_state: 'Approved',
        }),
      },
      {
        'Expense Claim/HR-EXP-1': { ...CLAIM, workflow_state: undefined, approval_state: 'Draft' },
      },
    );
    expect((await api().item('Expense Claim', 'HR-EXP-1', BUSINESS, 'x')).state).toBe('Draft');
    expect(await api().apply('Expense Claim', 'HR-EXP-1', 'Draft', 'Approve', BUSINESS)).toEqual({
      state: 'Approved',
      moved: false,
    });
  });

  it('falls back to the standard state field for roles that can’t read workflows', async () => {
    fakeErpnext(
      { Workflow: () => throwError(() => new HttpErrorResponse({ status: 403 })) },
      { 'frappe.model.workflow.get_transitions': () => [] },
      { 'Expense Claim/HR-EXP-1': CLAIM },
    );
    expect((await api().item('Expense Claim', 'HR-EXP-1', BUSINESS, 'x')).state).toBe('Draft');
  });

  it('leaves out steps ERPNext refuses as self-approval', async () => {
    fakeErpnext(
      {},
      {
        'frappe.model.workflow.get_transitions': () => [
          { action: 'Approve', allow_self_approval: 0 },
          { action: 'Withdraw', allow_self_approval: 1 },
        ],
      },
      { 'Expense Claim/HR-EXP-1': { ...CLAIM, owner: 'rana@rehan.example' } },
    );
    expect(
      (await api().item('Expense Claim', 'HR-EXP-1', BUSINESS, 'rana@rehan.example')).actions,
    ).toEqual(['Withdraw']);
    expect(
      (await api().item('Expense Claim', 'HR-EXP-1', BUSINESS, 'rehan@rehan.example')).actions,
    ).toEqual(['Approve', 'Withdraw']);
  });

  it('leaves out an advance amount in another currency', async () => {
    const advance = {
      doctype: 'Employee Advance',
      name: 'ADV-1',
      employee_name: 'Khaled',
      advance_amount: 100,
      base_paid_amount: 0,
      currency: 'USD',
      company: 'Rehan Nursery',
    };
    fakeErpnext(
      {},
      { 'frappe.model.workflow.get_transitions': () => [] },
      {
        'Employee Advance/ADV-1': advance,
        'Employee Advance/ADV-2': { ...advance, name: 'ADV-2', currency: 'ILS' },
      },
    );
    expect((await api().item('Employee Advance', 'ADV-1', BUSINESS, 'x')).amount).toBeNull();
    expect((await api().item('Employee Advance', 'ADV-2', BUSINESS, 'x')).amount).toBe(100);
  });

  it('shows the amount asked for and the reason without the Madar reference', async () => {
    fakeErpnext(
      {},
      { 'frappe.model.workflow.get_transitions': () => [] },
      {
        'Employee Advance/ADV-3': {
          doctype: 'Employee Advance',
          name: 'ADV-3',
          advance_amount: 300,
          base_paid_amount: 0,
          purpose: 'Tools\n\nMadar advance ADV-K3J9Q',
          company: 'Rehan Nursery',
        },
        'Expense Claim/HR-EXP-5': {
          ...CLAIM,
          name: 'HR-EXP-5',
          total_claimed_amount: 500,
          base_grand_total: 200,
        },
        'Leave Application/LAP-1': {
          doctype: 'Leave Application',
          name: 'LAP-1',
          description: 'Madar leave LEV-AB12C',
          company: 'Rehan Nursery',
        },
      },
    );
    const advance = await api().item('Employee Advance', 'ADV-3', BUSINESS, 'x');
    expect(advance).toMatchObject({ amount: 300, lines: ['Tools'] });
    expect((await api().item('Expense Claim', 'HR-EXP-5', BUSINESS, 'x')).amount).toBe(500);
    expect((await api().item('Leave Application', 'LAP-1', BUSINESS, 'x')).lines).toEqual([]);
  });

  it('shows a claim in another currency at its company-currency amount', async () => {
    fakeErpnext(
      {},
      { 'frappe.model.workflow.get_transitions': () => [] },
      {
        'Expense Claim/HR-EXP-6': {
          ...CLAIM,
          name: 'HR-EXP-6',
          currency: 'USD',
          total_claimed_amount: 100,
          base_total_claimed_amount: 370,
        },
      },
    );
    expect((await api().item('Expense Claim', 'HR-EXP-6', BUSINESS, 'x')).amount).toBe(370);
  });

  it('reads the document when a queued step answers nothing, unresolved while it is unchanged', async () => {
    let state = 'Draft';
    fakeErpnext(
      {},
      { 'frappe.model.workflow.apply_workflow': () => null },
      { 'Expense Claim/HR-EXP-1': () => of({ ...CLAIM, workflow_state: state }) },
    );
    await expect(
      api().apply('Expense Claim', 'HR-EXP-1', 'Draft', 'Approve', BUSINESS),
    ).rejects.toBeInstanceOf(UnresolvedError);
    const applying = api().apply('Expense Claim', 'HR-EXP-1', 'Draft', 'Approve', BUSINESS);
    state = 'Approved';
    expect(await applying).toEqual({ state: 'Approved', moved: false });
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
    expect(
      await api().item('Expense Claim', 'HR-EXP-1', BUSINESS, 'rehan@rehan.example'),
    ).toMatchObject({
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
    await expect(api().item('Expense Claim', 'X', BUSINESS, 'x')).rejects.toMatchObject({
      excType: 'DoesNotExistError',
    });
  });
});
