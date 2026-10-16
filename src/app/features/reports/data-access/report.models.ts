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
