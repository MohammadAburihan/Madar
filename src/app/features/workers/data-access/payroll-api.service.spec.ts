import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { PayrollApiService, monthEnd } from './payroll-api.service';

const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };
const api = () => TestBed.inject(PayrollApiService);
const VALUE = { worker: 'E1', monthly: 3000, from: '2026-09-01' };

describe('PayrollApiService', () => {
  it('knows the month’s last day', () => {
    expect(monthEnd('2026-02-01')).toBe('2026-02-28');
    expect(monthEnd('2026-10-01')).toBe('2026-10-31');
  });

  it('sets a salary on the Madar structure, making the structure the first time', async () => {
    const { postCalls } = fakeErpnext(
      { 'Salary Component': () => [{ name: 'Basic' }] },
      { 'frappe.client.insert': () => ({ name: 'X' }) },
    );
    await api().setSalary(VALUE, BUSINESS);
    expect(postCalls[0].body['doc']).toMatchObject({
      doctype: 'Salary Structure',
      name: 'Madar monthly - RN',
      payroll_frequency: 'Monthly',
      earnings: [{ salary_component: 'Basic', amount_based_on_formula: 1, formula: 'base' }],
      docstatus: 1,
    });
    expect(postCalls[1].body['doc']).toEqual({
      doctype: 'Salary Structure Assignment',
      employee: 'E1',
      salary_structure: 'Madar monthly - RN',
      from_date: '2026-09-01',
      base: 3000,
      company: 'Rehan Nursery',
      currency: 'ILS',
      docstatus: 1,
    });
  });

  it('finds a salary already set from that date instead of setting it twice', async () => {
    const { postCalls } = fakeErpnext({
      'Salary Structure Assignment': () => [{ name: 'SSA-1', base: 3000 }],
    });
    expect(await api().setSalary(VALUE, BUSINESS)).toBe('SSA-1');
    await expect(api().setSalary({ ...VALUE, monthly: 3500 }, BUSINESS)).rejects.toMatchObject({
      base: 3000,
    });
    expect(postCalls).toEqual([]);
  });

  it('reads the month: who is employed, who has a salary, and each slip', async () => {
    const { listCalls } = fakeErpnext({
      Employee: () => [
        { name: 'E1', employee_name: 'Khaled Omar', status: 'Active' },
        { name: 'E3', employee_name: 'Yousef Darwish', status: 'Active' },
        // Left with nothing for the month: not shown.
        { name: 'E4', employee_name: 'Huda Nasser', status: 'Left' },
      ],
      'Salary Structure Assignment': () => [{ employee: 'E1' }],
      'Salary Slip': () => [
        { name: 'S1', employee: 'E1', docstatus: 0, gross_pay: 4200, net_pay: 3900 },
      ],
    });
    expect(await api().month('2026-10-01', BUSINESS)).toEqual([
      {
        id: 'E1',
        name: 'Khaled Omar',
        hasSalary: true,
        slip: { name: 'S1', confirmed: false, gross: 4200, net: 3900 },
      },
      { id: 'E3', name: 'Yousef Darwish', hasSalary: false, slip: null },
    ]);
    expect(listCalls[0].query.filters).toContainEqual(['date_of_joining', '<=', '2026-10-31']);
    expect(listCalls.find((c) => c.doctype === 'Salary Slip')!.query.filters).toContainEqual([
      'start_date',
      '=',
      '2026-10-01',
    ]);
  });

  it('makes a draft slip once per worker and month', async () => {
    const { postCalls } = fakeErpnext({}, { 'frappe.client.insert': () => ({ name: 'S1' }) });
    await api().makeSlip('E1', '2026-10-01', BUSINESS);
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Salary Slip',
      employee: 'E1',
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      posting_date: '2026-10-31',
      payroll_frequency: 'Monthly',
      company: 'Rehan Nursery',
    });
    TestBed.resetTestingModule();
    const again = fakeErpnext({ 'Salary Slip': () => [{ name: 'S1' }] });
    await api().makeSlip('E1', '2026-10-01', BUSINESS);
    expect(again.postCalls).toEqual([]);
  });

  it('confirms a draft once, and reports a lost answer as unresolved', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.submit': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
      {
        'Salary Slip/S1': { name: 'S1', docstatus: 0 },
        'Salary Slip/S2': { name: 'S2', docstatus: 1 },
      },
    );
    await expect(api().confirmSlip('S1')).rejects.toBeInstanceOf(UnresolvedError);
    await api().confirmSlip('S2');
    expect(postCalls).toHaveLength(1);
  });
});
