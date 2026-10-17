import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Business } from '../../../core/business/business.service';
import { UnresolvedError, confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { AdvanceFormValue } from './workers.models';

/** The advance is recorded but its payment failed: giving it again (same reference) pays that advance. */
export class AdvanceNotPaidError extends Error {
  constructor(
    readonly advance: string,
    readonly reason: unknown,
  ) {
    super(`Employee Advance ${advance} was recorded but not paid`);
  }
}

interface AdvanceDoc {
  name: string;
  status: string;
  docstatus: number;
}

/**
 * Advances to workers: a submitted Employee Advance, paid from a payment account by a Payment Entry. Both carry
 * the Madar reference, so giving the same advance again finds what was already done and finishes the rest.
 */
@Injectable({ providedIn: 'root' })
export class AdvanceApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Records and pays the advance; resolves to the Employee Advance. A lost answer throws UnresolvedError. */
  async give(value: AdvanceFormValue, reference: string, business: Business): Promise<string> {
    const advance =
      (await this.findAdvance(reference)) ?? (await this.record(value, reference, business));
    try {
      await this.pay(advance, value, reference);
    } catch (error) {
      throw error instanceof UnresolvedError ? error : new AdvanceNotPaidError(advance.name, error);
    }
    return advance.name;
  }

  private async pay(
    advance: AdvanceDoc,
    value: AdvanceFormValue,
    reference: string,
  ): Promise<void> {
    if (advance.status !== 'Paid' && !(await this.findPayment(reference))) {
      const payment = await firstValueFrom(
        this.erpnext.get<Record<string, unknown>>(
          'hrms.overrides.employee_payment_entry.get_payment_entry_for_employee',
          { dt: 'Employee Advance', dn: advance.name },
        ),
      );
      await confirmRequest(
        this.erpnext.post('frappe.client.insert', {
          doc: {
            ...payment,
            mode_of_payment: value.mode,
            paid_from: value.account,
            posting_date: value.date,
            reference_no: reference,
            reference_date: value.date,
            docstatus: 1,
          },
        }),
      );
    }
  }

  private async record(
    value: AdvanceFormValue,
    reference: string,
    business: Business,
  ): Promise<AdvanceDoc> {
    const company = await firstValueFrom(
      this.erpnext.get<{ default_employee_advance_account?: string | null }>(
        'frappe.client.get_value',
        {
          doctype: 'Company',
          filters: business.name,
          fieldname: JSON.stringify(['default_employee_advance_account']),
        },
      ),
    );
    return confirmRequest(
      this.erpnext.post<AdvanceDoc>('frappe.client.insert', {
        doc: {
          doctype: 'Employee Advance',
          employee: value.worker,
          posting_date: value.date,
          // Employee Advance has no remarks; the purpose carries the Madar reference after the user's text.
          purpose: `${value.purpose.trim()}\n\nMadar advance ${reference}`,
          advance_amount: value.amount,
          company: business.name,
          currency: business.currency,
          advance_account: company?.default_employee_advance_account ?? undefined,
          mode_of_payment: value.mode,
          docstatus: 1,
        },
      }),
    );
  }

  private async findAdvance(reference: string): Promise<AdvanceDoc | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<AdvanceDoc>('Employee Advance', {
        fields: ['name', 'status', 'docstatus'],
        filters: [
          ['purpose', 'like', `%Madar advance ${reference}%`],
          ['docstatus', '=', 1],
        ],
        limit: 1,
      }),
    );
    return row ?? null;
  }

  private async findPayment(reference: string): Promise<string | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ name: string }>('Payment Entry', {
        fields: ['name'],
        filters: [
          ['reference_no', '=', reference],
          ['docstatus', '=', 1],
        ],
        limit: 1,
      }),
    );
    return row?.name ?? null;
  }
}
