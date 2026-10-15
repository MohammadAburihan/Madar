import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { PostedEarlierError, UnresolvedError } from '../../../core/erpnext/confirmation';
import { ExpenseApiService } from './expense-api.service';
import { ExpenseRequest } from './expense.models';

const DEFAULTS = {
  cost_center: 'Main - RN',
  write_off_account: 'Write Off - RN',
  exchange_gain_loss_account: 'Exchange Gain/Loss - RN',
  disposal_account: null,
  round_off_account: 'Round Off - RN',
  depreciation_expense_account: null,
};

const request = (overrides: Partial<ExpenseRequest> = {}): ExpenseRequest => ({
  reference: 'EXP-ABC1234',
  company: 'Rehan Nursery',
  category: 'Travel Expenses - RN',
  amount: 36.5,
  date: '2026-10-11',
  account: { mode: 'Cash', account: 'Cash - RN', label: 'Main cash', isBank: false },
  project: null,
  ...overrides,
});

const POSTED = {
  name: 'ACC-JV-0091',
  docstatus: 1,
  posting_date: '2026-10-11',
  accounts: [
    {
      account: 'Travel Expenses - RN',
      debit_in_account_currency: 36.5,
      credit_in_account_currency: 0,
      project: null,
    },
    { account: 'Cash - RN', debit_in_account_currency: 0, credit_in_account_currency: 36.5 },
  ],
};

const api = () => TestBed.inject(ExpenseApiService);

describe('ExpenseApiService', () => {
  it("offers the company's operating expense accounts, without the ones ERPNext books itself", async () => {
    const { listCalls } = fakeErpnext(
      {
        Account: () => [
          { name: 'Office Rent - RN', account_name: 'Office Rent' },
          { name: 'Write Off - RN', account_name: 'Write Off' },
          { name: 'Exchange Gain/Loss - RN', account_name: 'Exchange Gain/Loss' },
        ],
      },
      { 'frappe.client.get_value': () => DEFAULTS },
    );
    expect(await api().categories('Rehan Nursery')).toEqual([
      { account: 'Office Rent - RN', name: 'Office Rent' },
    ]);
    expect(listCalls[0].query.filters).toContainEqual(['account_type', 'in', ['', 'Chargeable']]);
  });

  it('records the expense from the expense account to the payment account, with the reference', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.client.get_value': () => DEFAULTS,
        'frappe.client.insert': (body) => ({ ...(body['doc'] as object), name: 'ACC-JV-0091' }),
        'frappe.client.submit': () => POSTED,
      },
    );
    const inserted: string[] = [];
    const name = await api().record(request({ project: 'PROJ-0001' }), null, (n) =>
      inserted.push(n),
    );
    expect([name, inserted]).toEqual(['ACC-JV-0091', ['ACC-JV-0091']]);
    expect(postCalls[1].body['doc']).toEqual({
      doctype: 'Journal Entry',
      voucher_type: 'Cash Entry',
      company: 'Rehan Nursery',
      posting_date: '2026-10-11',
      cheque_no: 'EXP-ABC1234',
      cheque_date: '2026-10-11',
      user_remark: 'Madar expense EXP-ABC1234',
      accounts: [
        {
          account: 'Travel Expenses - RN',
          debit_in_account_currency: 36.5,
          cost_center: 'Main - RN',
          project: 'PROJ-0001',
        },
        { account: 'Cash - RN', credit_in_account_currency: 36.5, cost_center: 'Main - RN' },
      ],
    });
  });

  it('records a bank payment as a bank entry', async () => {
    const { postCalls } = fakeErpnext(
      {},
      {
        'frappe.client.get_value': () => DEFAULTS,
        'frappe.client.insert': () => ({ name: 'ACC-JV-0092' }),
        'frappe.client.submit': () => ({ name: 'ACC-JV-0092' }),
      },
    );
    await api().record(
      request({
        account: { mode: 'Bank Draft', account: 'Bank - RN', label: 'Main bank', isBank: true },
      }),
      null,
    );
    expect((postCalls[1].body['doc'] as Record<string, unknown>)['voucher_type']).toBe(
      'Bank Entry',
    );
  });

  it('submits a remembered draft with the new values, keeping its identity', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.get_value': () => DEFAULTS, 'frappe.client.submit': () => POSTED },
      { 'Journal Entry/ACC-JV-0091': { ...POSTED, docstatus: 0, modified: 'm1' } },
    );
    expect(await api().record(request({ amount: 40 }), 'ACC-JV-0091')).toBe('ACC-JV-0091');
    expect(postCalls.map((c) => c.method)).toEqual([
      'frappe.client.get_value',
      'frappe.client.submit',
    ]);
    expect(postCalls[1].body['doc']).toMatchObject({ name: 'ACC-JV-0091', modified: 'm1' });
  });

  it('reports a remembered draft a slow attempt already posted, and refuses a changed one', async () => {
    fakeErpnext(
      {},
      { 'frappe.client.get_value': () => DEFAULTS },
      { 'Journal Entry/ACC-JV-0091': POSTED },
    );
    expect(await api().record(request(), 'ACC-JV-0091')).toBe('ACC-JV-0091');
    await expect(api().record(request({ amount: 40 }), 'ACC-JV-0091')).rejects.toBeInstanceOf(
      PostedEarlierError,
    );
  });

  it('turns a timeout while submitting into an unresolved result', async () => {
    fakeErpnext(
      {},
      {
        'frappe.client.get_value': () => DEFAULTS,
        'frappe.client.insert': () => ({ name: 'ACC-JV-0091' }),
        'frappe.client.submit': () => throwError(() => new HttpErrorResponse({ status: 504 })),
      },
    );
    await expect(api().record(request(), null)).rejects.toBeInstanceOf(UnresolvedError);
  });

  it('finds an expense or its draft by the Madar reference', async () => {
    let rows: unknown[] = [];
    const { listCalls } = fakeErpnext({ 'Journal Entry': () => rows });
    expect(await api().find('EXP-ABC1234')).toBe('not-found');
    expect(listCalls[0].query.filters).toContainEqual(['cheque_no', '=', 'EXP-ABC1234']);
    rows = [{ name: 'ACC-JV-0091', docstatus: 0 }];
    expect(await api().find('EXP-ABC1234')).toEqual({ draft: 'ACC-JV-0091' });
    rows = [{ name: 'ACC-JV-0091', docstatus: 1 }];
    expect(await api().find('EXP-ABC1234')).toEqual({ expense: 'ACC-JV-0091' });
  });
});
