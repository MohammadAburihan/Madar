import { Injectable, computed, inject, signal } from '@angular/core';
import { BusinessService } from '../../../core/business/business.service';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { parseNumber } from '../../../core/format/number';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import { InventoryApiService, NoValuationError, StockMovedError } from './inventory-api.service';
import {
  AdjustKind,
  AdjustRequest,
  AdjustResult,
  DamageType,
  StockItem,
  WarehouseInfo,
  adjustChange,
  totalStock,
} from './inventory.models';

export type AdjustState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type AdjustFailure =
  'permission' | 'offline' | 'stock' | 'moved' | 'valuation' | 'changed' | 'error';

const PREFIX: Record<AdjustKind, string> = { count: 'CNT', damage: 'DMG' };

/** State of one stock count or damage write-off, from choosing the item to the posted adjustment. */
export abstract class AdjustStore {
  abstract readonly kind: AdjustKind;
  private readonly api = inject(InventoryApiService);
  private readonly business = inject(BusinessService);

  readonly reference = signal('');
  readonly warehouses = signal<WarehouseInfo[]>([]);
  readonly item = signal<StockItem | null>(null);
  readonly warehouse = signal<string | null>(null);
  readonly qtyInput = signal('');
  readonly damageType = signal<DamageType>('damaged');
  readonly reason = signal('');
  readonly draft = signal<string | null>(null);
  readonly state = signal<AdjustState>('idle');
  readonly failure = signal<AdjustFailure | null>(null);
  readonly result = signal<AdjustResult | null>(null);
  /** The done step has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  /** The request as confirmed, so the done and checking steps describe what was sent. */
  readonly sent = signal<AdjustRequest | null>(null);

  readonly qty = computed(() => parseNumber(this.qtyInput()));
  /** What the chosen location holds now, as last read. */
  readonly onHand = computed(() => {
    const item = this.item();
    const warehouse = this.warehouse();
    return item && warehouse ? (item.stock[warehouse] ?? 0) : 0;
  });
  readonly total = computed(() => (this.item() ? totalStock(this.item()!) : 0));
  /** Whole units: a count of zero or more, a write-off above zero and no more than the location holds. */
  readonly qtyValid = computed(() => {
    const qty = this.qty();
    if (!this.qtyInput().trim() || !Number.isInteger(qty)) {
      return false;
    }
    return this.kind === 'count' ? qty >= 0 : qty > 0 && qty <= this.onHand();
  });
  /** What posting changes at the location; a count that matches changes nothing. */
  readonly change = computed(() =>
    this.qtyValid()
      ? adjustChange({ kind: this.kind, qty: this.qty(), systemQty: this.onHand() })
      : 0,
  );
  readonly ready = computed(
    () =>
      !!this.item() &&
      !!this.warehouse() &&
      this.qtyValid() &&
      this.change() !== 0 &&
      !!this.reason().trim() &&
      this.state() !== 'confirming',
  );
  /** A confirmation is running or its result is still open; leaving keeps the adjustment. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  constructor() {
    inject(OpenTasksService).register(this.busy);
  }

  start(): void {
    const draft = this.draft();
    if (draft && this.state() !== 'confirmed' && !this.busy()) {
      void this.api.discard(draft).catch(() => undefined);
    }
    this.reference.set(newReference(PREFIX[this.kind]));
    this.item.set(null);
    this.warehouse.set(null);
    this.qtyInput.set('');
    this.damageType.set('damaged');
    this.reason.set('');
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen adjustment; else start over. */
  resume(): void {
    if (!this.busy() && this.state() !== 'confirmed') {
      this.start();
    }
  }

  async loadWarehouses(): Promise<void> {
    const business = await this.business.ensure();
    if (business) {
      this.warehouses.set(await this.api.movableWarehouses(business.name));
    }
  }

  searchItems(term: string): Promise<StockItem[]> {
    return this.api.searchItems(
      term,
      this.warehouses().map((w) => w.id),
    );
  }

  /** Picks the item; the location defaults to `warehouse` when given, else where it has the most stock. */
  selectItem(item: StockItem, warehouse?: string | null): void {
    this.clearFailure();
    this.item.set(item);
    const ids = this.warehouses().map((w) => w.id);
    const byStock = [...ids].sort((a, b) => (item.stock[b] ?? 0) - (item.stock[a] ?? 0));
    this.warehouse.set(warehouse && ids.includes(warehouse) ? warehouse : (byStock[0] ?? null));
    this.qtyInput.set('');
  }

  /** Loads a deep-linked item by its exact code. */
  async openItem(code: string, warehouse?: string | null): Promise<void> {
    const item = await this.api.item(
      code,
      this.warehouses().map((w) => w.id),
    );
    if (item) {
      this.selectItem(item, warehouse);
    }
  }

  setWarehouse(warehouse: string | null): void {
    this.clearFailure();
    this.warehouse.set(warehouse);
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not post twice.
    if (this.busy()) {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    const request = await this.request();
    if (!request) {
      this.state.set('idle');
      return;
    }
    this.sent.set(request);
    const current = () => this.reference() === request.reference;
    try {
      const result = await this.api.adjust(request, this.draft(), (name) => {
        if (current()) {
          this.draft.set(name);
        }
      });
      if (current()) {
        this.finish(result);
      }
    } catch (error) {
      if (!current()) {
        return;
      }
      if (error instanceof UnresolvedError) {
        this.state.set('unresolved');
        return;
      }
      if (error instanceof StockMovedError) {
        // Stock moved since it was read: show the new quantity so the count is checked against it.
        const item = this.item();
        const warehouse = this.warehouse();
        if (item && warehouse) {
          this.item.set({ ...item, stock: { ...item.stock, [warehouse]: error.current } });
        }
        this.failure.set('moved');
        this.state.set('failed');
        return;
      }
      if (error instanceof NoValuationError) {
        this.failure.set('valuation');
        this.state.set('failed');
        return;
      }
      if (error instanceof PostedEarlierError) {
        this.draft.set(null);
        this.reference.set(newReference(PREFIX[this.kind]));
        this.failure.set('changed');
        this.state.set('failed');
        return;
      }
      const erpnextError = ErpnextError.from(error);
      if (erpnextError.excType === 'NegativeStockError') {
        void this.refreshItem();
      }
      this.failure.set(
        erpnextError.kind === 'forbidden'
          ? 'permission'
          : erpnextError.kind === 'offline'
            ? 'offline'
            : erpnextError.excType === 'NegativeStockError'
              ? 'stock'
              : 'error',
      );
      this.state.set('failed');
    }
  }

  /** After an unresolved confirmation: found shows the result, a draft or nothing returns to review. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    const request = this.sent();
    if (!request) {
      return 'not-found';
    }
    // Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was posted.
    if (this.state() !== 'unresolved') {
      return 'pending';
    }
    this.state.set('checking');
    try {
      const found = await this.api.findAdjustment(request);
      if (found === 'not-found' || 'draft' in found) {
        if (found !== 'not-found') {
          this.draft.set(found.draft);
        }
        this.state.set('idle');
        return 'not-found';
      }
      this.finish(found);
      return 'found';
    } catch {
      this.state.set('unresolved');
      return 'pending';
    }
  }

  /** Reads the item's balances again, so the form checks the quantity against what the location holds now. */
  private async refreshItem(): Promise<void> {
    const item = this.item();
    if (!item) {
      return;
    }
    const fresh = await this.api
      .item(
        item.code,
        this.warehouses().map((w) => w.id),
      )
      .catch(() => null);
    if (fresh && this.item()?.code === fresh.code) {
      this.item.set(fresh);
    }
  }

  private finish(result: AdjustResult): void {
    this.result.set(result);
    this.state.set('confirmed');
  }

  private clearFailure(): void {
    if (this.state() === 'failed') {
      this.state.set('idle');
      this.failure.set(null);
    }
  }

  private async request(): Promise<AdjustRequest | null> {
    const business = await this.business.ensure();
    const item = this.item();
    const warehouse = this.warehouse();
    if (
      !business ||
      !item ||
      !warehouse ||
      !this.qtyValid() ||
      this.change() === 0 ||
      !this.reason().trim()
    ) {
      return null;
    }
    return {
      kind: this.kind,
      reference: this.reference(),
      company: business.name,
      item: item.code,
      uom: item.uom,
      warehouse,
      systemQty: this.onHand(),
      qty: this.qty(),
      damageType: this.kind === 'damage' ? this.damageType() : null,
      reason: this.reason().trim(),
    };
  }
}

@Injectable({ providedIn: 'root' })
export class CountStore extends AdjustStore {
  readonly kind = 'count' as const;
}

@Injectable({ providedIn: 'root' })
export class DamageStore extends AdjustStore {
  readonly kind = 'damage' as const;
}
