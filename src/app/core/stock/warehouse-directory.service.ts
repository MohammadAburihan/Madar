import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';

export interface WarehouseOption {
  id: string;
  name: string;
}

/** The company's stock locations that goods can be put into: no groups, transit or disabled warehouses. */
@Injectable({ providedIn: 'root' })
export class WarehouseDirectoryService {
  private readonly erpnext = inject(ErpnextClient);

  async list(company: string): Promise<WarehouseOption[]> {
    const rows = await firstValueFrom(
      this.erpnext.list<{ name: string; warehouse_name: string }>('Warehouse', {
        fields: ['name', 'warehouse_name'],
        filters: [
          ['company', '=', company],
          ['is_group', '=', 0],
          ['disabled', '=', 0],
          ['warehouse_type', '!=', 'Transit'],
        ],
        orderBy: 'warehouse_name asc',
        limit: 0,
      }),
    );
    return rows.map((r) => ({ id: r.name, name: r.warehouse_name }));
  }
}
