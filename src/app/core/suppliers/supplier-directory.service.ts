import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient, Filter } from '../erpnext/erpnext-client';
import { Candidates, findSameSpelled } from '../util/fuzzy-match';

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

  /** Suppliers, disabled ones marked, whose names any spelling of `term` could match, for a duplicate check. */
  async spelledLike(
    term: string,
  ): Promise<Candidates<{ id: string; name: string; disabled: boolean }>> {
    return findSameSpelled(term, async (patterns, limit) => {
      const rows = await this.erpnext.listAll<{
        name: string;
        supplier_name: string;
        disabled: number;
      }>(
        'Supplier',
        {
          fields: ['name', 'supplier_name', 'disabled'],
          orFilters: patterns.map((pattern) => ['supplier_name', 'like', pattern] as Filter),
        },
        limit,
      );
      return rows.map((r) => ({ id: r.name, name: r.supplier_name, disabled: !!r.disabled }));
    });
  }

  /** Exact id or name matches, disabled ones marked, so a caller can say why it refuses. */
  async exact(term: string): Promise<(SupplierOption & { disabled: boolean })[]> {
    const text = term.trim();
    const rows = await firstValueFrom(
      this.erpnext.list<{
        name: string;
        supplier_name: string;
        primary_address: string | null;
        disabled: number;
      }>('Supplier', {
        fields: ['name', 'supplier_name', 'primary_address', 'disabled'],
        orFilters: [
          ['name', '=', text],
          ['supplier_name', '=', text],
        ],
        limit: 5,
      }),
    );
    return rows.map((r) => ({
      id: r.name,
      name: r.supplier_name,
      city: r.primary_address?.split(/<br\s*\/?>/i)[0]?.trim() || null,
      disabled: !!r.disabled,
    }));
  }
}
