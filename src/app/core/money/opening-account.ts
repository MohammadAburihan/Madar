import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';
import { ErpnextError } from '../erpnext/erpnext-error';

/** The company's Temporary Opening account, where ERPNext books opening stock and opening invoices; null when it has none. */
export async function temporaryOpeningAccount(
  erpnext: ErpnextClient,
  company: string,
): Promise<string | null> {
  try {
    return await firstValueFrom(
      erpnext.post<string | null>(
        'erpnext.accounts.doctype.opening_invoice_creation_tool.opening_invoice_creation_tool.get_temporary_opening_account',
        { company },
      ),
    );
  } catch (error) {
    // ERPNext refuses when the company has none; a lost connection or a refusal stays what it is.
    const e = ErpnextError.from(error);
    if (e.kind === 'server' && e.status === 417) {
      return null;
    }
    throw error;
  }
}
