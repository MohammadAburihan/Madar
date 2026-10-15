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

/** An open material-request row a delivery can count against, oldest first. */
export interface RequestRow {
  request: string;
  row: string;
  /** Still to deliver, in the stock unit. */
  open: number;
}

/** What one item of a project still needs, where stock is, and what is on order. */
export interface SupplyPlan {
  item: string;
  itemName: string;
  /** The stock unit everything here is counted in. */
  uom: string;
  /** The shared project sites warehouse. */
  site: string;
  need: number;
  requestRows: RequestRow[];
  /** The project's share of the site warehouse. */
  atSite: number;
  /** The company's own warehouses that hold some, most first. */
  sources: { warehouse: string; name: string; qty: number }[];
  /** Purchase orders for the project still waiting to be received. */
  pendingOrders: { name: string; qty: number }[];
}

export interface SupplyRequest {
  reference: string;
  company: string;
  project: string;
  item: string;
  uom: string;
  qty: number;
  from: string;
  site: string;
  requestRows: RequestRow[];
}
