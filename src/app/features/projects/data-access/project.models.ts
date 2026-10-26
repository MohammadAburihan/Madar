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

/** An item the project holds at the site. */
export interface SiteItem {
  item: string;
  itemName: string;
  uom: string;
  atSite: number;
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

/** A submitted sales invoice (credit notes included) or sales order booked to the project. */
export interface ProjectSale {
  kind: 'invoice' | 'order';
  name: string;
  /** ERPNext's status, e.g. `Paid`, `Unpaid`, `Credit Note Issued`, `To Deliver and Bill`. */
  status: string;
  isReturn: boolean;
  /** Company currency; a credit note is negative. */
  amount: number;
}

export interface ProjectSales {
  rows: ProjectSale[];
  /** Submitted invoices less credit notes in company currency; null when only the user's own sales are listed. */
  billed: number | null;
  /** Submitted invoices and orders beyond the rows listed. */
  moreInvoices: number;
  moreOrders: number;
}

export interface ProjectDetail extends ProjectSummary {
  budget: number;
  /** What the project's expense postings add up to; null for roles that can't read the ledger. */
  actual: number | null;
  plannedDate: string | null;
  /** Null when the role can't read tasks. */
  tasks: ProjectTask[] | null;
  requirements: Requirement[];
  siteItems: SiteItem[];
  attachments: Attachment[];
  linked: LinkedRecord[];
  /** False when the project's customer is disabled; null when it couldn't be read or the project has none. */
  customerActive: boolean | null;
  /** Null unless the caller asked for the project's sales. */
  sales: ProjectSales | null;
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

/** One item at a project's site: what was delivered, used and returned, and what is there now. */
export interface SiteBalance {
  item: string;
  itemName: string;
  uom: string;
  site: string;
  delivered: number;
  consumed: number;
  returned: number;
  /** What went back to each warehouse. */
  returnedTo: Record<string, number>;
  /** The project's share of the site warehouse, from the stock ledger. */
  atSite: number;
  pendingOrders: { name: string; qty: number }[];
  /** The company's own warehouses with the item's stock in each, where unused stock can go back. */
  warehouses: { warehouse: string; name: string; qty: number }[];
  /** The warehouse most of the item came from: the suggested place to return it. */
  returnTo: string | null;
}

/** Records use at the site (to is null), or returns unused stock from the site to a warehouse. */
export interface SiteRequest {
  reference: string;
  company: string;
  project: string;
  item: string;
  uom: string;
  qty: number;
  site: string;
  to: string | null;
}
