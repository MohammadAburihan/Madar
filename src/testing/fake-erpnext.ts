import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of } from 'rxjs';
import { ErpnextClient, ListQuery } from '../app/core/erpnext/erpnext-client';

export type Lister = (query: ListQuery) => unknown[] | Observable<unknown[]>;
export type Poster = (body: Record<string, unknown>) => Observable<unknown> | unknown;

/** A fake ErpnextClient answering list, post and doc calls from tables, recording every call. */
export function fakeErpnext(
  lists: Record<string, Lister> = {},
  posts: Record<string, Poster> = {},
  docs: Record<string, unknown | (() => Observable<unknown>)> = {},
  counts: Record<string, number | (() => Observable<number>)> = {},
) {
  const listCalls: { doctype: string; query: ListQuery }[] = [];
  const postCalls: { method: string; body: Record<string, unknown> }[] = [];
  const docCalls: string[] = [];
  const countCalls: { doctype: string; filters: unknown[] }[] = [];
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
    listAll: (doctype: string, query: ListQuery) => firstValueFrom(client.list(doctype, query)),
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
  return { listCalls, postCalls, docCalls, countCalls };
}
