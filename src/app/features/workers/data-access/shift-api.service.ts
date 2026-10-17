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

/** A running shift to start again after a temporary one. */
export type Resumed = Running & { from: string };

/** The new shift's answer was lost; once it is found, `resumed` still has to be started again. */
export class ShiftUnresolvedError extends UnresolvedError {
  constructor(readonly resumed: Resumed[]) {
    super();
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
   * Submits the assignment. The shift worked until then ends the day before, and when the new one is temporary
   * it resumes the day after. A later shift that would overlap is refused before anything changes, and a refused
   * save puts the running shift back as it was. Shift Assignment has no free-text field for a reference; worker,
   * shift and start identify it, and `find()` looks a lost one up by them. A lost answer throws
   * ShiftUnresolvedError, carrying what is left to do once the new shift is found (`resume()`).
   */
  async assign(value: ShiftFormValue, business: Business): Promise<string> {
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
    for (const r of running) {
      await this.setEnd(r.name, dayBefore(value.from));
    }
    const resume = value.until
      ? running
          .filter((r) => !r.end_date || r.end_date > value.until)
          .map((r) => ({ ...r, from: dayAfter(value.until) }))
      : [];
    let name: string;
    try {
      const doc = await confirmRequest(
        this.insert(value.worker, value.shift, value.from, value.until, business),
      );
      name = doc.name;
    } catch (error) {
      if (error instanceof UnresolvedError) {
        throw new ShiftUnresolvedError(resume);
      }
      for (const r of running) {
        await this.setEnd(r.name, r.end_date).catch(() => undefined);
      }
      throw error;
    }
    await this.resume(value.worker, resume, business);
    return name;
  }

  /** The running shift again after a temporary one, as it was before (to its own end, or open-ended). */
  async resume(worker: string, resume: Resumed[], business: Business): Promise<void> {
    for (const r of resume) {
      await firstValueFrom(this.insert(worker, r.shift_type, r.from, r.end_date ?? '', business));
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
        ],
        limit: 1,
      }),
    );
    return row?.name ?? null;
  }
}
