import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Business } from '../../../core/business/business.service';
import { confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import {
  LeaveBalance,
  LeaveDecision,
  LeaveFormValue,
  LeaveRequest,
  LeaveTab,
} from './workers.models';

export const LEAVE_LIMIT = 50;
const LEAVE_METHODS = 'hrms.hr.doctype.leave_application.leave_application';

interface LeaveDoc {
  name: string;
  employee: string;
  employee_name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_leave_days: number;
  description?: string | null;
  status: string;
  docstatus: number;
  posting_date: string;
  company: string;
  [key: string]: unknown;
}

const FIELDS = [
  'name',
  'employee',
  'employee_name',
  'leave_type',
  'from_date',
  'to_date',
  'total_leave_days',
  'description',
  'status',
  'docstatus',
  'posting_date',
];

/** The reason as the user wrote it: the Madar reference line is ours, not theirs. */
const reasonOf = (description: string | null | undefined) =>
  (description ?? '').replace(/\n*Madar leave LEV-[0-9A-Z]+\s*$/, '').trim();

function toRequest(d: LeaveDoc): LeaveRequest {
  return {
    id: d.name,
    worker: d.employee,
    workerName: d.employee_name,
    leaveType: d.leave_type,
    from: d.from_date,
    to: d.to_date,
    days: Number(d.total_leave_days || 0),
    reason: reasonOf(d.description),
    status: d.status,
    decided: d.docstatus === 1,
    requested: d.posting_date,
  };
}

/** Leave requests and their approval (Frappe HR Leave Application). */
@Injectable({ providedIn: 'root' })
export class LeaveApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Waiting: open requests, oldest first. Decided: approved or rejected ones, newest first. */
  async requests(tab: LeaveTab, term: string, business: Business): Promise<LeaveRequest[]> {
    const like = `%${term.trim()}%`;
    const rows = await firstValueFrom(
      this.erpnext.list<LeaveDoc>('Leave Application', {
        fields: FIELDS,
        filters: [
          ['company', '=', business.name],
          ...((tab === 'waiting'
            ? [
                ['docstatus', '=', 0],
                ['status', '=', 'Open'],
              ]
            : [
                ['docstatus', '=', 1],
                ['status', 'in', ['Approved', 'Rejected']],
              ]) as Filter[]),
        ],
        orFilters: term.trim()
          ? [
              ['employee_name', 'like', like],
              ['leave_type', 'like', like],
              ['name', 'like', like],
            ]
          : undefined,
        orderBy: tab === 'waiting' ? 'from_date asc, name asc' : 'modified desc',
        limit: LEAVE_LIMIT,
      }),
    );
    return rows.map(toRequest);
  }

  /** One request, only if it belongs to this business. */
  async request(id: string, business: Business): Promise<LeaveRequest> {
    return toRequest(await this.doc(id, business));
  }

  /** The business's active workers, for the form's worker picker. */
  async workers(business: Business): Promise<{ id: string; name: string }[]> {
    const rows = await this.erpnext.listAll<{ name: string; employee_name: string }>('Employee', {
      fields: ['name', 'employee_name'],
      filters: [
        ['company', '=', business.name],
        ['status', '=', 'Active'],
      ],
      orderBy: 'employee_name asc, name asc',
    });
    return rows.map((r) => ({ id: r.name, name: r.employee_name }));
  }

  /** The leave types the worker can take on `date`: allocated ones with their days left, then unpaid ones. */
  async balances(worker: string, date: string): Promise<LeaveBalance[]> {
    const details = await firstValueFrom(
      this.erpnext.get<{
        leave_allocation?: Record<string, { remaining_leaves: number }>;
        lwps?: string[];
      }>(`${LEAVE_METHODS}.get_leave_details`, { employee: worker, date }),
    );
    return [
      ...Object.entries(details?.leave_allocation ?? {}).map(([type, a]) => ({
        type,
        left: Number(a.remaining_leaves || 0),
      })),
      ...(details?.lwps ?? []).map((type) => ({ type, left: null })),
    ];
  }

  /** Frappe HR's count of leave days in the range (holidays left out where the type says so). */
  async days(worker: string, leaveType: string, from: string, to: string): Promise<number> {
    const days = await firstValueFrom(
      this.erpnext.get<number>(`${LEAVE_METHODS}.get_number_of_leave_days`, {
        employee: worker,
        leave_type: leaveType,
        from_date: from,
        to_date: to,
      }),
    );
    return Number(days || 0);
  }

  /**
   * Sends an open request to the leave approver. A lost answer throws UnresolvedError; `find()` tells whether
   * it was made. Resolves to its id.
   */
  async requestLeave(
    value: LeaveFormValue,
    reference: string,
    today: string,
    business: Business,
  ): Promise<string> {
    const reason = value.reason.trim();
    const doc = await confirmRequest(
      this.erpnext.post<{ name: string }>('frappe.client.insert', {
        doc: {
          doctype: 'Leave Application',
          employee: value.worker,
          leave_type: value.leaveType,
          from_date: value.from,
          to_date: value.to,
          posting_date: today,
          status: 'Open',
          company: business.name,
          // Leave Application has no remarks; the description carries the Madar reference after the reason.
          description: `${reason ? `${reason}\n\n` : ''}Madar leave ${reference}`,
        },
      }),
    );
    return doc.name;
  }

  async find(reference: string): Promise<string | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Leave Application', {
        fields: ['name'],
        filters: [['description', 'like', `%Madar leave ${reference}%`]],
        limit: 1,
      }),
    );
    return row?.name ?? null;
  }

  /**
   * Approves or rejects an open request: Frappe HR submits it with that status. A request already decided
   * (by someone else, or by a lost earlier answer) is returned as it stands, never decided again.
   */
  async decide(id: string, decision: LeaveDecision, business: Business): Promise<LeaveRequest> {
    const doc = await this.doc(id, business);
    if (doc.docstatus !== 0) {
      return toRequest(doc);
    }
    const submitted = await confirmRequest(
      this.erpnext.post<LeaveDoc>('frappe.client.submit', { doc: { ...doc, status: decision } }),
    );
    return toRequest(submitted);
  }

  private async doc(id: string, business: Business): Promise<LeaveDoc> {
    const doc = await firstValueFrom(this.erpnext.doc<LeaveDoc>('Leave Application', id));
    if (doc.company !== business.name) {
      throw new ErpnextError(
        'server',
        `Leave Application ${id} is not in ${business.name}`,
        404,
        'DoesNotExistError',
      );
    }
    return doc;
  }
}
