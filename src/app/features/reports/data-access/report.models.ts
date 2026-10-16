/** One payment account's movements in a period: what came in (debits) and went out (credits). */
export interface AccountFlow {
  account: string;
  name: string;
  moneyIn: number;
  moneyOut: number;
}

/** Posted figures for a period, in the company currency. */
export interface PeriodFigures {
  from: string;
  to: string;
  income: number;
  costOfGoods: number;
  /** Every other expense account, including stock adjustments. */
  expenses: number;
  profit: number;
  moneyIn: number;
  moneyOut: number;
  accounts: AccountFlow[];
}

export interface DateRange {
  from: string;
  to: string;
}

export type PartyKind = 'customer' | 'supplier';

/** One document on a statement, with the running balance after it. */
export interface StatementEntry {
  date: string;
  voucherType: string;
  voucher: string;
  kind: 'invoice' | 'return' | 'payment' | 'journal';
  /** "3 Olive tree" and how many more lines, for an invoice. */
  firstItem: { name: string; qty: number; more: number } | null;
  /** The cash or bank account a payment moved through, without the company suffix. */
  account: string | null;
  /** The invoices a payment settled. */
  against: string[];
  /** What the document added to the balance (an invoice) or took off it (a payment, a return). */
  invoiced: number;
  paid: number;
  balance: number;
}

/** A customer's or supplier's account for a period: what was owed before, what moved, what is owed now. */
export interface Statement {
  kind: PartyKind;
  party: string;
  range: DateRange;
  opening: number;
  invoiced: number;
  paid: number;
  outstanding: number;
  invoices: number;
  payments: number;
  entries: StatementEntry[];
}
