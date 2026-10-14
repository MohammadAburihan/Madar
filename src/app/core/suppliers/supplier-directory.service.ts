import { Injectable, inject } from '@angular/core';
import { ErpnextClient } from '../erpnext/erpnext-client';

export interface SupplierOption {
  id: string;
  name: string;
  city: string | null;
}

/** Supplier lookup, shared by every task that starts by picking a supplier (purchases, supplier payments). */
@Injectable({ providedIn: 'root' })
export class SupplierDirectoryService {
  private readonly erpnext = inject(ErpnextClient);

  /** Every enabled supplier: the picker has no search, so a cut-off list would hide suppliers. */
  async list(): Promise<SupplierOption[]> {
    const rows = await this.erpnext.listAll<{
      name: string;
      supplier_name: string;
      primary_address: string | null;
    }>('Supplier', {
      fields: ['name', 'supplier_name', 'primary_address'],
      filters: [['disabled', '=', 0]],
      orderBy: 'supplier_name asc, name asc',
    });
    return rows.map((r) => ({
      id: r.name,
      name: r.supplier_name,
      city: r.primary_address?.split(/<br\s*\/?>/i)[0]?.trim() || null,
    }));
  }
}
