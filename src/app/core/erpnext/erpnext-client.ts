import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, firstValueFrom, map, throwError } from 'rxjs';
import { RuntimeConfigService } from '../config/runtime-config';
import { ErpnextError } from './erpnext-error';

/** Frappe wraps whitelisted method results in `{ message }`. */
interface MethodResponse<T> {
  message: T;
}

export type Filter = [string, string, unknown];

/** Frappe's own default page size; pass a larger limit explicitly when a query needs more rows. */
const DEFAULT_LIMIT = 20;
export type Field = string | Record<string, string>;

export interface ListQuery {
  fields: Field[];
  filters?: Filter[];
  orderBy?: string;
  groupBy?: string;
  limit?: number;
  limitStart?: number;
  parent?: string;
}

const PAGE_SIZE = 500;

@Injectable({ providedIn: 'root' })
export class ErpnextClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  get<T>(method: string, params: Record<string, string | number> = {}): Observable<T> {
    return this.http
      .get<MethodResponse<T>>(this.url(method), {
        params: new HttpParams({ fromObject: params }),
        withCredentials: true,
      })
      .pipe(
        map((response) => response.message),
        catchError((error) => throwError(() => ErpnextError.from(error))),
      );
  }

  post<T>(method: string, body: Record<string, unknown>): Observable<T> {
    return this.http
      .post<MethodResponse<T>>(this.url(method), body, { withCredentials: true })
      .pipe(
        map((response) => response.message),
        catchError((error) => throwError(() => ErpnextError.from(error))),
      );
  }

  list<T>(doctype: string, query: ListQuery): Observable<T[]> {
    const params: Record<string, string | number> = {
      doctype,
      fields: JSON.stringify(query.fields),
      filters: JSON.stringify(query.filters ?? []),
      limit_page_length: query.limit ?? DEFAULT_LIMIT,
    };
    if (query.orderBy) {
      params['order_by'] = query.orderBy;
    }
    if (query.parent) {
      params['parent'] = query.parent;
    }
    if (query.groupBy) {
      params['group_by'] = query.groupBy;
    }
    if (query.limitStart) {
      params['limit_start'] = query.limitStart;
    }
    return this.get<T[]>('frappe.client.get_list', params);
  }

  /** Every matching row, fetched page by page so no single response or URL grows unbounded. */
  async listAll<T>(doctype: string, query: Omit<ListQuery, 'limit' | 'limitStart'>): Promise<T[]> {
    const rows: T[] = [];
    for (let start = 0; ; start += PAGE_SIZE) {
      const page = await firstValueFrom(
        this.list<T>(doctype, { ...query, limit: PAGE_SIZE, limitStart: start }),
      );
      rows.push(...page);
      if (page.length < PAGE_SIZE) {
        return rows;
      }
    }
  }

  count(doctype: string, filters: Filter[] = []): Observable<number> {
    return this.get<number>('frappe.client.get_count', {
      doctype,
      filters: JSON.stringify(filters),
    });
  }

  doc<T>(doctype: string, name: string): Observable<T> {
    return this.get<T>('frappe.client.get', { doctype, name });
  }

  private url(method: string): string {
    return `${this.config.erpnextUrl()}/api/method/${method}`;
  }
}
