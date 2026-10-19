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
import {
  InventoryApiService,
  NoOpeningAccountError,
  NoValuationError,
} from './inventory-api.service';
import {
  AddStockReason,
  AddStockRequest,
  AddStockResult,
  StockItem,
  WarehouseInfo,
} from './inventory.models';

export type AddStockState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type AddStockFailure =
  'permission' | 'offline' | 'valuation' | 'opening' | 'changed' | 'error';

export interface AddStockLine {
  item: StockItem;
  qtyInput: string;
  /** Empty takes the item's own cost; only roles that see costs type one. */
  costInput: string;
}

/** State of one "Add stock" task: stock the business had or made, brought in without a purchase. */
@Injectable({ providedIn: 'root' })
export class AddStockStore {
  private readonly api = inject(InventoryApiService);
  private readonly business = inject(BusinessService);

  readonly reference = signal(newReference('ADD'));
  readonly warehouses = signal<WarehouseInfo[]>([]);
  readonly warehouse = signal<string | null>(null);
  readonly reason = signal<AddStockReason>('opening');
  readonly lines = signal<AddStockLine[]>([]);
  readonly draft = signal<string | null>(null);
  readonly state = signal<AddStockState>('idle');
  readonly failure = signal<AddStockFailure | null>(null);
  /** The item a missing cost or a refusal was about. */
  readonly failedItem = signal<string | null>(null);
  readonly result = signal<AddStockResult | null>(null);
  /** The done step has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  /** The request as confirmed, so the done and checking steps describe what was sent. */
  readonly sent = signal<AddStockRequest | null>(null);

  /** Each line's quantity and cost as read, or NaN where they don't parse. */
  readonly parsed = computed(() =>
    this.lines().map((l) => ({
      qty: parseNumber(l.qtyInput),
      cost: l.costInput.trim() ? parseNumber(l.costInput) : null,
    })),
  );
  /** Whole units above zero, and a cost of zero or more where one is typed. */
  readonly linesValid = computed(
    () =>
      this.lines().length > 0 &&
      this.parsed().every(
        (p) => Number.isInteger(p.qty) && p.qty > 0 && (p.cost === null || p.cost >= 0),
      ),
  );
  readonly units = computed(() =>
    this.parsed().reduce((sum, p) => sum + (Number.isFinite(p.qty) ? p.qty : 0), 0),
  );
  readonly ready = computed(
    () => !!this.warehouse() && this.linesValid() && this.state() !== 'confirming',
  );
  /** A confirmation is running or its result is still open; leaving keeps the work. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  constructor() {
    inject(OpenTasksService).register(this.busy);
  }

  start(): void {
    const draft = this.draft();
    if (draft && this.state() !== 'confirmed' && !this.busy()) {
      void this.api.discard(draft).catch(() => undefined);
    }
    this.reference.set(newReference('ADD'));
    this.warehouse.set(null);
    this.reason.set('opening');
    this.lines.set([]);
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.failedItem.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen one; else start over. */
  resume(): void {
    if (!this.busy() && this.state() !== 'confirmed') {
      this.start();
    }
  }

  async loadWarehouses(): Promise<void> {
    const business = await this.business.ensure();
    if (business) {
      const warehouses = await this.api.movableWarehouses(business.name);
      this.warehouses.set(warehouses);
      if (!this.warehouse() && warehouses.length === 1) {
        this.warehouse.set(warehouses[0].id);
      }
    }
  }

  searchItems(term: string): Promise<StockItem[]> {
    return this.api.searchItems(
      term,
      this.warehouses().map((w) => w.id),
    );
  }

  /** Loads a deep-linked item by its exact code and adds it. */
  async openItem(code: string): Promise<boolean> {
    const item = await this.api.item(
      code,
      this.warehouses().map((w) => w.id),
    );
    if (item) {
      this.addItem(item);
    }
    return !!item;
  }

  /** Adds the item as a line, or puts focus back on its line when it's already there. */
  addItem(item: StockItem): void {
    this.clearFailure();
    if (!this.lines().some((l) => l.item.code === item.code)) {
      this.lines.update((lines) => [...lines, { item, qtyInput: '', costInput: '' }]);
    }
  }

  removeLine(code: string): void {
    this.clearFailure();
    this.lines.update((lines) => lines.filter((l) => l.item.code !== code));
  }

  setLine(code: string, change: Partial<Pick<AddStockLine, 'qtyInput' | 'costInput'>>): void {
    this.clearFailure();
    this.lines.update((lines) =>
      lines.map((l) => (l.item.code === code ? { ...l, ...change } : l)),
    );
  }

  setWarehouse(warehouse: string | null): void {
    this.clearFailure();
    this.warehouse.set(warehouse);
  }

  setReason(reason: AddStockReason): void {
    this.clearFailure();
    this.reason.set(reason);
  }

  /** `withCosts` false (roles that don't see costs) sends no cost: each item's own is used. */
  async confirm(withCosts: boolean): Promise<void> {
    // Set before the first await: a double tap must not post twice.
    if (this.busy()) {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    this.failedItem.set(null);
    const request = await this.request(withCosts);
    if (!request) {
      this.state.set('idle');
      return;
    }
    this.sent.set(request);
    const current = () => this.reference() === request.reference;
    try {
      const result = await this.api.addStock(request, this.draft(), (name) => {
        if (current()) {
          this.draft.set(name);
        }
      });
      if (current()) {
        this.result.set(result);
        this.state.set('confirmed');
      }
    } catch (error) {
      if (!current()) {
        return;
      }
      if (error instanceof UnresolvedError) {
        this.state.set('unresolved');
        return;
      }
      if (error instanceof NoValuationError) {
        this.failedItem.set(error.item);
        this.fail('valuation');
        return;
      }
      if (error instanceof NoOpeningAccountError) {
        this.fail('opening');
        return;
      }
      if (error instanceof PostedEarlierError) {
        this.draft.set(null);
        this.reference.set(newReference('ADD'));
        this.fail('changed');
        return;
      }
      const e = ErpnextError.from(error);
      this.fail(e.kind === 'forbidden' ? 'permission' : e.kind === 'offline' ? 'offline' : 'error');
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
      const found = await this.api.findAddStock(request.reference);
      if (found === 'not-found' || 'draft' in found) {
        if (found !== 'not-found') {
          this.draft.set(found.draft);
        }
        this.state.set('idle');
        return 'not-found';
      }
      this.result.set(found);
      this.state.set('confirmed');
      return 'found';
    } catch {
      this.state.set('unresolved');
      return 'pending';
    }
  }

  private fail(failure: AddStockFailure): void {
    this.failure.set(failure);
    this.state.set('failed');
  }

  private clearFailure(): void {
    if (this.state() === 'failed') {
      this.state.set('idle');
      this.failure.set(null);
      this.failedItem.set(null);
    }
  }

  private async request(withCosts: boolean): Promise<AddStockRequest | null> {
    const business = await this.business.ensure();
    const warehouse = this.warehouse();
    if (!business || !warehouse || !this.linesValid()) {
      return null;
    }
    const parsed = this.parsed();
    return {
      reference: this.reference(),
      company: business.name,
      warehouse,
      reason: this.reason(),
      lines: this.lines().map((l, i) => ({
        item: l.item.code,
        name: l.item.name,
        uom: l.item.uom,
        qty: parsed[i].qty,
        rate: withCosts && parsed[i].cost !== null ? Math.round(parsed[i].cost! * 100) / 100 : null,
      })),
    };
  }
}
