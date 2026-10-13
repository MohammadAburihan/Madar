import { round2 } from '../../../core/format/number';
import type { PaymentAccount } from '../../../core/money/payment-accounts.service';

export interface UnpaidInvoice {
  name: string;
  postingDate: string;
  dueDate: string | null;
  total: number;
  outstanding: number;
  /** One Payment Entry can only pay invoices on the same receivable account. */
  receivable: string;
}

export interface Allocation {
  invoice: string;
  amount: number;
}

export interface CollectionRequest {
  reference: string;
  company: string;
  customer: string;
  account: PaymentAccount;
  amount: number;
  allocations: Allocation[];
}

/** An allocated invoice as it stands after the payment. */
export interface CollectedInvoice {
  invoice: string;
  allocated: number;
  total: number;
  paid: number;
  outstanding: number;
}

export interface CollectionResult {
  payment: string;
  postingDate: string;
  amount: number;
  invoices: CollectedInvoice[];
}

/** Spreads the amount over the invoices, oldest first, never more than each one owes. */
export function allocate(invoices: readonly UnpaidInvoice[], amount: number): Allocation[] {
  let left = round2(amount);
  const allocations: Allocation[] = [];
  for (const invoice of [...invoices].sort((a, b) => a.postingDate.localeCompare(b.postingDate))) {
    if (left <= 0) {
      break;
    }
    const share = round2(Math.min(left, invoice.outstanding));
    allocations.push({ invoice: invoice.name, amount: share });
    left = round2(left - share);
  }
  return allocations;
}
