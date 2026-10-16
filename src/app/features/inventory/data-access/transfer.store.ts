import { Injectable, computed, inject, signal } from '@angular/core';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import { BusinessService } from '../../../core/business/business.service';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { parseNumber } from '../../../core/format/number';
import { InventoryApiService } from './inventory-api.service';
import {
  StockItem,
  TransferRequest,
  TransferResult,
  WarehouseInfo,
  totalStock,
} from './inventory.models';

export type TransferState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type TransferFailure = 'permission' | 'offline' | 'stock' | 'changed' | 'error';

/** State of one "Move stock" task, from choosing the item to the posted transfer. */
@Injectable({ providedIn: 'root' })
export class TransferStore {
  private readonly api = inject(InventoryApiService);
  private readonly business = inject(BusinessService);

  readonly reference = signal(newReference('TRF'));
  readonly warehouses = signal<WarehouseInfo[]>([]);
  readonly item = signal<StockItem | null>(null);
  readonly from = signal<string | null>(null);
  readonly to = signal<string | null>(null);
  readonly qtyInput = signal('');
  readonly draft = signal<string | null>(null);
  readonly state = signal<TransferState>('idle');
  readonly failure = signal<TransferFailure | null>(null);
  readonly result = signal<TransferResult | null>(null);
  /** The done step has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  /** The request as confirmed, so the done and checking steps describe what was sent. */
  readonly sent = signal<TransferRequest | null>(null);

  readonly qty = computed(() => parseNumber(this.qtyInput()));
  readonly available = computed(() => {
    const item = this.item();
    const from = this.from();
    return item && from ? (item.stock[from] ?? 0) : 0;
  });
  /** Whole units only, more than zero, and no more than the source warehouse holds. */
  readonly qtyValid = computed(
    () => Number.isInteger(this.qty()) && this.qty() > 0 && this.qty() <= this.available(),
  );
  readonly total = computed(() => (this.item() ? totalStock(this.item()!) : 0));
  readonly ready = computed(
    () =>
      !!this.item() &&
      !!this.from() &&
      !!this.to() &&
      this.from() !== this.to() &&
      this.qtyValid() &&
      this.state() !== 'confirming',
  );
  /** A confirmation is running or its result is still open; leaving keeps the transfer. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  constructor() {
    inject(OpenTasksService).register(this.busy);
  }

  start(): void {
    const draft = this.draft();
    if (draft && this.state() !== 'confirmed' && !this.busy()) {
      void this.api.discard(draft).catch(() => undefined);
    }
    this.reference.set(newReference('TRF'));
    this.item.set(null);
    this.from.set(null);
    this.to.set(null);
    this.qtyInput.set('');
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen transfer; else start over. */
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

  /**
   * Picks the item: the source defaults to where it has the most stock, the destination to the next
   * location that already holds it (where stock usually goes), else the first other location.
   */
  selectItem(item: StockItem): void {
    this.clearFailure();
    this.item.set(item);
    const byStock = this.warehouses()
      .map((w) => w.id)
      .sort((a, b) => (item.stock[b] ?? 0) - (item.stock[a] ?? 0));
    const from = byStock[0] ?? null;
    this.from.set(from);
    this.to.set(byStock.find((id) => id !== from) ?? null);
    this.qtyInput.set('');
  }

  /** Loads a deep-linked item by its exact code. */
  async openItem(code: string): Promise<void> {
    const item = await this.api.item(
      code,
      this.warehouses().map((w) => w.id),
    );
    if (item) {
      this.selectItem(item);
    }
  }

  setFrom(warehouse: string | null): void {
    this.clearFailure();
    this.from.set(warehouse);
    if (warehouse && warehouse === this.to()) {
      this.to.set(this.warehouses().find((w) => w.id !== warehouse)?.id ?? null);
    }
  }

  setTo(warehouse: string | null): void {
    this.clearFailure();
    this.to.set(warehouse);
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not post the move twice.
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
      const result = await this.api.transfer(request, this.draft(), (name) => {
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
      if (error instanceof PostedEarlierError) {
        // The earlier version stands in ERPNext. Confirming again is a deliberate new document.
        this.draft.set(null);
        this.reference.set(newReference('TRF'));
        this.failure.set('changed');
        this.state.set('failed');
        return;
      }
      const erpnextError = ErpnextError.from(error);
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
      const found = await this.api.find(request);
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

  private finish(result: TransferResult): void {
    this.result.set(result);
    this.state.set('confirmed');
  }

  private clearFailure(): void {
    if (this.state() === 'failed') {
      this.state.set('idle');
      this.failure.set(null);
    }
  }

  private async request(): Promise<TransferRequest | null> {
    const business = await this.business.ensure();
    const item = this.item();
    const from = this.from();
    const to = this.to();
    if (!business || !item || !from || !to || from === to || !this.qtyValid()) {
      return null;
    }
    return {
      reference: this.reference(),
      company: business.name,
      item: item.code,
      uom: item.uom,
      qty: this.qty(),
      from,
      to,
    };
  }
}
