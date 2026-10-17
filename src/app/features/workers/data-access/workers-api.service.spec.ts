import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { fakeErpnext } from '../../../../testing/fake-erpnext';
import { UnresolvedError } from '../../../core/erpnext/confirmation';
import { WorkersApiService } from './workers-api.service';

const BUSINESS = { name: 'Rehan Nursery', currency: 'ILS', abbr: 'RN', country: 'Palestine' };
const TODAY = '2026-10-17';
const api = () => TestBed.inject(WorkersApiService);
const forbidden = () => throwError(() => new HttpErrorResponse({ status: 403 }));

const EMPLOYEES = [
  {
    name: 'HR-EMP-00001',
    employee_name: 'Khaled Omar',
    designation: 'Gardener',
    department: 'Field team - RN',
    cell_number: '059-000-0177',
    status: 'Active',
  },
  {
    name: 'HR-EMP-00002',
    employee_name: 'Rana Saleh',
    designation: 'Cashier',
    department: 'Garden shop - RN',
    cell_number: null,
    status: 'Active',
  },
  {
    name: 'HR-EMP-00003',
    employee_name: 'Yousef Darwish',
    designation: null,
    department: null,
    cell_number: null,
    status: 'Active',
  },
];
const DEPARTMENTS = [
  { name: 'Field team - RN', department_name: 'Field team' },
  { name: 'Garden shop - RN', department_name: 'Garden shop' },
];

describe('WorkersApiService', () => {
  it("lists the business's workers with plain department names and how each is today", async () => {
    const { listCalls } = fakeErpnext({
      Employee: () => EMPLOYEES,
      Department: () => DEPARTMENTS,
      Attendance: () => [
        { employee: 'HR-EMP-00001', status: 'Present' },
        { employee: 'HR-EMP-00002', status: 'On Leave' },
      ],
      'Leave Application': () => [{ employee: 'HR-EMP-00002', to_date: '2026-10-20' }],
    });
    const rows = await api().list('', 'active', BUSINESS, TODAY);
    expect(rows.map((r) => [r.name, r.department, r.today])).toEqual([
      ['Khaled Omar', 'Field team', { marked: true, status: 'Present' }],
      ['Rana Saleh', 'Garden shop', { marked: true, status: 'On Leave', until: '2026-10-20' }],
      ['Yousef Darwish', null, { marked: false }],
    ]);
    const employee = listCalls.find((c) => c.doctype === 'Employee')!.query;
    expect(employee.filters).toEqual([
      ['company', '=', 'Rehan Nursery'],
      ['status', '!=', 'Left'],
    ]);
    expect(employee.orFilters).toBeUndefined();
    const attendance = listCalls.find((c) => c.doctype === 'Attendance')!.query;
    expect(attendance.filters).toContainEqual(['attendance_date', '=', TODAY]);
    expect(attendance.filters).toContainEqual(['docstatus', '=', 1]);
    const leave = listCalls.find((c) => c.doctype === 'Leave Application')!.query;
    expect(leave.filters).toContainEqual(['status', '=', 'Approved']);
  });

  it('searches by name, job and phone, and skips today for those who left', async () => {
    const { listCalls } = fakeErpnext({
      Employee: () => [{ ...EMPLOYEES[0], status: 'Left' }],
      Department: () => DEPARTMENTS,
    });
    const [row] = await api().list(' Kha ', 'left', BUSINESS, TODAY);
    expect(row.today).toBeNull();
    const employee = listCalls.find((c) => c.doctype === 'Employee')!.query;
    expect(employee.filters).toContainEqual(['status', '=', 'Left']);
    expect(employee.orFilters).toEqual([
      ['employee_name', 'like', '%Kha%'],
      ['designation', 'like', '%Kha%'],
      ['cell_number', 'like', '%Kha%'],
      ['name', 'like', '%Kha%'],
    ]);
    expect(listCalls.some((c) => c.doctype === 'Attendance')).toBe(false);
  });

  it('leaves today unknown when attendance is forbidden, but fails on other errors', async () => {
    fakeErpnext({ Employee: () => EMPLOYEES, Attendance: forbidden });
    const rows = await api().list('', 'active', BUSINESS, TODAY);
    expect(rows.every((r) => r.today === null)).toBe(true);
    TestBed.resetTestingModule();
    fakeErpnext({
      Employee: () => EMPLOYEES,
      Attendance: () => throwError(() => new HttpErrorResponse({ status: 500 })),
    });
    await expect(api().list('', 'active', BUSINESS, TODAY)).rejects.toBeTruthy();
  });

  it('sums the month, leave left, advances to repay and the latest pay', async () => {
    const { listCalls, getCalls } = fakeErpnext(
      {
        Department: () => DEPARTMENTS,
        Attendance: (q) =>
          q.fields.includes('employee')
            ? [{ employee: 'HR-EMP-00001', status: 'Present' }]
            : q.limit === 5
              ? [{ attendance_date: TODAY, status: 'Present' }]
              : [
                  { attendance_date: '2026-10-01', status: 'Present' },
                  { attendance_date: '2026-10-02', status: 'Half Day' },
                  { attendance_date: '2026-10-03', status: 'Absent' },
                  { attendance_date: '2026-10-04', status: 'Work From Home' },
                ],
        'Employee Advance': () => [
          { paid_amount: 500, claimed_amount: 100, return_amount: 100 },
          { paid_amount: 200, claimed_amount: 250, return_amount: 0 },
        ],
        'Salary Slip': () => [
          {
            start_date: '2026-10-01',
            docstatus: 0,
            gross_pay: 4200,
            net_pay: 3900,
            currency: 'ILS',
          },
        ],
      },
      {
        'hrms.hr.doctype.leave_application.leave_application.get_leave_details': () => ({
          leave_allocation: {
            'Privilege Leave': { remaining_leaves: 9 },
            'Sick Leave': { remaining_leaves: 2.5 },
          },
        }),
      },
      {
        'Employee/HR-EMP-00001': {
          ...EMPLOYEES[0],
          date_of_joining: '2025-03-03',
          relieving_date: null,
        },
      },
    );
    const worker = await api().worker('HR-EMP-00001', BUSINESS, TODAY);
    expect(worker).toMatchObject({
      name: 'Khaled Omar',
      department: 'Field team',
      joined: '2025-03-03',
      today: { marked: true, status: 'Present' },
      presentThisMonth: 2.5,
      leaveLeft: 11.5,
      advanceToRepay: 300,
      pay: { start: '2026-10-01', draft: true, gross: 4200, net: 3900, currency: 'ILS' },
      recent: [{ date: TODAY, status: 'Present' }],
    });
    expect(getCalls[0].params).toEqual({ employee: 'HR-EMP-00001', date: TODAY });
    const month = listCalls.find(
      (c) =>
        c.doctype === 'Attendance' && c.query.limit !== 5 && !c.query.fields.includes('employee'),
    )!;
    expect(month.query.filters).toContainEqual(['attendance_date', '>=', '2026-10-01']);
    const slips = listCalls.find((c) => c.doctype === 'Salary Slip')!;
    expect(slips.query.filters).toContainEqual(['docstatus', '!=', 2]);
  });

  it('hides what the role may not read instead of failing the page', async () => {
    fakeErpnext(
      {
        Attendance: forbidden,
        'Leave Application': forbidden,
        'Employee Advance': forbidden,
        'Salary Slip': forbidden,
      },
      {
        'hrms.hr.doctype.leave_application.leave_application.get_leave_details': forbidden,
      },
      { 'Employee/HR-EMP-00001': { ...EMPLOYEES[0], date_of_joining: '2025-03-03' } },
    );
    expect(await api().worker('HR-EMP-00001', BUSINESS, TODAY)).toMatchObject({
      today: null,
      presentThisMonth: null,
      leaveLeft: null,
      advanceToRepay: null,
      pay: null,
      recent: [],
    });
  });

  it('adds a worker with the Madar reference, splitting the name as ERPNext composes it', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.insert': () => ({ name: 'HR-EMP-00005' }) },
    );
    const value = {
      name: ' Khaled  Abu Omar ',
      gender: 'Male',
      birthDate: '1990-05-14',
      joined: '2026-10-17',
      designation: '',
      department: 'Field team - RN',
      phone: ' 059-1 ',
    };
    expect(await api().save(value, null, 'EMP-1', BUSINESS)).toBe('HR-EMP-00005');
    expect(postCalls[0].body['doc']).toEqual({
      doctype: 'Employee',
      first_name: 'Khaled',
      last_name: 'Abu Omar',
      gender: 'Male',
      date_of_birth: '1990-05-14',
      date_of_joining: '2026-10-17',
      designation: null,
      department: 'Field team - RN',
      cell_number: '059-1',
      company: 'Rehan Nursery',
      status: 'Active',
      bio: 'Madar worker EMP-1',
    });
  });

  it('reports a lost create as unresolved, and finds it by reference', async () => {
    const { listCalls } = fakeErpnext(
      { Employee: () => [{ name: 'HR-EMP-00005' }] },
      { 'frappe.client.insert': () => throwError(() => new HttpErrorResponse({ status: 504 })) },
    );
    const value = {
      name: 'Khaled',
      gender: 'Male',
      birthDate: '1990-05-14',
      joined: '2026-10-17',
      designation: '',
      department: '',
      phone: '',
    };
    await expect(api().save(value, null, 'EMP-1', BUSINESS)).rejects.toBeInstanceOf(
      UnresolvedError,
    );
    expect(await api().find('EMP-1')).toBe('HR-EMP-00005');
    expect(listCalls[0].query.filters).toEqual([['bio', 'like', '%EMP-1%']]);
  });

  it('edits a worker over the latest document, keeping what the form does not show', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.save': (body) => body['doc'] },
      {
        'Employee/HR-EMP-00001': {
          ...EMPLOYEES[0],
          first_name: 'Khaled',
          last_name: 'Omar',
          gender: 'Male',
          date_of_birth: '1990-05-14',
          date_of_joining: '2025-03-03',
          modified: 'v1',
          ctc: 50400,
        },
      },
    );
    const value = await api().load('HR-EMP-00001');
    expect(value).toEqual({
      name: 'Khaled Omar',
      gender: 'Male',
      birthDate: '1990-05-14',
      joined: '2025-03-03',
      designation: 'Gardener',
      department: 'Field team - RN',
      phone: '059-000-0177',
    });
    await api().save({ ...value, designation: 'Driver' }, 'HR-EMP-00001', 'EMP-1', BUSINESS);
    expect(postCalls[0].body['doc']).toMatchObject({
      name: 'HR-EMP-00001',
      designation: 'Driver',
      modified: 'v1',
      ctc: 50400,
    });
  });

  it('offers genders, job titles and the business departments without groups', async () => {
    const { listCalls } = fakeErpnext({
      Gender: () => [{ name: 'Male' }, { name: 'Female' }],
      Designation: () => [{ name: 'Gardener' }],
      Department: () => [...DEPARTMENTS].reverse(),
    });
    expect(await api().options(BUSINESS)).toEqual({
      genders: ['Male', 'Female'],
      designations: ['Gardener'],
      departments: [
        { id: 'Field team - RN', name: 'Field team' },
        { id: 'Garden shop - RN', name: 'Garden shop' },
      ],
    });
    expect(listCalls.find((c) => c.doctype === 'Department')!.query.filters).toEqual([
      ['company', '=', 'Rehan Nursery'],
      ['is_group', '=', 0],
    ]);
  });
});

describe('WorkersApiService review fixes', () => {
  const STORED = {
    ...EMPLOYEES[0],
    first_name: 'Khaled',
    middle_name: 'Ali',
    last_name: 'Omar',
    employee_name: 'Khaled Ali Omar',
    gender: 'Male',
    date_of_birth: '1990-05-14',
    date_of_joining: '2025-03-03',
  };
  const VALUE = {
    name: 'Khaled Ali Omar',
    gender: 'Male',
    birthDate: '1990-05-14',
    joined: '2025-03-03',
    designation: 'Gardener',
    department: 'Field team - RN',
    phone: '059-1',
  };

  it('leaves the stored name parts alone when the name is unchanged', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.save': (body) => body['doc'] },
      { 'Employee/HR-EMP-00001': STORED },
    );
    await api().save({ ...VALUE, name: ' Khaled  Ali Omar ' }, 'HR-EMP-00001', 'EMP-1', BUSINESS);
    expect(postCalls[0].body['doc']).toMatchObject({
      first_name: 'Khaled',
      middle_name: 'Ali',
      last_name: 'Omar',
      cell_number: '059-1',
    });
  });

  it('drops the middle name when renaming, so ERPNext composes the new name', async () => {
    const { postCalls } = fakeErpnext(
      {},
      { 'frappe.client.save': (body) => body['doc'] },
      { 'Employee/HR-EMP-00001': STORED },
    );
    await api().save({ ...VALUE, name: 'Khaled Omar' }, 'HR-EMP-00001', 'EMP-1', BUSINESS);
    expect(postCalls[0].body['doc']).toMatchObject({
      first_name: 'Khaled',
      middle_name: '',
      last_name: 'Omar',
    });
  });

  it('reads every attendance record of the day, even several shifts for one worker', async () => {
    const { listCalls } = fakeErpnext({
      Employee: () => EMPLOYEES.slice(0, 2),
      Attendance: () => [
        { employee: 'HR-EMP-00001', status: 'Present' },
        { employee: 'HR-EMP-00001', status: 'Present' },
        { employee: 'HR-EMP-00002', status: 'Absent' },
      ],
    });
    const rows = await api().list('', 'active', BUSINESS, TODAY);
    expect(rows.map((r) => r.today)).toEqual([
      { marked: true, status: 'Present' },
      { marked: true, status: 'Absent' },
    ]);
    expect(listCalls.find((c) => c.doctype === 'Attendance')!.query.limit).toBeUndefined();
  });

  it('counts a day once whatever its shifts, and converts advances to the company currency', async () => {
    fakeErpnext(
      {
        Attendance: (q) =>
          q.fields.includes('employee')
            ? []
            : [
                { attendance_date: '2026-10-01', status: 'Present' },
                { attendance_date: '2026-10-01', status: 'Half Day' },
                { attendance_date: '2026-10-02', status: 'Half Day' },
              ],
        'Employee Advance': () => [
          {
            paid_amount: 100,
            claimed_amount: 0,
            return_amount: 0,
            base_paid_amount: 370,
          },
          {
            paid_amount: 50,
            claimed_amount: 0,
            return_amount: 0,
            base_paid_amount: 50,
          },
        ],
      },
      {},
      { 'Employee/HR-EMP-00001': { ...EMPLOYEES[0], date_of_joining: '2025-03-03' } },
    );
    const worker = await api().worker('HR-EMP-00001', BUSINESS, TODAY);
    expect(worker.presentThisMonth).toBe(1.5);
    expect(worker.advanceToRepay).toBeCloseTo(420);
  });
});
