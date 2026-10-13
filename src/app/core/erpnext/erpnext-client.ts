import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { RuntimeConfigService } from '../config/runtime-config';

/** Frappe wraps whitelisted method results in `{ message }`. */
interface MethodResponse<T> {
  message: T;
}

@Injectable({ providedIn: 'root' })
export class ErpnextClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  call<T>(method: string, params: Record<string, string> = {}): Observable<T> {
    return this.http
      .get<MethodResponse<T>>(`${this.config.erpnextUrl()}/api/method/${method}`, { params })
      .pipe(map((response) => response.message));
  }

  ping(): Observable<boolean> {
    return this.call<string>('frappe.ping').pipe(map((message) => message === 'pong'));
  }
}
