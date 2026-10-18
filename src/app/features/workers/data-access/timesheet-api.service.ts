import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Business } from '../../../core/business/business.service';
import { confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { HoursFormValue } from './workers.models';

/** A role that may not read one kind of record still sees the rest; other failures stay failures. */
const forbiddenAsEmpty = (error: unknown): never[] => {
  if (ErpnextError.from(error).kind === 'forbidden') {
    return [];
  }
  throw error;
};

/**
 * The hours as Frappe's "YYYY-MM-DD HH:mm:ss" times: from 08:00, or from where the worker's last log that day ended,
 * since ERPNext refuses one worker's logs that overlap.
 */
function span(date: string, hours: number, after: string | null): { from: string; to: string } {
  const eight = new Date(`${date}T08:00:00Z`);
  const last = after ? new Date(`${after.replace(' ', 'T').slice(0, 19)}Z`) : null;
  const start = last && last > eight ? last : eight;
  const end = new Date(start.getTime() + hours * 3_600_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
  return { from: fmt(start), to: fmt(end) };
}

/** The hours would run past midnight after the worker's earlier logs that day; `left` is what still fits. */
export class HoursDontFitError extends Error {
  constructor(readonly left: number) {
    super(`Only ${left} hours left in the day`);
  }
}

/** Hours worked (ERPNext Timesheet), optionally on an activity and a project. */
@Injectable({ providedIn: 'root' })
export class TimesheetApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Activities and the business's open projects to log hours against; each empty when the role can't read it. */
  async options(
    business: Business,
  ): Promise<{ activities: string[]; projects: { id: string; name: string }[] }> {
    const [activities, projects] = await Promise.all([
      this.erpnext
        .listAll<{ name: string }>('Activity Type', {
          fields: ['name'],
          filters: [['disabled', '=', 0]],
        })
        .catch(forbiddenAsEmpty),
      this.erpnext
        .listAll<{ name: string; project_name: string }>('Project', {
          fields: ['name', 'project_name'],
          filters: [
            ['company', '=', business.name],
            ['status', '=', 'Open'],
          ],
        })
        .catch(forbiddenAsEmpty),
    ]);
    return {
      activities: activities.map((a) => a.name),
      projects: projects.map((p) => ({ id: p.name, name: p.project_name })),
    };
  }

  /**
   * Submits the hours as a Timesheet with the Madar reference in its note. A lost answer throws UnresolvedError;
   * `find()` tells whether it was made.
   */
  async log(value: HoursFormValue, reference: string, business: Business): Promise<string> {
    // Saved again after "not created": a slow first try that landed meanwhile is the result, not a second log.
    const existing = await this.find(reference);
    if (existing) {
      return existing;
    }
    const { from, to } = span(
      value.date,
      value.hours,
      await this.lastEnd(value.worker, value.date),
    );
    if (to.slice(0, 10) !== value.date && to.slice(11) !== '00:00:00') {
      throw new HoursDontFitError(
        Math.max(0, 24 - (Number(from.slice(11, 13)) + Number(from.slice(14, 16)) / 60)),
      );
    }
    const note = value.note.trim();
    const doc = await confirmRequest(
      this.erpnext.post<{ name: string }>('frappe.client.insert', {
        doc: {
          doctype: 'Timesheet',
          employee: value.worker,
          company: business.name,
          // Timesheet has no remarks; the note carries the Madar reference after the user's text.
          note: `${note ? `${note}\n\n` : ''}Madar hours ${reference}`,
          time_logs: [
            {
              from_time: from,
              to_time: to,
              hours: value.hours,
              ...(value.activity ? { activity_type: value.activity } : {}),
              ...(value.project ? { project: value.project } : {}),
              ...(note ? { description: note } : {}),
            },
          ],
          docstatus: 1,
        },
      }),
    );
    return doc.name;
  }

  /** Where the worker's latest log on that day ends, if any (drafts too: they would overlap as well). */
  private async lastEnd(worker: string, date: string): Promise<string | null> {
    const rows = await this.erpnext.listAll<{ to_time: string | null }>('Timesheet', {
      fields: ['time_logs.to_time as to_time'],
      filters: [
        ['employee', '=', worker],
        ['docstatus', '<', 2],
        ['Timesheet Detail', 'from_time', '>=', `${date} 00:00:00`],
        ['Timesheet Detail', 'from_time', '<=', `${date} 23:59:59`],
      ],
    });
    return rows.reduce<string | null>(
      (latest, r) => (r.to_time && (!latest || r.to_time > latest) ? r.to_time : latest),
      null,
    );
  }

  async find(reference: string): Promise<string | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Timesheet', {
        fields: ['name'],
        filters: [['note', 'like', `%Madar hours ${reference}%`]],
        limit: 1,
      }),
    );
    return row?.name ?? null;
  }
}
