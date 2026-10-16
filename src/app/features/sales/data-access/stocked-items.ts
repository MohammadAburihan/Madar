import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';

/** Which of these item codes are stock items (goods), as opposed to services. */
export async function stockedItems(erpnext: ErpnextClient, codes: string[]): Promise<Set<string>> {
  const unique = [...new Set(codes)];
  if (!unique.length) {
    return new Set();
  }
  const rows = await firstValueFrom(
    erpnext.list<{ name: string }>('Item', {
      fields: ['name'],
      filters: [
        ['name', 'in', unique],
        ['is_stock_item', '=', 1],
      ],
      limit: 0,
    }),
  );
  return new Set(rows.map((r) => r.name));
}
