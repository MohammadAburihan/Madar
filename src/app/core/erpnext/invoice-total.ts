/**
 * What the customer or supplier actually owes in total. ERPNext rounds invoice totals by default and
 * computes `outstanding_amount` from `rounded_total`, which is 0 when rounding is off.
 */
export function invoiceTotal(invoice: {
  grand_total: number;
  rounded_total?: number | null;
}): number {
  return invoice.rounded_total || invoice.grand_total;
}
