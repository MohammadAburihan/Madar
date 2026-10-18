import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Business } from '../../../core/business/business.service';
import { confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { ApprovalDetail, ApprovalItem } from './approvals.models';

/** The inbox shows this many; the screen says so when there may be more. */
export const APPROVAL_LIMIT = 50;

type Doc = Record<string, unknown> & { name: string; doctype: string };

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const number = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));

/** Who or what a document is about, from the fields the common doctypes carry. */
function titleOf(doc: Doc): string {
  return (
    text(doc['employee_name']) ??
    text(doc['supplier_name']) ??
    text(doc['customer_name']) ??
    text(doc['party_name']) ??
    text(doc['title']) ??
    doc.name
  );
}

function amountOf(doc: Doc): number | null {
  for (const field of [
    'base_rounded_total',
    'base_grand_total',
    'total_claimed_amount',
    'base_paid_amount',
    'advance_amount',
    'total_amount',
  ]) {
    const value = number(doc[field]);
    if (value !== null && !Number.isNaN(value)) {
      return value;
    }
  }
  return null;
}

/**
 * Approvals (ERPNext Workflow): the Open Workflow Actions Frappe keeps for the user's roles, each document's
 * available transitions, and applying one.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalsApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** Documents waiting for the user, newest first; another company's are left out. */
  async inbox(business: Business): Promise<ApprovalItem[]> {
    const actions = await firstValueFrom(
      this.erpnext.list<{
        reference_doctype: string;
        reference_name: string;
        workflow_state: string;
        creation: string;
      }>('Workflow Action', {
        fields: ['reference_doctype', 'reference_name', 'workflow_state', 'creation'],
        // Frappe limits these to the user's roles itself.
        filters: [['status', '=', 'Open']],
        orderBy: 'creation desc',
        limit: APPROVAL_LIMIT,
      }),
    );
    const seen = new Set<string>();
    const unique = actions.filter((a) => {
      const key = `${a.reference_doctype}/${a.reference_name}`;
      return seen.has(key) ? false : (seen.add(key), true);
    });
    const docs = await Promise.all(
      unique.map((a) =>
        firstValueFrom(this.erpnext.doc<Doc>(a.reference_doctype, a.reference_name)).catch(
          (error: unknown) => {
            // Deleted since, or not readable by this role: not something the user can act on.
            const e = ErpnextError.from(error);
            if (e.kind === 'forbidden' || e.status === 404 || e.excType === 'DoesNotExistError') {
              return null;
            }
            throw error;
          },
        ),
      ),
    );
    return docs
      .map((doc, i) => ({ doc, action: unique[i] }))
      .filter(
        (x): x is { doc: Doc; action: (typeof unique)[number] } =>
          !!x.doc && (!x.doc['company'] || x.doc['company'] === business.name),
      )
      .map(({ doc, action }) => ({
        doctype: action.reference_doctype,
        name: doc.name,
        title: titleOf(doc),
        amount: amountOf(doc),
        state: String(doc['workflow_state'] ?? action.workflow_state),
        date: String(doc['posting_date'] ?? doc['transaction_date'] ?? action.creation).slice(
          0,
          10,
        ),
      }));
  }

  /** Leave requests waiting for a decision (decided on the Leave requests pages under Workers). */
  async leaveWaiting(business: Business): Promise<ApprovalItem[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        employee_name: string;
        leave_type: string;
        from_date: string;
        to_date: string;
        status: string;
      }>('Leave Application', {
        fields: ['name', 'employee_name', 'leave_type', 'from_date', 'to_date', 'status'],
        filters: [
          ['company', '=', business.name],
          ['docstatus', '=', 0],
        ],
        orderBy: 'from_date asc, name asc',
        limit: APPROVAL_LIMIT,
      }),
    );
    return rows.map((r) => ({
      doctype: 'Leave Application',
      name: r.name,
      title: `${r.employee_name} · ${r.leave_type}`,
      amount: null,
      state: r.status,
      date: r.from_date,
    }));
  }

  /** One document with the actions the user may take on it now. */
  async item(doctype: string, name: string, business: Business): Promise<ApprovalDetail> {
    const doc = await this.doc(doctype, name, business);
    const transitions = await firstValueFrom(
      this.erpnext.post<{ action: string }[]>('frappe.model.workflow.get_transitions', { doc }),
    );
    return {
      doctype,
      name: doc.name,
      title: titleOf(doc),
      amount: amountOf(doc),
      state: String(doc['workflow_state'] ?? ''),
      date: String(doc['posting_date'] ?? doc['transaction_date'] ?? doc['creation'] ?? '').slice(
        0,
        10,
      ),
      actions: [...new Set((transitions ?? []).map((t) => t.action))],
      lines: [
        text(doc['remark']),
        text(doc['purpose']),
        text(doc['description']),
        ...((doc['expenses'] as Record<string, unknown>[] | undefined) ?? [])
          .map((e) => text(e['description']))
          .filter((d): d is string => !!d),
      ].filter((l): l is string => !!l),
    };
  }

  /**
   * Takes an action on the document as it was shown (`state`). One that has moved on since (decided elsewhere,
   * or by a lost answer) is returned as it stands, never acted on twice. A lost answer throws UnresolvedError;
   * reading the item again tells what happened.
   */
  async apply(
    doctype: string,
    name: string,
    state: string,
    action: string,
    business: Business,
  ): Promise<{ state: string; moved: boolean }> {
    const doc = await this.doc(doctype, name, business);
    const current = String(doc['workflow_state'] ?? '');
    if (current !== state) {
      return { state: current, moved: true };
    }
    const result = await confirmRequest(
      this.erpnext.post<Doc>('frappe.model.workflow.apply_workflow', { doc, action }),
    );
    return { state: String(result?.['workflow_state'] ?? ''), moved: false };
  }

  private async doc(doctype: string, name: string, business: Business): Promise<Doc> {
    const doc = await firstValueFrom(this.erpnext.doc<Doc>(doctype, name));
    if (doc['company'] && doc['company'] !== business.name) {
      throw new ErpnextError(
        'server',
        `${doctype} ${name} is not in ${business.name}`,
        404,
        'DoesNotExistError',
      );
    }
    return doc;
  }
}
