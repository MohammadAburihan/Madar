import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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

  async list(limit = 100): Promise<SupplierOption[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string; supplier_name: string; primary_address: string | null }>(
        'Supplier',
        {
          fields: ['name', 'supplier_name', 'primary_address'],
          filters: [['disabled', '=', 0]],
          orderBy: 'supplier_name asc',
          limit,
        },
      ),
    );
    return rows.map((r) => ({
      id: r.name,
      name: r.supplier_name,
      city: r.primary_address?.split(/<br\s*\/?>/i)[0]?.trim() || null,
    }));
  }
}
