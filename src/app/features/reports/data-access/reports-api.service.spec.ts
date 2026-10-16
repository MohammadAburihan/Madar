import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { ReportsApiService } from './reports-api.service';

const api = () => TestBed.inject(ReportsApiService);

describe('ReportsApiService', () => {
  it("adds the period's posted figures up by account type", async () => {
    const { listCalls } = fakeErpnext({
      Account: () => [
        { name: 'Sales - RN', account_name: 'Sales', root_type: 'Income', account_type: null },
        {
          name: 'Cost of Goods Sold - RN',
          account_name: 'Cost of Goods Sold',
          root_type: 'Expense',
          account_type: 'Cost of Goods Sold',
        },
        { name: 'Rent - RN', account_name: 'Rent', root_type: 'Expense', account_type: null },
        { name: 'Cash - RN', account_name: 'Main cash', root_type: 'Asset', account_type: 'Cash' },
        { name: 'Bank - RN', account_name: 'Main bank', root_type: 'Asset', account_type: 'Bank' },
        {
          name: 'Debtors - RN',
          account_name: 'Debtors',
          root_type: 'Asset',
          account_type: 'Receivable',
        },
      ],
      'GL Entry': () => [
        { account: 'Sales - RN', 'SUM(`debit`)': 50, 'SUM(`credit`)': 18500 },
        { account: 'Cost of Goods Sold - RN', 'SUM(`debit`)': 9870, 'SUM(`credit`)': 0 },
        { account: 'Rent - RN', 'SUM(`debit`)': 2310, 'SUM(`credit`)': 0 },
        { account: 'Cash - RN', 'SUM(`debit`)': 8450, 'SUM(`credit`)': 2310 },
        { account: 'Bank - RN', 'SUM(`debit`)': 7470, 'SUM(`credit`)': 9330 },
        { account: 'Debtors - RN', 'SUM(`debit`)': 18450, 'SUM(`credit`)': 15920 },
      ],
    });
    const figures = await api().figures('Rehan Nursery', { from: '2026-10-01', to: '2026-10-14' });
    expect(figures).toEqual({
      from: '2026-10-01',
      to: '2026-10-14',
      income: 18450,
      costOfGoods: 9870,
      expenses: 2310,
      profit: 6270,
      moneyIn: 15920,
      moneyOut: 11640,
      accounts: [
        { account: 'Bank - RN', name: 'Main bank', moneyIn: 7470, moneyOut: 9330 },
        { account: 'Cash - RN', name: 'Main cash', moneyIn: 8450, moneyOut: 2310 },
      ],
    });
    const gl = listCalls.find((c) => c.doctype === 'GL Entry')!.query;
    expect(gl.filters).toContainEqual(['posting_date', 'between', ['2026-10-01', '2026-10-14']]);
    expect(gl.filters).toContainEqual(['is_cancelled', '=', 0]);
    expect(gl.filters).toContainEqual(['voucher_type', '!=', 'Period Closing Voucher']);
    expect(gl.groupBy).toBe('account');
  });

  it('reads the chart of accounts once per company', async () => {
    const { listCalls } = fakeErpnext({ Account: () => [], 'GL Entry': () => [] });
    await api().figures('Rehan Nursery', { from: '2026-10-01', to: '2026-10-31' });
    await api().figures('Rehan Nursery', { from: '2026-09-01', to: '2026-09-30' });
    expect(listCalls.filter((c) => c.doctype === 'Account')).toHaveLength(1);
  });

  it('reads the chart again when the ledger names an account it lacks', async () => {
    let accounts = [
      { name: 'Sales - RN', account_name: 'Sales', root_type: 'Income', account_type: null },
    ];
    const { listCalls } = fakeErpnext({
      Account: () => accounts,
      'GL Entry': () => [{ account: 'Services - RN', 'SUM(`debit`)': 0, 'SUM(`credit`)': 500 }],
    });
    await api().figures('Rehan Nursery', { from: '2026-10-01', to: '2026-10-31' });
    accounts = [
      ...accounts,
      { name: 'Services - RN', account_name: 'Services', root_type: 'Income', account_type: null },
    ];
    const figures = await api().figures('Rehan Nursery', { from: '2026-10-01', to: '2026-10-31' });
    expect(figures.income).toBe(500);
    expect(listCalls.filter((c) => c.doctype === 'Account').length).toBeGreaterThan(1);
  });

  it('leaves transfers between own accounts out of money in and out', async () => {
    fakeErpnext({
      Account: () => [
        { name: 'Cash - RN', account_name: 'Main cash', root_type: 'Asset', account_type: 'Cash' },
        { name: 'Bank - RN', account_name: 'Main bank', root_type: 'Asset', account_type: 'Bank' },
      ],
      'GL Entry': () => [
        { account: 'Cash - RN', 'SUM(`debit`)': 10500, 'SUM(`credit`)': 0 },
        { account: 'Bank - RN', 'SUM(`debit`)': 0, 'SUM(`credit`)': 10000 },
      ],
      'Payment Entry': () => [
        {
          paid_from: 'Bank - RN',
          paid_to: 'Cash - RN',
          base_paid_amount: 10000,
          base_received_amount: 10000,
        },
      ],
    });
    const figures = await api().figures('Rehan Nursery', { from: '2026-10-01', to: '2026-10-31' });
    expect([figures.moneyIn, figures.moneyOut]).toEqual([500, 0]);
  });

  it("fails rather than count transfers twice when payments can't be read for a reason other than permission", async () => {
    fakeErpnext({
      Account: () => [],
      'GL Entry': () => [],
      'Payment Entry': () => throwError(() => new HttpErrorResponse({ status: 500 })),
    });
    await expect(
      api().figures('Rehan Nursery', { from: '2026-10-01', to: '2026-10-31' }),
    ).rejects.toBeTruthy();
  });

  it('shares one chart reread between parallel months', async () => {
    let accounts: object[] = [];
    const { listCalls } = fakeErpnext({
      Account: () => accounts,
      'GL Entry': () => [{ account: 'Sales - RN', 'SUM(`debit`)': 0, 'SUM(`credit`)': 5 }],
    });
    await api().figures('Rehan Nursery', { from: '2026-09-01', to: '2026-09-30' });
    accounts = [
      { name: 'Sales - RN', account_name: 'Sales', root_type: 'Income', account_type: null },
    ];
    const before = listCalls.filter((c) => c.doctype === 'Account').length;
    await Promise.all(
      [1, 2, 3].map(() => api().figures('Rehan Nursery', { from: '2026-10-01', to: '2026-10-31' })),
    );
    expect(listCalls.filter((c) => c.doctype === 'Account').length - before).toBe(1);
  });
});
