import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../../../core/erpnext/erpnext-client';
import { SiteBalance, SiteRequest } from './project.models';
import { ProjectsApiService } from './projects-api.service';
import { SupplyApiService, round, sameEntry } from './supply-api.service';

/** A project's materials at site: their balance, recording use, and returning what wasn't used. */
@Injectable({ providedIn: 'root' })
export class SiteApiService {
  private readonly erpnext = inject(ErpnextClient);
  private readonly projects = inject(ProjectsApiService);
  private readonly supply = inject(SupplyApiService);

  /** Null before anything was ever delivered to a project (there is no site warehouse yet). */
  async balance(project: string, item: string, company: string): Promise<SiteBalance | null> {
    const site = await this.projects.findSiteWarehouse(company);
    if (!site) {
      return null;
    }
    const [rows, details, atSite, pendingOrders, warehouses] = await Promise.all([
      firstValueFrom(
        this.erpnext.list<{
          project: string | null;
          qty: number;
          s: string | null;
          t: string | null;
        }>('Stock Entry', {
          fields: [
            'items.project as project',
            'items.transfer_qty as qty',
            'items.s_warehouse as s',
            'items.t_warehouse as t',
          ],
          filters: [
            ['Stock Entry Detail', 'project', '=', project],
            ['Stock Entry Detail', 'item_code', '=', item],
            ['docstatus', '=', 1],
          ],
          limit: 0,
        }),
      ),
      this.supply.item(item),
      this.supply.siteStock(site, project, item),
      this.supply.pendingOrders(project, item),
      this.supply.warehouseStock(company, item),
    ]);
    let delivered = 0;
    let consumed = 0;
    let returned = 0;
    const sources = new Map<string, number>();
    const returnedTo: Record<string, number> = {};
    for (const r of rows.filter((r) => r.project === project)) {
      if (r.t === site) {
        delivered += r.qty;
        if (r.s) {
          sources.set(r.s, (sources.get(r.s) ?? 0) + r.qty);
        }
      } else if (r.s === site) {
        if (r.t) {
          returned += r.qty;
          returnedTo[r.t] = round((returnedTo[r.t] ?? 0) + r.qty);
        } else {
          consumed += r.qty;
        }
      }
    }
    const own = new Set(warehouses.map((w) => w.warehouse));
    const [mostUsed] = [...sources.entries()]
      .filter(([w]) => own.has(w))
      .sort((a, b) => b[1] - a[1]);
    return {
      item,
      itemName: details.itemName,
      uom: details.uom,
      site,
      delivered: round(delivered),
      consumed: round(consumed),
      returned: round(returned),
      returnedTo,
      atSite,
      pendingOrders,
      warehouses,
      returnTo: mostUsed?.[0] ?? warehouses[0]?.warehouse ?? null,
    };
  }

  /**
   * Posts the use (a Material Issue from the site) or the return (a Material Transfer from the site to a
   * warehouse), booked to the project. A timeout throws UnresolvedError; look it up with find() instead.
   */
  post(
    request: SiteRequest,
    draft: string | null,
    onInserted: (draft: string) => void = () => undefined,
  ): Promise<string> {
    return this.supply.postEntry(this.entryDoc(request), draft, onInserted, (entry) =>
      sameEntry(entry, request.item, request.site, request.to, request.qty),
    );
  }

  find(reference: string) {
    return this.supply.find(reference);
  }

  discard(draft: string): Promise<void> {
    return this.supply.discard(draft);
  }

  private entryDoc(request: SiteRequest): Record<string, unknown> {
    const use = request.to === null;
    const type = use ? 'Material Issue' : 'Material Transfer';
    return {
      doctype: 'Stock Entry',
      stock_entry_type: type,
      purpose: type,
      company: request.company,
      project: request.project,
      from_warehouse: request.site,
      ...(use ? {} : { to_warehouse: request.to }),
      // No posting_date: ERPNext uses the site's own "today", not the device's.
      remarks: `Madar ${use ? 'site use' : 'site return'} ${request.reference}`,
      items: [
        {
          item_code: request.item,
          qty: request.qty,
          uom: request.uom,
          stock_uom: request.uom,
          conversion_factor: 1,
          s_warehouse: request.site,
          ...(use ? {} : { t_warehouse: request.to }),
          project: request.project,
        },
      ],
    };
  }
}
