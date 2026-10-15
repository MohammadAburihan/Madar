export type ProjectKind = 'customer' | 'internal';
export type ProjectStatus = 'open' | 'completed' | 'cancelled';

export interface ProjectSummary {
  name: string;
  title: string;
  kind: ProjectKind;
  customer: string | null;
  customerName: string | null;
  status: ProjectStatus;
}

export interface ProjectTask {
  subject: string;
  due: string | null;
  /** The assignees' names (or user ids when a name couldn't be read). */
  owners: string[];
  status: string;
}

/** One item the project needs: what its material requests ask for, and what stock could supply it. */
export interface Requirement {
  item: string;
  itemName: string;
  uom: string;
  required: number;
  /** Stock in the company's own warehouses, outside the project sites. */
  available: number;
}

export interface Attachment {
  name: string;
  size: number | null;
  date: string;
}

export interface LinkedRecord {
  kind: 'sale' | 'order' | 'purchase' | 'expense';
  name: string;
  /** A short detail: the amount, or the order's status. */
  detail: string;
  amount: number | null;
}

export interface ProjectDetail extends ProjectSummary {
  budget: number;
  /** What the project's expense postings add up to; null for roles that can't read the ledger. */
  actual: number | null;
  plannedDate: string | null;
  /** Null when the role can't read tasks. */
  tasks: ProjectTask[] | null;
  requirements: Requirement[];
  attachments: Attachment[];
  linked: LinkedRecord[];
}

export interface ProjectRequest {
  title: string;
  kind: ProjectKind;
  customer: string | null;
  budget: number | null;
  plannedDate: string | null;
}

export interface RequirementRequest {
  reference: string;
  project: string;
  item: string;
  uom: string;
  qty: number;
}
