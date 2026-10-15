import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from '../erpnext/erpnext-client';

export interface ProjectOption {
  id: string;
  name: string;
}

/** The company's open projects, for tasks that can be booked to one (expenses, supplying a project). */
@Injectable({ providedIn: 'root' })
export class ProjectDirectoryService {
  private readonly erpnext = inject(ErpnextClient);

  async open(company: string): Promise<ProjectOption[]> {
    const rows = await this.erpnext.listAll<{ name: string; project_name: string }>('Project', {
      fields: ['name', 'project_name'],
      filters: [
        ['company', '=', company],
        ['status', '=', 'Open'],
      ],
      orderBy: 'project_name asc, name asc',
    });
    return rows.map((r) => ({ id: r.name, name: r.project_name || r.name }));
  }
}
