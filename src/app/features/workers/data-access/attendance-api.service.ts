import { Injectable, inject } from '@angular/core';
import { Business } from '../../../core/business/business.service';
import { UnresolvedError, confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { AttendanceStatus, MarkResult, SheetRow } from './workers.models';

// Best first, as Workers reads a day with one record per shift.
const RANK = ['Present', 'Work From Home', 'Half Day', 'On Leave', 'Absent'];

/** The day's attendance sheet (Frappe HR Attendance) for the business's active workers. */
@Injectable({ providedIn: 'root' })
export class AttendanceApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Every worker employed on `date` (joined by then, not yet relieved), with what is already recorded that day. */
  async sheet(date: string, business: Business): Promise<SheetRow[]> {
    const workers = await this.erpnext.listAll<{
      name: string;
      employee_name: string;
      designation: string | null;
    }>('Employee', {
      fields: ['name', 'employee_name', 'designation'],
      // A past day still lists those who have left since; inactive and suspended workers aren't marked.
      filters: [
        ['company', '=', business.name],
        ['status', 'in', ['Active', 'Left']],
        ['date_of_joining', '<=', date],
      ],
      orFilters: [
        ['relieving_date', 'is', 'not set'],
        ['relieving_date', '>=', date],
      ],
      orderBy: 'employee_name asc, name asc',
    });
    if (!workers.length) {
      return [];
    }
    const [attendance, leave] = await Promise.all([
      this.erpnext.listAll<{ employee: string; status: string }>('Attendance', {
        fields: ['employee', 'status'],
        // By company and day, not by worker: a long id list would outgrow the GET URL.
        filters: [
          ['company', '=', business.name],
          ['attendance_date', '=', date],
          ['docstatus', '=', 1],
        ],
      }),
      this.erpnext.listAll<{ employee: string; to_date: string }>('Leave Application', {
        fields: ['employee', 'to_date'],
        filters: [
          ['company', '=', business.name],
          ['from_date', '<=', date],
          ['to_date', '>=', date],
          ['status', '=', 'Approved'],
          ['docstatus', '=', 1],
        ],
        orderBy: 'to_date desc',
      }),
    ]);
    const marked = new Map<string, string>();
    for (const a of attendance) {
      const current = marked.get(a.employee);
      if (!current || RANK.indexOf(a.status) < RANK.indexOf(current)) {
        marked.set(a.employee, a.status);
      }
    }
    const onLeave = new Map<string, string>();
    for (const l of leave) {
      if (!onLeave.has(l.employee)) {
        onLeave.set(l.employee, l.to_date);
      }
    }
    return workers.map((w) => {
      const until = onLeave.get(w.name);
      const status = marked.get(w.name);
      return {
        id: w.name,
        name: w.employee_name,
        designation: w.designation,
        // Approved leave says until when; Frappe HR marks those days "On Leave" too.
        state:
          until && (!status || status === 'On Leave')
            ? { kind: 'leave', until }
            : status
              ? { kind: 'marked', status }
              : { kind: 'open' },
      };
    });
  }

  /**
   * Submits one worker's attendance for the day. Frappe HR allows one record a day, so a repeat after a lost
   * answer comes back as already marked instead of a second record.
   */
  async mark(
    employee: string,
    date: string,
    status: AttendanceStatus,
    business: Business,
  ): Promise<MarkResult> {
    try {
      await confirmRequest(
        this.erpnext.post('frappe.client.insert', {
          doc: {
            doctype: 'Attendance',
            employee,
            attendance_date: date,
            status,
            company: business.name,
            docstatus: 1,
          },
        }),
      );
      return 'marked';
    } catch (error) {
      if (error instanceof UnresolvedError) {
        return 'unresolved';
      }
      if (ErpnextError.from(error).excType === 'DuplicateAttendanceError') {
        return 'already';
      }
      throw error;
    }
  }
}
