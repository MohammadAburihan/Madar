import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Business } from '../../../core/business/business.service';
import { confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import {
  WorkerDetail,
  WorkerFormValue,
  WorkerOptions,
  WorkerPay,
  WorkerRow,
  WorkerTab,
  WorkerToday,
} from './workers.models';

/** Lists show this many rows; the screen says so when there may be more. */
export const LIST_LIMIT = 50;
const RECENT_LIMIT = 5;

interface EmployeeRow {
  name: string;
  employee_name: string;
  designation: string | null;
  department: string | null;
  cell_number: string | null;
  status: string;
}

interface EmployeeDoc extends EmployeeRow {
  first_name: string;
  last_name?: string | null;
  company: string;
  gender: string;
  date_of_birth: string;
  date_of_joining: string;
  relieving_date?: string | null;
  [key: string]: unknown;
}

const EMPLOYEE_FIELDS = [
  'name',
  'employee_name',
  'designation',
  'department',
  'cell_number',
  'status',
];

/** A role that may not read one kind of record still sees the rest; other failures stay failures. */
const forbiddenAsNull = (error: unknown): null => {
  if (ErpnextError.from(error).kind === 'forbidden') {
    return null;
  }
  throw error;
};

/** The day six days before: with `today`, the last seven days. */
function sixDaysBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 6)).toISOString().slice(0, 10);
}

// Best first: with one record per shift, the day reads as the best of them, as the month's count does.
const ATTENDANCE = ['Present', 'Work From Home', 'Half Day', 'On Leave', 'Absent'];

const squash = (name: string) => name.trim().replace(/\s+/g, ' ');

/** One record per day, newest first: the best of a day's shift records. */
function bestPerDay(
  rows: { attendance_date: string; status: string }[],
): { date: string; status: string }[] {
  const days = new Map<string, string>();
  for (const r of rows) {
    const current = days.get(r.attendance_date);
    if (!current || ATTENDANCE.indexOf(r.status) < ATTENDANCE.indexOf(current)) {
      days.set(r.attendance_date, r.status);
    }
  }
  return [...days]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, status]) => ({ date, status }));
}

/** Days at work: a full or home day counts 1, a half day ½; a day with several shift records counts once. */
function daysPresent(rows: { attendance_date: string; status: string }[]): number {
  const best = new Map<string, number>();
  for (const r of rows) {
    const value =
      r.status === 'Present' || r.status === 'Work From Home'
        ? 1
        : r.status === 'Half Day'
          ? 0.5
          : 0;
    best.set(r.attendance_date, Math.max(best.get(r.attendance_date) ?? 0, value));
  }
  return [...best.values()].reduce((sum, v) => sum + v, 0);
}

/** "Khaled Omar" → first and last name, as ERPNext composes the full name from them. */
function nameParts(name: string): { first_name: string; last_name: string } {
  const [first, ...rest] = name.trim().split(/\s+/);
  return { first_name: first ?? '', last_name: rest.join(' ') };
}

/** Workers (ERPNext/Frappe HR Employees): the lists, each one's attendance, leave and pay, and the form. */
@Injectable({ providedIn: 'root' })
export class WorkersApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Workers on the tab matching the term, with how each is today. */
  async list(
    term: string,
    tab: WorkerTab,
    business: Business,
    today: string,
  ): Promise<WorkerRow[]> {
    const like = `%${term.trim()}%`;
    const [rows, departments] = await Promise.all([
      firstValueFrom(
        this.erpnext.list<EmployeeRow>('Employee', {
          fields: EMPLOYEE_FIELDS,
          filters: [
            ['company', '=', business.name],
            ['status', tab === 'left' ? '=' : '!=', 'Left'],
          ],
          orFilters: term.trim()
            ? [
                ['employee_name', 'like', like],
                ['designation', 'like', like],
                ['cell_number', 'like', like],
                ['name', 'like', like],
              ]
            : undefined,
          orderBy: 'employee_name asc',
          limit: LIST_LIMIT,
        }),
      ),
      this.departmentNames(business),
    ]);
    const ids = rows.map((r) => r.name);
    const todays =
      tab === 'active' && ids.length
        ? await this.todayFor(ids, today).catch(forbiddenAsNull)
        : null;
    return rows.map((r) => ({
      ...this.row(r, departments),
      today: todays ? (todays.map.get(r.name) ?? todays.fallback) : null,
    }));
  }

  /** One worker: details, this month's attendance, leave left, advances to repay and the latest pay. */
  async worker(id: string, business: Business, today: string): Promise<WorkerDetail> {
    const [doc, departments] = await Promise.all([
      this.employee(id, business),
      this.departmentNames(business),
    ]);
    const monthStart = `${today.slice(0, 8)}01`;
    const [todayMap, month, leaveLeft, advance, pay, recent, hours] = await Promise.all([
      this.todayFor([id], today).catch(forbiddenAsNull),
      this.attendance(id, [
        ['attendance_date', '>=', monthStart],
        ['attendance_date', '<=', today],
      ]).catch(forbiddenAsNull),
      this.leaveLeft(id, today).catch(forbiddenAsNull),
      this.advanceToRepay(id).catch(forbiddenAsNull),
      this.latestPay(id).catch(forbiddenAsNull),
      // Approved leave is marked ahead for every day it covers; recent means up to today.
      // Enough records for the newest days even with one record per shift; collapsed per day below.
      this.attendance(id, [['attendance_date', '<=', today]], RECENT_LIMIT * 4).catch(
        forbiddenAsNull,
      ),
      this.hoursFrom(id, sixDaysBefore(today), today).catch(forbiddenAsNull),
    ]);
    return {
      ...this.row(doc, departments),
      today:
        doc.status === 'Left'
          ? null
          : todayMap
            ? (todayMap.map.get(id) ?? todayMap.fallback)
            : null,
      joined: doc.date_of_joining,
      relieved: doc.relieving_date ?? null,
      presentThisMonth: month ? daysPresent(month) : null,
      leaveLeft,
      advanceToRepay: advance,
      pay,
      recent: bestPerDay(recent ?? []).slice(0, RECENT_LIMIT),
      hoursLastWeek: hours,
    };
  }

  /** Hours logged in submitted timesheets starting from `from` to `to`. */
  private async hoursFrom(id: string, from: string, to: string): Promise<number> {
    const rows = await this.erpnext.listAll<{ total_hours: number }>('Timesheet', {
      fields: ['total_hours'],
      filters: [
        ['employee', '=', id],
        ['docstatus', '=', 1],
        ['start_date', '>=', from],
        ['start_date', '<=', to],
      ],
    });
    return rows.reduce((sum, r) => sum + Number(r.total_hours || 0), 0);
  }

  /** Genders, job titles and the business's departments for the form. */
  async options(business: Business): Promise<WorkerOptions> {
    const [genders, designations, departments] = await Promise.all([
      firstValueFrom(
        this.erpnext.list<{ name: string }>('Gender', { fields: ['name'], limit: 100 }),
      ),
      this.erpnext.listAll<{ name: string }>('Designation', { fields: ['name'] }),
      this.erpnext.listAll<{ name: string; department_name: string }>('Department', {
        fields: ['name', 'department_name'],
        filters: [
          ['company', '=', business.name],
          ['is_group', '=', 0],
        ],
      }),
    ]);
    return {
      genders: genders.map((g) => g.name),
      designations: designations.map((d) => d.name),
      departments: departments
        .map((d) => ({ id: d.name, name: d.department_name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** The form's values for an existing worker. */
  async load(id: string, business: Business): Promise<WorkerFormValue> {
    const doc = await this.employee(id, business);
    return {
      name: doc.employee_name,
      gender: doc.gender,
      birthDate: doc.date_of_birth,
      joined: doc.date_of_joining,
      designation: doc.designation ?? '',
      department: doc.department ?? '',
      phone: doc.cell_number ?? '',
    };
  }

  /**
   * Adds the worker, or updates `existing`. A create runs through confirmRequest: a lost answer throws
   * UnresolvedError, and `find()` tells whether it was made. Resolves to the worker's id.
   */
  async save(
    value: WorkerFormValue,
    existing: string | null,
    reference: string,
    business: Business,
  ): Promise<string> {
    const fields = {
      gender: value.gender,
      date_of_birth: value.birthDate,
      date_of_joining: value.joined,
      designation: value.designation || null,
      department: value.department || null,
      cell_number: value.phone.trim() || null,
    };
    if (existing) {
      const doc = await this.employee(existing, business);
      // The form edits the full name ERPNext composes from first, middle and last: split it only when it
      // changed, and then drop the middle name, or ERPNext would add it back in.
      const renamed = squash(value.name) !== squash(doc.employee_name);
      await firstValueFrom(
        this.erpnext.post('frappe.client.save', {
          doc: {
            ...doc,
            ...fields,
            ...(renamed ? { ...nameParts(value.name), middle_name: '' } : {}),
          },
        }),
      );
      return existing;
    }
    // Saved again after "not created": a slow first try that landed meanwhile takes these details instead.
    const landed = await this.find(reference);
    if (landed) {
      return this.save(value, landed, reference, business);
    }
    const doc = await confirmRequest(
      this.erpnext.post<{ name: string }>('frappe.client.insert', {
        doc: {
          doctype: 'Employee',
          ...nameParts(value.name),
          ...fields,
          company: business.name,
          status: 'Active',
          // Employee has no remarks field; the bio holds the Madar reference a lost create is found by.
          bio: `Madar worker ${reference}`,
        },
      }),
    );
    return doc.name;
  }

  /** The worker a create with this Madar reference made, if any. */
  async find(reference: string): Promise<string | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Employee', {
        fields: ['name'],
        filters: [['bio', 'like', `%${reference}%`]],
        limit: 1,
      }),
    );
    return row?.name ?? null;
  }

  /** The worker, only if they belong to this business: a site can hold other companies' Employees too. */
  private async employee(id: string, business: Business): Promise<EmployeeDoc> {
    const doc = await firstValueFrom(this.erpnext.doc<EmployeeDoc>('Employee', id));
    if (doc.company !== business.name) {
      throw new ErpnextError(
        'server',
        `Employee ${id} is not in ${business.name}`,
        404,
        'DoesNotExistError',
      );
    }
    return doc;
  }

  private row(r: EmployeeRow, departments: Map<string, string>): Omit<WorkerRow, 'today'> {
    return {
      id: r.name,
      name: r.employee_name,
      designation: r.designation,
      department: r.department ? (departments.get(r.department) ?? r.department) : null,
      phone: r.cell_number,
      status: r.status,
    };
  }

  /** Department ids carry the company's abbreviation ("Field team - RN"); screens show the plain name. */
  private async departmentNames(business: Business): Promise<Map<string, string>> {
    const rows = await this.erpnext
      .listAll<{ name: string; department_name: string }>('Department', {
        fields: ['name', 'department_name'],
        filters: [['company', '=', business.name]],
      })
      .catch(forbiddenAsNull);
    return new Map((rows ?? []).map((d) => [d.name, d.department_name]));
  }

  /** Each worker's attendance today, or the approved leave covering today. */
  /**
   * How each worker is today: `fallback` for those with nothing recorded, which is "not marked" only when
   * attendance could be read. Null when neither attendance nor leave can be read.
   */
  private async todayFor(
    ids: string[],
    today: string,
  ): Promise<{ map: Map<string, WorkerToday>; fallback: WorkerToday | null } | null> {
    const [attendance, leave] = await Promise.all([
      // A worker can have several records a day (one per shift), so no per-worker limit holds.
      this.erpnext
        .listAll<{ employee: string; status: string }>('Attendance', {
          fields: ['employee', 'status'],
          filters: [
            ['employee', 'in', ids],
            ['attendance_date', '=', today],
            ['docstatus', '=', 1],
          ],
        })
        .catch(forbiddenAsNull),
      this.erpnext
        .listAll<{ employee: string; to_date: string }>('Leave Application', {
          fields: ['employee', 'to_date'],
          filters: [
            ['employee', 'in', ids],
            ['from_date', '<=', today],
            ['to_date', '>=', today],
            ['status', '=', 'Approved'],
            ['docstatus', '=', 1],
          ],
          orderBy: 'to_date desc',
        })
        .catch(forbiddenAsNull),
    ]);
    if (!attendance && !leave) {
      return null;
    }
    const map = new Map<string, WorkerToday>();
    for (const l of leave ?? []) {
      if (!map.has(l.employee)) {
        map.set(l.employee, { marked: true, status: 'On Leave', until: l.to_date });
      }
    }
    const best = new Map<string, number>();
    for (const a of attendance ?? []) {
      const rank = ATTENDANCE.indexOf(a.status);
      if (rank >= 0 && rank < (best.get(a.employee) ?? ATTENDANCE.length)) {
        best.set(a.employee, rank);
      }
    }
    for (const [employee, rank] of best) {
      // Approved leave says until when; an attendance row only that the worker is away.
      if (!(ATTENDANCE[rank] === 'On Leave' && map.has(employee))) {
        map.set(employee, { marked: true, status: ATTENDANCE[rank] as 'Present' });
      }
    }
    return { map, fallback: attendance ? { marked: false } : null };
  }

  /** The worker's attendance, newest first: the newest `limit` records, or all of them. */
  private attendance(
    id: string,
    filters: Filter[],
    limit?: number,
  ): Promise<{ attendance_date: string; status: string }[]> {
    const query = {
      fields: ['attendance_date', 'status'],
      filters: [['employee', '=', id], ['docstatus', '=', 1], ...filters] as Filter[],
      orderBy: 'attendance_date desc, name desc',
    };
    type Row = { attendance_date: string; status: string };
    return limit
      ? firstValueFrom(this.erpnext.list<Row>('Attendance', { ...query, limit }))
      : this.erpnext.listAll<Row>('Attendance', query);
  }

  /** Leave days left across the worker's allocations today. */
  private async leaveLeft(id: string, today: string): Promise<number> {
    const details = await firstValueFrom(
      this.erpnext.get<{ leave_allocation: Record<string, { remaining_leaves: number }> }>(
        'hrms.hr.doctype.leave_application.leave_application.get_leave_details',
        { employee: id, date: today },
      ),
    );
    return Object.values(details?.leave_allocation ?? {}).reduce(
      (sum, a) => sum + Number(a.remaining_leaves || 0),
      0,
    );
  }

  /** What the worker still owes back from advances paid to them, in the company currency. */
  private async advanceToRepay(id: string): Promise<number> {
    const rows = await this.erpnext.listAll<{
      paid_amount: number;
      claimed_amount: number;
      return_amount: number;
      base_paid_amount: number;
    }>('Employee Advance', {
      fields: ['paid_amount', 'claimed_amount', 'return_amount', 'base_paid_amount'],
      filters: [
        ['employee', '=', id],
        ['docstatus', '=', 1],
      ],
    });
    return rows.reduce((sum, r) => {
      const left = Math.max(
        0,
        Number(r.paid_amount || 0) - Number(r.claimed_amount || 0) - Number(r.return_amount || 0),
      );
      // Amounts are in the advance's currency; what was paid in the company's gives the rate.
      const paid = Number(r.paid_amount || 0);
      return sum + (paid ? left * (Number(r.base_paid_amount || paid) / paid) : 0);
    }, 0);
  }

  private async latestPay(id: string): Promise<WorkerPay | null> {
    const [slip] = await firstValueFrom(
      this.erpnext.list<{
        start_date: string;
        docstatus: number;
        gross_pay: number;
        net_pay: number;
        currency: string;
      }>('Salary Slip', {
        fields: ['start_date', 'docstatus', 'gross_pay', 'net_pay', 'currency'],
        filters: [
          ['employee', '=', id],
          ['docstatus', '!=', 2],
        ],
        orderBy: 'start_date desc',
        limit: 1,
      }),
    );
    return slip
      ? {
          start: slip.start_date,
          draft: slip.docstatus === 0,
          gross: Number(slip.gross_pay || 0),
          net: Number(slip.net_pay || 0),
          currency: slip.currency,
        }
      : null;
  }
}
