import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';
import { ErpnextError } from '../erpnext/erpnext-error';

/**
 * Stock Entry Types by purpose. ERPNext's setup names its standard types in the site's language ("صرف مواد" on an
 * Arabic site), so a Stock Entry links to the type found by its English purpose, never to the purpose as a name.
 */
@Injectable({ providedIn: 'root' })
export class StockEntryTypesService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly names = new Map<string, Promise<string>>();

  name(purpose: string): Promise<string> {
    let name = this.names.get(purpose);
    if (!name) {
      name = firstValueFrom(
        this.erpnext.list<{ name: string }>('Stock Entry Type', {
          fields: ['name'],
          filters: [
            ['purpose', '=', purpose],
            ['is_standard', '=', 1],
          ],
          limit: 1,
        }),
      ).then(
        ([row]) => row?.name ?? purpose,
        (error: unknown) => {
          this.names.delete(purpose);
          // A role that can't read the types posts with the standard English name, as before.
          if (ErpnextError.from(error).kind === 'forbidden') {
            return purpose;
          }
          throw error;
        },
      );
      this.names.set(purpose, name);
    }
    return name;
  }

  /** The entry with its type set from its purpose. */
  async withType<T extends Record<string, unknown>>(doc: T): Promise<T> {
    return { ...doc, stock_entry_type: await this.name(String(doc['purpose'])) };
  }
}
