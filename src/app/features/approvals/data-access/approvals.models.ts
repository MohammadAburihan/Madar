/** A document waiting in an ERPNext workflow for a step the user's roles may take. */
export interface ApprovalItem {
  doctype: string;
  name: string;
  /** Who or what it is about: the employee, party or title. */
  title: string;
  /** Its total, when it has one (company currency). */
  amount: number | null;
  state: string;
  date: string;
  /** Listed from Frappe HR's leave requests, not from a workflow: decided on the leave page. */
  leaveOnly?: boolean;
}

export interface ApprovalDetail extends ApprovalItem {
  /** The workflow actions the user may take now, as ERPNext names them. */
  actions: string[];
  /** Short lines describing it: purpose, lines, who asked. */
  lines: string[];
}
