export interface InvoiceDue {
  name: string;
  customer: string;
  dueDate: string;
  outstanding: number;
}

export interface Draft {
  doctype: 'Sales Invoice' | 'Sales Order' | 'Quotation';
  name: string;
  party: string;
  modified: string;
  total: number;
  currency: string;
}

export interface Drafts {
  count: number;
  /** Most recently changed first. */
  recent: Draft[];
}

export interface Delivery {
  name: string;
  supplier: string;
  scheduleDate: string;
  itemName: string;
  qty: number;
}

export interface SupplyNeed {
  name: string;
  projectName: string;
  scheduleDate: string;
  itemName: string;
  qty: number;
  available: number;
}

export interface LowStock {
  count: number;
  warehouse: string | null;
}

/** Each field is undefined when the user's role can't read that data. */
export interface HomeData {
  todaySales?: number;
  receivables?: number;
  invoicesDue?: InvoiceDue[];
  drafts?: Drafts;
  deliveries?: Delivery[];
  supply?: SupplyNeed[];
  lowStock?: LowStock;
}
