import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';

/** What the settings page reads from ERPNext beyond the active business. */
@Injectable({ providedIn: 'root' })
export class SettingsApiService {
  private readonly erpnext = inject(ErpnextClient);

  /** The currency's name ("Israeli New Shekel"), or null when it can't be read. */
  async currencyName(code: string): Promise<string | null> {
    const [row] = await firstValueFrom(
      this.erpnext.list<{ currency_name: string }>('Currency', {
        fields: ['currency_name'],
        filters: [['name', '=', code]],
        limit: 1,
      }),
    ).catch(() => []);
    return row?.currency_name || null;
  }
}
