export interface ReturnLine {
  /** The original invoice row, which the return row points back to. */
  row: string;
  code: string;
  name: string;
  uom: string;
  sold: number;
  /** What is left to return: sold less earlier returns. */
  returnable: number;
  /** Company currency, after any discount and with the invoice's taxes, as the credit note will credit it. */
  rate: number;
  /** Where the sale took the goods from; the return suggests it. */
  warehouse: string | null;
  isStock: boolean;
}

export interface ReturnSource {
  invoice: string;
  customerName: string;
  /** The sale moved the stock itself (quick sale), so the return brings it back. */
  movesStock: boolean;
  /** Company currency. */
  total: number;
  outstanding: number;
  /** What the customer paid against it: the total less what is owed and earlier credits against it. */
  paid: number;
  lines: ReturnLine[];
}

/** The warehouse choice that sends each row back to the warehouse it was sold from. */
export const AS_SOLD = 'as-sold';

export interface ReturnRequest {
  /** Madar's idempotency reference, kept in the credit note's remarks. */
  reference: string;
  invoice: string;
  /** Company currency, which the result's amounts are given in. */
  currency: string;
  /** One warehouse for every row, or null for each row's own. */
  warehouse: string | null;
  reason: string;
  /** Only rows returning something; qty is positive, in the row's unit. */
  lines: { row: string; qty: number }[];
}

export interface ReturnResult {
  name: string;
  /** Company currency, positive. */
  credit: number;
  /** The original invoice's outstanding after the return, company currency. */
  dueAfter: number;
}

export const creditFor = (lines: readonly ReturnLine[], quantities: Record<string, number>) =>
  Math.round(lines.reduce((sum, l) => sum + (quantities[l.row] || 0) * l.rate, 0) * 100) / 100;
