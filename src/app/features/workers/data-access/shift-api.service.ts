import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Business } from '../../../core/business/business.service';
import { UnresolvedError, confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient, Filter } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { ShiftFormValue, ShiftType } from './workers.models';

/** "07:00:00" (or Frappe's "7:00:00") as "07:00". */
const hhmm = (time: string) => {
  const [h, m] = String(time ?? '').split(':');
  return `${(h ?? '0').padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
};

const shiftDay = (iso: string, by: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + by)).toISOString().slice(0, 10);
};
const dayBefore = (iso: string) => shiftDay(iso, -1);
const dayAfter = (iso: string) => shiftDay(iso, 1);

interface Running {
  name: string;
  shift_type: string;
  end_date: string | null;
}

/** A shift change, worked out before anything is written (see `ShiftApiService.plan`). */
export interface ShiftPlan {
  value: ShiftFormValue;
  /** Shifts to end the day before the new one, with their end dates as they were. */
  running: Running[];
  /** Shifts to start again the day after a temporary one. */
  resume: { shift_type: string; from: string; until: string | null }[];
}

/** The new shift was made, but the regular one couldn't be resumed after it; applying the plan again does. */
export class ShiftIncompleteError extends Error {
  constructor(readonly reason: unknown) {
    super('The regular shift was not resumed');
  }
}

/** Shifts (Frappe HR Shift Type) and who works them from when (Shift Assignment). */
@Injectable({ providedIn: 'root' })
export class ShiftApiService {
  private readonly erpnext = inject(ErpnextClient);

  async shiftTypes(): Promise<ShiftType[]> {
    const rows = await this.erpnext.listAll<{ name: string; start_time: string; end_time: string }>(
      'Shift Type',
      { fields: ['name', 'start_time', 'end_time'], orderBy: 'start_time asc, name asc' },
    );
    return rows.map((r) => ({ name: r.name, start: hhmm(r.start_time), end: hhmm(r.end_time) }));
  }

  /** The shift the worker works on `date`, if one is assigned. */
  async current(worker: string, date: string): Promise<ShiftType | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ shift_type: string }>('Shift Assignment', {
        fields: ['shift_type'],
        filters: [
          ['employee', '=', worker],
          ['docstatus', '=', 1],
          ['status', '=', 'Active'],
          ['start_date', '<=', date],
        ],
        orFilters: [
          ['end_date', 'is', 'not set'],
          ['end_date', '>=', date],
        ],
        orderBy: 'start_date desc',
        limit: 1,
      }),
    );
    if (!row) {
      return null;
    }
    const types = await this.shiftTypes();
    return (
      types.find((t) => t.name === row.shift_type) ?? { name: row.shift_type, start: '', end: '' }
    );
  }

  /** The worker's next shift starting after `date`, so a saved future change shows on their page. */
  async next(worker: string, date: string): Promise<{ shift: ShiftType; from: string } | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ shift_type: string; start_date: string }>('Shift Assignment', {
        fields: ['shift_type', 'start_date'],
        filters: [
          ['employee', '=', worker],
          ['docstatus', '=', 1],
          ['status', '=', 'Active'],
          ['start_date', '>', date],
        ],
        orderBy: 'start_date asc',
        limit: 1,
      }),
    );
    if (!row) {
      return null;
    }
    const types = await this.shiftTypes();
    return {
      shift: types.find((t) => t.name === row.shift_type) ?? {
        name: row.shift_type,
        start: '',
        end: '',
      },
      from: row.start_date,
    };
  }

  /**
   * Works out the change: Madar keeps one shift per worker, so the shifts running into the new one's start end the
   * day before, and when the new shift is temporary they resume the day after. A later shift that would overlap is
   * refused before anything changes.
   */
  async plan(value: ShiftFormValue): Promise<ShiftPlan> {
    const later = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Shift Assignment', {
        fields: ['name'],
        filters: [
          ['employee', '=', value.worker],
          ['docstatus', '=', 1],
          ['status', '=', 'Active'],
          ['start_date', '>=', value.from],
          ...(value.until ? ([['start_date', '<=', value.until]] as Filter[]) : []),
        ],
        limit: 1,
      }),
    );
    if (later.length) {
      throw new ErpnextError('server', 'A later shift overlaps', 417, 'OverlappingShiftError');
    }
    const running = await firstValueFrom(
      this.erpnext.list<Running>('Shift Assignment', {
        fields: ['name', 'shift_type', 'end_date'],
        filters: [
          ['employee', '=', value.worker],
          ['docstatus', '=', 1],
          ['status', '=', 'Active'],
          ['start_date', '<', value.from],
        ],
        orFilters: [
          ['end_date', 'is', 'not set'],
          ['end_date', '>=', value.from],
        ],
        limit: 0,
      }),
    );
    return {
      value,
      running,
      resume: value.until
        ? running
            .filter((r) => !r.end_date || r.end_date > value.until)
            .map((r) => ({
              shift_type: r.shift_type,
              from: dayAfter(value.until),
              until: r.end_date,
            }))
        : [],
    };
  }

  /**
   * Carries the plan out, every step skipped when already done, so running it again after a lost answer finishes
   * it without doing anything twice. ERPNext refusing the new shift puts the running shifts back as they were;
   * after it exists, a failed resume throws ShiftIncompleteError and running the plan again finishes it.
   */
  async apply(plan: ShiftPlan, business: Business): Promise<void> {
    const { value } = plan;
    for (const r of plan.running) {
      await this.setEnd(r.name, dayBefore(value.from));
    }
    if (!(await this.find(value))) {
      try {
        await confirmRequest(
          this.insert(value.worker, value.shift, value.from, value.until, business),
        );
      } catch (error) {
        // Only ERPNext refusing the new shift proves it doesn't exist; anything else is left for a retry.
        if (!(error instanceof UnresolvedError) && ErpnextError.from(error).kind === 'server') {
          await this.restore(plan);
        }
        throw error;
      }
    }
    try {
      for (const r of plan.resume) {
        const again = {
          worker: value.worker,
          shift: r.shift_type,
          from: r.from,
          until: r.until ?? '',
        };
        if (!(await this.find(again))) {
          await confirmRequest(
            this.insert(again.worker, again.shift, again.from, again.until, business),
          );
        }
      }
    } catch (error) {
      throw error instanceof UnresolvedError ? error : new ShiftIncompleteError(error);
    }
  }

  /** Puts the running shifts' end dates back, when the new shift was never made. */
  async restore(plan: ShiftPlan): Promise<void> {
    for (const r of plan.running) {
      await this.setEnd(r.name, r.end_date).catch(() => undefined);
    }
  }

  private insert(worker: string, shift: string, from: string, until: string, business: Business) {
    return this.erpnext.post<{ name: string }>('frappe.client.insert', {
      doc: {
        doctype: 'Shift Assignment',
        employee: worker,
        shift_type: shift,
        start_date: from,
        ...(until ? { end_date: until } : {}),
        company: business.name,
        status: 'Active',
        docstatus: 1,
      },
    });
  }

  private setEnd(name: string, end: string | null) {
    // End date stays editable on a submitted assignment.
    return firstValueFrom(
      this.erpnext.post('frappe.client.set_value', {
        doctype: 'Shift Assignment',
        name,
        fieldname: 'end_date',
        value: end ?? '',
      }),
    );
  }

  async find(value: ShiftFormValue): Promise<string | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Shift Assignment', {
        fields: ['name'],
        filters: [
          ['employee', '=', value.worker],
          ['shift_type', '=', value.shift],
          ['start_date', '=', value.from],
          ['docstatus', '=', 1],
          ['status', '=', 'Active'],
        ],
        limit: 1,
      }),
    );
    return row?.name ?? null;
  }
}
