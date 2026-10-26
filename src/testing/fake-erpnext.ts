import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of } from 'rxjs';
import { ErpnextClient, ListQuery } from '../app/core/erpnext/erpnext-client';

export type Lister = (query: ListQuery) => unknown[] | Observable<unknown[]>;
export type Poster = (body: Record<string, unknown>) => Observable<unknown> | unknown;

/** A fake ErpnextClient answering list, get, post and doc calls from tables, recording every call. */
/** `get` methods are answered from `posts`, as both are whitelisted methods. */
export function fakeErpnext(
  lists: Record<string, Lister> = {},
  posts: Record<string, Poster> = {},
  docs: Record<string, unknown | (() => Observable<unknown>)> = {},
  counts: Record<string, number | (() => Observable<number>)> = {},
) {
  const listCalls: { doctype: string; query: ListQuery; maxRows?: number }[] = [];
  const postCalls: { method: string; body: Record<string, unknown> }[] = [];
  const docCalls: string[] = [];
  const countCalls: { doctype: string; filters: unknown[] }[] = [];
  const getCalls: { method: string; params: Record<string, unknown> }[] = [];
  const client = {
    list: (doctype: string, query: ListQuery) => {
      listCalls.push({ doctype, query });
      const result = lists[doctype]?.(query) ?? [];
      return result instanceof Observable ? result : of(result);
    },
    post: (method: string, body: Record<string, unknown>) => {
      postCalls.push({ method, body });
      const result = posts[method]?.(body);
      return result instanceof Observable ? result : of(result);
    },
    get: (method: string, params: Record<string, unknown> = {}) => {
      getCalls.push({ method, params });
      const result = posts[method]?.(params);
      return result instanceof Observable ? result : of(result);
    },
    postForBlob: (method: string, body: Record<string, unknown>) => client.post(method, body),
    listAll: async (doctype: string, query: ListQuery, maxRows = Infinity) => {
      const rows = await firstValueFrom(client.list(doctype, query));
      listCalls[listCalls.length - 1].maxRows = maxRows;
      return rows.slice(0, maxRows);
    },
    count: (doctype: string, filters: unknown[] = []) => {
      countCalls.push({ doctype, filters });
      const value = counts[doctype];
      return typeof value === 'function' ? value() : of(value ?? 0);
    },
    doc: (doctype: string, name: string) => {
      docCalls.push(`${doctype}/${name}`);
      const value = docs[`${doctype}/${name}`];
      return typeof value === 'function' ? (value as () => Observable<unknown>)() : of(value);
    },
  };
  TestBed.configureTestingModule({ providers: [{ provide: ErpnextClient, useValue: client }] });
  return { listCalls, postCalls, docCalls, countCalls, getCalls };
}
