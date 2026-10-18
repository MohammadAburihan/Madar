import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Business } from '../../../core/business/business.service';
import { UnresolvedError, confirmRequest } from '../../../core/erpnext/confirmation';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { ApprovalDetail, ApprovalItem } from './approvals.models';

/** The inbox shows this many; the screen says so when there may be more. */
export const APPROVAL_LIMIT = 50;

type Doc = Record<string, unknown> & { name: string; doctype: string };

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** Text as written, without the Madar reference saved after it ("Madar leave LEV-…"). */
const prose = (v: unknown) =>
  text(typeof v === 'string' ? v.replace(/\s*Madar [a-z]+ [A-Z]+-[0-9A-Z]+\s*$/, '') : v);
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

/** The document's amount in the company currency (`currency`), or null when it has none in it. */
function amountOf(doc: Doc, currency: string): number | null {
  const first = (...fields: string[]) => {
    for (const field of fields) {
      const value = number(doc[field]);
      if (value !== null && !Number.isNaN(value)) {
        return value;
      }
    }
    return null;
  };
  switch (doc.doctype) {
    // What was claimed, before advances are set off (the grand total is net of them).
    case 'Expense Claim':
      return first('base_total_claimed_amount', 'total_claimed_amount');
    // What was asked for: unpaid, its paid amount is 0. Kept in its own currency, with no rate to convert it.
    case 'Employee Advance':
      return !doc['currency'] || doc['currency'] === currency ? first('advance_amount') : null;
  }
  // With rounding turned off ERPNext leaves the rounded total at 0: the grand total is owed.
  const rounded = number(doc['base_rounded_total']);
  return rounded ? rounded : first('base_grand_total', 'base_paid_amount');
}

/**
 * Approvals (ERPNext Workflow): the Open Workflow Actions Frappe keeps for the user's roles, each document's
 * available transitions, and applying one.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalsApiService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly stateFields = new Map<string, Promise<string>>();

  /**
   * Documents waiting for the user, newest first; another company's are left out. `capped` when ERPNext had as many
   * open actions as were asked for, so there may be more.
   */
  async inbox(business: Business): Promise<{ items: ApprovalItem[]; capped: boolean }> {
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
    const fields = new Map(
      await Promise.all(
        [...new Set(unique.map((a) => a.reference_doctype))].map(
          async (d) => [d, await this.stateField(d)] as const,
        ),
      ),
    );
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
    const items = docs
      .map((doc, i) => ({ doc, action: unique[i] }))
      .filter(
        (x): x is { doc: Doc; action: (typeof unique)[number] } =>
          !!x.doc && (!x.doc['company'] || x.doc['company'] === business.name),
      )
      .map(({ doc, action }) => ({
        doctype: action.reference_doctype,
        name: doc.name,
        title: titleOf(doc),
        amount: amountOf(doc, business.currency),
        state: String(doc[fields.get(action.reference_doctype)!] ?? action.workflow_state),
        date: String(doc['posting_date'] ?? doc['transaction_date'] ?? action.creation).slice(
          0,
          10,
        ),
      }));
    return { items, capped: actions.length >= APPROVAL_LIMIT };
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

  /**
   * One document with the actions the user (`user`, their login) may take on it now. Steps ERPNext would refuse as
   * self-approval are left out: `get_transitions` lists them, `apply_workflow` refuses them.
   */
  async item(
    doctype: string,
    name: string,
    business: Business,
    user: string,
  ): Promise<ApprovalDetail> {
    const [doc, field] = await Promise.all([
      this.doc(doctype, name, business),
      this.stateField(doctype),
    ]);
    const transitions = await firstValueFrom(
      this.erpnext.post<{ action: string; allow_self_approval?: number }[]>(
        'frappe.model.workflow.get_transitions',
        { doc },
      ),
    );
    const mayApprove = (t: { allow_self_approval?: number }) =>
      !!t.allow_self_approval || doc['owner'] !== user || user === 'Administrator';
    return {
      doctype,
      name: doc.name,
      title: titleOf(doc),
      amount: amountOf(doc, business.currency),
      state: String(doc[field] ?? ''),
      date: String(doc['posting_date'] ?? doc['transaction_date'] ?? doc['creation'] ?? '').slice(
        0,
        10,
      ),
      actions: [...new Set((transitions ?? []).filter(mayApprove).map((t) => t.action))],
      lines: [
        prose(doc['remark']),
        prose(doc['purpose']),
        prose(doc['description']),
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
    const [doc, field] = await Promise.all([
      this.doc(doctype, name, business),
      this.stateField(doctype),
    ]);
    const current = String(doc[field] ?? '');
    if (current !== state) {
      return { state: current, moved: true };
    }
    const result = await confirmRequest(
      this.erpnext.post<Doc>('frappe.model.workflow.apply_workflow', { doc, action }),
    );
    // A returned document is the answer, even when its state field couldn't be read for this role.
    if (result) {
      return { state: String(result[field] ?? ''), moved: false };
    }
    // Queued in the background, apply_workflow answers nothing: the document tells whether the step went through.
    const after = String((await this.doc(doctype, name, business))[field] ?? '');
    if (after === state) {
      throw new UnresolvedError();
    }
    return { state: after, moved: false };
  }

  /**
   * The field the doctype's workflow keeps its state in (`workflow_state` unless set otherwise), read once per doctype.
   * Only some roles may read Workflow; others get the standard field.
   */
  private stateField(doctype: string): Promise<string> {
    let field = this.stateFields.get(doctype);
    if (!field) {
      field = firstValueFrom(
        this.erpnext.list<{ workflow_state_field: string }>('Workflow', {
          fields: ['workflow_state_field'],
          filters: [
            ['document_type', '=', doctype],
            ['is_active', '=', 1],
          ],
          limit: 1,
        }),
      ).then(
        ([row]) => row?.workflow_state_field || 'workflow_state',
        (error: unknown) => {
          // Not kept: the next user signed in on this device may read it.
          this.stateFields.delete(doctype);
          if (ErpnextError.from(error).kind === 'forbidden') {
            return 'workflow_state';
          }
          throw error;
        },
      );
      this.stateFields.set(doctype, field);
    }
    return field;
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
