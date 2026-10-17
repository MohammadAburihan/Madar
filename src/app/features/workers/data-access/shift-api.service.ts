import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Business } from '../../../core/business/business.service';
import { confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ShiftFormValue, ShiftType } from './workers.models';

/** "07:00:00" (or Frappe's "7:00:00") as "07:00". */
const hhmm = (time: string) => {
  const [h, m] = String(time ?? '').split(':');
  return `${(h ?? '0').padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
};

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

  /**
   * Submits the assignment. Shift Assignment has no free-text field for a reference; worker, shift and start
   * date identify it, and `find()` looks a lost one up by them.
   */
  async assign(value: ShiftFormValue, business: Business): Promise<string> {
    const doc = await confirmRequest(
      this.erpnext.post<{ name: string }>('frappe.client.insert', {
        doc: {
          doctype: 'Shift Assignment',
          employee: value.worker,
          shift_type: value.shift,
          start_date: value.from,
          ...(value.until ? { end_date: value.until } : {}),
          company: business.name,
          status: 'Active',
          docstatus: 1,
        },
      }),
    );
    return doc.name;
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
