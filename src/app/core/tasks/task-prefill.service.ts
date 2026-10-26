import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { BusinessService } from '../business/business.service';
import { newReference } from '../erpnext/confirmation';

export interface PrefillLine {
  item_code: string;
  qty: number;
  rate?: number;
}

/** What each task is opened with: resolved ids, which the task checks again as it loads them. */
export interface PrefillPayloads {
  quick_sale: {
    customer?: string;
    walkIn?: boolean;
    /** A customer project the sale is billed to; it fixes the customer and may start with no lines. */
    project?: string;
    lines: PrefillLine[];
    warehouse?: string;
  };
  quotation: { customer: string; lines: PrefillLine[] };
  purchase_order: { supplier: string; lines: PrefillLine[] };
  collect_payment: { customer: string; amount?: number };
  stock_move: { item_code: string; qty: number; from_warehouse?: string; to_warehouse?: string };
  new_customer: { name: string; phone?: string; email?: string; address?: string };
  new_supplier: { name: string; phone?: string; email?: string };
  new_item: { name: string; kind: 'product' | 'service'; price?: number };
}

export type PrefillKind = keyof PrefillPayloads;

export type PrefillRequest = {
  [K in PrefillKind]: { kind: K; payload: PrefillPayloads[K] };
}[PrefillKind];

export const PREFILL_TTL_MS = 10 * 60 * 1000;

interface Pending {
  id: string;
  kind: PrefillKind;
  payload: unknown;
  createdAt: number;
  userId: string;
  company: string;
}

/** Hands an assistant proposal to the task that opens it: in memory, one per task, once, same user and business, under ten minutes. */
@Injectable({ providedIn: 'root' })
export class TaskPrefillService {
  private readonly session = inject(SessionService);
  private readonly business = inject(BusinessService);
  private readonly pending = new Map<PrefillKind, Pending>();

  constructor() {
    const owner = computed(
      () => `${this.session.user()?.id ?? ''}\n${this.business.active()?.name ?? ''}`,
    );
    effect(() => {
      owner();
      untracked(() => this.pending.clear());
    });
  }

  put(request: PrefillRequest): string | null {
    const userId = this.session.user()?.id;
    const company = this.business.active()?.name;
    if (!userId || !company) {
      return null;
    }
    const id = newReference('PF');
    this.pending.set(request.kind, {
      id,
      kind: request.kind,
      payload: request.payload,
      createdAt: Date.now(),
      userId,
      company,
    });
    return id;
  }

  take<K extends PrefillKind>(kind: K, id: string): PrefillPayloads[K] | null {
    const payload = this.peek(kind, id);
    this.drop(kind, id);
    return payload;
  }

  peek<K extends PrefillKind>(kind: K, id: string): PrefillPayloads[K] | null {
    const held = this.pending.get(kind);
    if (!held || held.id !== id) {
      return null;
    }
    const fresh = Date.now() - held.createdAt < PREFILL_TTL_MS;
    const mine =
      held.userId === this.session.user()?.id && held.company === this.business.active()?.name;
    return fresh && mine ? (held.payload as PrefillPayloads[K]) : null;
  }

  drop(kind: PrefillKind, id: string): void {
    if (this.pending.get(kind)?.id === id) {
      this.pending.delete(kind);
    }
  }
}
