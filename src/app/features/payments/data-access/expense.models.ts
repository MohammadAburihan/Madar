/** An expense category: one of the company's operating expense accounts. */
export interface ExpenseCategory {
  account: string;
  name: string;
}

export interface ExpenseRequest {
  reference: string;
  company: string;
  /** The expense account the category stands for. */
  category: string;
  amount: number;
  /** The posting date, as the user picked it. */
  date: string;
  /** The Mode of Payment and its account the money is paid from. */
  account: { mode: string; account: string; label: string; isBank: boolean };
  project: string | null;
}

export interface RecordedExpense {
  name: string;
  date: string;
  amount: number;
  categoryName: string;
  accountName: string;
  project: string | null;
}
