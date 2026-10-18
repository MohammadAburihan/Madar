import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Business } from '../../../core/business/business.service';
import { confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { PayRow, SalaryFormValue } from './workers.models';

interface SlipDoc {
  name: string;
  employee: string;
  docstatus: number;
  gross_pay: number;
  net_pay: number;
  [key: string]: unknown;
}

/** A different salary is already set from that date; a submitted assignment is changed in ERPNext. */
export class SalaryExistsError extends Error {
  constructor(readonly base: number) {
    super(`A salary of ${base} is already set from that date`);
  }
}

/** The month's last day, for a `YYYY-MM-01` month. */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Pay (Frappe HR): each worker's monthly salary as a Salary Structure Assignment on the business's Madar salary
 * structure (Basic = the monthly salary), and the month's Salary Slips made from it and confirmed.
 */
@Injectable({ providedIn: 'root' })
export class PayrollApiService {
  private readonly erpnext = inject(ErpnextClient);

  /**
   * Sets the worker's monthly salary from a date. The same salary on that date again finds the one already set; a
   * different one on the same date is refused with SalaryExistsError (a submitted assignment can't be changed here).
   */
  async setSalary(value: SalaryFormValue, business: Business): Promise<string> {
    const existing = await this.salaryFrom(value.worker, value.from);
    if (existing) {
      if (existing.base !== value.monthly) {
        throw new SalaryExistsError(existing.base);
      }
      return existing.name;
    }
    const structure = await this.structure(business);
    const doc = await confirmRequest(
      this.erpnext.post<{ name: string }>('frappe.client.insert', {
        doc: {
          doctype: 'Salary Structure Assignment',
          employee: value.worker,
          salary_structure: structure,
          from_date: value.from,
          base: value.monthly,
          company: business.name,
          currency: business.currency,
          docstatus: 1,
        },
      }),
    );
    return doc.name;
  }

  /** The salary assignment starting on that date, if one was made (by a lost answer, say). */
  async salaryFrom(worker: string, from: string): Promise<{ name: string; base: number } | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string; base: number }>('Salary Structure Assignment', {
        fields: ['name', 'base'],
        filters: [
          ['employee', '=', worker],
          ['from_date', '=', from],
          ['docstatus', '=', 1],
        ],
        limit: 1,
      }),
    );
    return row ? { name: row.name, base: Number(row.base || 0) } : null;
  }

  /** The month's pay: every worker employed in it, with their slip or that they have no salary yet. */
  async month(month: string, business: Business): Promise<PayRow[]> {
    const end = monthEnd(month);
    const workers = await this.erpnext.listAll<{
      name: string;
      employee_name: string;
      status: string;
    }>('Employee', {
      fields: ['name', 'employee_name', 'status'],
      filters: [
        ['company', '=', business.name],
        ['date_of_joining', '<=', end],
      ],
      orFilters: [
        ['relieving_date', 'is', 'not set'],
        ['relieving_date', '>=', month],
      ],
      orderBy: 'employee_name asc, name asc',
    });
    const [salaries, slips] = await Promise.all([
      this.erpnext.listAll<{ employee: string }>('Salary Structure Assignment', {
        fields: ['employee'],
        filters: [
          ['company', '=', business.name],
          ['from_date', '<=', end],
          ['docstatus', '=', 1],
        ],
      }),
      this.erpnext.listAll<SlipDoc>('Salary Slip', {
        fields: ['name', 'employee', 'docstatus', 'gross_pay', 'net_pay'],
        filters: [
          ['company', '=', business.name],
          ['start_date', '=', month],
          ['docstatus', '<', 2],
        ],
      }),
    ]);
    const withSalary = new Set(salaries.map((s) => s.employee));
    const slipOf = new Map(slips.map((s) => [s.employee, s]));
    // Workers no longer active show only for a salary or slip they had; there is nothing to set for them here.
    const shown = workers.filter(
      (w) => w.status === 'Active' || withSalary.has(w.name) || slipOf.has(w.name),
    );
    return shown.map((w) => {
      const slip = slipOf.get(w.name);
      return {
        id: w.name,
        name: w.employee_name,
        hasSalary: withSalary.has(w.name),
        slip: slip
          ? {
              name: slip.name,
              confirmed: slip.docstatus === 1,
              gross: Number(slip.gross_pay || 0),
              net: Number(slip.net_pay || 0),
            }
          : null,
      };
    });
  }

  /**
   * Makes a draft slip for the worker's month; Frappe HR works the pay out from their salary and the days. A slip
   * already made for that month (by a lost answer) is kept instead of a second.
   */
  async makeSlip(worker: string, month: string, business: Business): Promise<void> {
    const [existing] = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Salary Slip', {
        fields: ['name'],
        filters: [
          ['employee', '=', worker],
          ['start_date', '=', month],
          ['docstatus', '<', 2],
        ],
        limit: 1,
      }),
    );
    if (existing) {
      return;
    }
    const end = monthEnd(month);
    await confirmRequest(
      this.erpnext.post('frappe.client.insert', {
        doc: {
          doctype: 'Salary Slip',
          employee: worker,
          start_date: month,
          end_date: end,
          posting_date: end,
          payroll_frequency: 'Monthly',
          company: business.name,
        },
      }),
    );
  }

  /** Confirms a draft slip; one confirmed already (elsewhere, or by a lost answer) is left as it is. */
  async confirmSlip(name: string): Promise<void> {
    const doc = await firstValueFrom(this.erpnext.doc<SlipDoc>('Salary Slip', name));
    if (doc.docstatus !== 0) {
      return;
    }
    await confirmRequest(this.erpnext.post('frappe.client.submit', { doc }));
  }

  /** The business's Madar salary structure, made the first time a salary is set. */
  private async structure(business: Business): Promise<string> {
    const name = `Madar monthly - ${business.abbr}`;
    const [found] = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Salary Structure', {
        fields: ['name'],
        filters: [
          ['name', '=', name],
          ['docstatus', '=', 1],
        ],
        limit: 1,
      }),
    );
    if (found) {
      return found.name;
    }
    const components = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Salary Component', {
        fields: ['name'],
        filters: [
          ['type', '=', 'Earning'],
          ['salary_component_abbr', '=', 'B'],
        ],
        limit: 1,
      }),
    );
    if (!components.length) {
      throw new ErpnextError('server', 'No basic salary component', 417, 'NoBasicComponent');
    }
    try {
      await firstValueFrom(
        this.erpnext.post('frappe.client.insert', {
          doc: {
            doctype: 'Salary Structure',
            __newname: name,
            name,
            company: business.name,
            payroll_frequency: 'Monthly',
            currency: business.currency,
            is_active: 'Yes',
            earnings: [
              { salary_component: components[0].name, amount_based_on_formula: 1, formula: 'base' },
            ],
            docstatus: 1,
          },
        }),
      );
    } catch (error) {
      if (ErpnextError.from(error).excType !== 'DuplicateEntryError') {
        throw error;
      }
      // Made meanwhile by another save, or left unsubmitted in Desk: only a submitted one can be used.
      const [made] = await firstValueFrom(
        this.erpnext.list<{ docstatus: number }>('Salary Structure', {
          fields: ['docstatus'],
          filters: [['name', '=', name]],
          limit: 1,
        }),
      );
      if (made?.docstatus !== 1) {
        throw new ErpnextError('server', `${name} isn't submitted`, 417, 'StructureNotSubmitted');
      }
    }
    return name;
  }
}
