import { round2 } from '../format/number';

/**
 * An invoice with payment terms comes back from `get_payment_entry` as one reference row per term. Each row's
 * `outstanding_amount` is the whole invoice's; what the term still owes is `payment_term_outstanding`.
 * Fill the rows in order so no term is allocated more than it owes.
 */
export function spreadAllocation(
  rows: Record<string, unknown>[],
  amount: number,
): Record<string, unknown>[] {
  let left = amount;
  return rows
    .map((row, i) => {
      const owed = Number(row['payment_term_outstanding'] ?? row['outstanding_amount'] ?? 0);
      const share = i === rows.length - 1 ? left : round2(Math.min(left, owed));
      left = round2(left - share);
      return { ...row, allocated_amount: share };
    })
    .filter((row) => row.allocated_amount > 0);
}

/** A template from `get_payment_entry` is a new document; spreading it over a draft must drop those flags. */
export function withoutLocalFlags(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !key.startsWith('__')));
}
