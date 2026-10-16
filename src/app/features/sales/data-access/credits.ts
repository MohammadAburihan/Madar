import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';

/** Without the credits, paid would count them as money: only a role's 403 is passed over. */
const forbiddenAsNone = (error: unknown): never[] => {
  if (ErpnextError.from(error).kind === 'forbidden') {
    return [];
  }
  throw error;
};

/**
 * What credit notes took off a sales invoice's outstanding, as ERPNext's payment ledger records it: returns made
 * against it, and credit notes matched to it later (a "Credit Note" Journal Entry). Bank journals are money.
 * Both currencies of the ledger: the receivable account's, and the company's.
 */
export async function creditsAgainst(
  erpnext: ErpnextClient,
  invoice: string,
): Promise<{ account: number; company: number }> {
  const entries = await firstValueFrom(
    erpnext.list<{
      voucher_type: string;
      voucher_no: string;
      amount: number;
      amount_in_account_currency: number;
    }>('Payment Ledger Entry', {
      fields: ['voucher_type', 'voucher_no', 'amount', 'amount_in_account_currency'],
      filters: [
        ['against_voucher_type', '=', 'Sales Invoice'],
        ['against_voucher_no', '=', invoice],
        ['voucher_type', 'in', ['Sales Invoice', 'Journal Entry']],
        ['voucher_no', '!=', invoice],
        ['delinked', '=', 0],
      ],
      limit: 0,
    }),
  ).catch(forbiddenAsNone);
  const journals = [
    ...new Set(entries.filter((e) => e.voucher_type === 'Journal Entry').map((e) => e.voucher_no)),
  ];
  const creditJournals = new Set(
    journals.length
      ? (
          await firstValueFrom(
            erpnext.list<{ name: string }>('Journal Entry', {
              fields: ['name'],
              filters: [
                ['name', 'in', journals],
                ['voucher_type', '=', 'Credit Note'],
              ],
              limit: 0,
            }),
          ).catch(forbiddenAsNone)
        ).map((j) => j.name)
      : [],
  );
  const credits = entries.filter(
    (e) => e.voucher_type === 'Sales Invoice' || creditJournals.has(e.voucher_no),
  );
  const sum = (pick: (e: (typeof credits)[number]) => number) =>
    Math.max(Math.round(-credits.reduce((total, e) => total + Number(pick(e)), 0) * 100) / 100, 0);
  return { account: sum((e) => e.amount_in_account_currency), company: sum((e) => e.amount) };
}
