import { Injectable, computed, inject, signal } from '@angular/core';
import { BusinessService } from '../../../core/business/business.service';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { parseNumber } from '../../../core/format/number';
import {
  WarehouseDirectoryService,
  WarehouseOption,
} from '../../../core/stock/warehouse-directory.service';
import { PurchaseApiService } from './purchase-api.service';
import { OrderDetail, OrderLineDetail, ReceiptRequest, receivable } from './purchase.models';

export type ReceiptState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type ReceiptFailure = 'permission' | 'offline' | 'changed' | 'error';

// Rounded so 1 − 0.9 reads 0.1, not 0.09999999999999998.
export const remainingQty = (line: OrderLineDetail) =>
  Math.max(Math.round((line.qty - line.receivedQty) * 1e6) / 1e6, 0);

/** State of one "Receive items" task for a purchase order, from the quantities to the posted receipt. */
@Injectable({ providedIn: 'root' })
export class ReceiptStore {
  private readonly api = inject(PurchaseApiService);
  private readonly business = inject(BusinessService);
  private readonly warehouseDirectory = inject(WarehouseDirectoryService);

  readonly reference = signal(newReference('REC'));
  /** The order being received, by name; set before it has loaded. */
  readonly orderName = signal<string | null>(null);
  /** The order as it stood before this receipt. */
  readonly order = signal<OrderDetail | null>(null);
  readonly warehouses = signal<WarehouseOption[]>([]);
  readonly warehouse = signal<string | null>(null);
  /** What the user typed for each order row still to receive. */
  readonly qtyInputs = signal<Record<string, string>>({});
  readonly draft = signal<string | null>(null);
  readonly state = signal<ReceiptState>('idle');
  readonly failure = signal<ReceiptFailure | null>(null);
  /** The posted receipt's name. */
  readonly result = signal<string | null>(null);
  /** The done step has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  /** The request as confirmed, so the done and checking steps describe what was sent. */
  readonly sent = signal<ReceiptRequest | null>(null);

  /** The order's rows that still have something to receive. */
  readonly openLines = computed(() => {
    const order = this.order();
    return order && receivable(order.progress)
      ? order.lines.filter((l) => remainingQty(l) > 0)
      : [];
  });
  readonly quantities = computed(() =>
    Object.fromEntries(
      this.openLines().map((l) => [l.row, parseNumber(this.qtyInputs()[l.row] ?? '')]),
    ),
  );
  /** Each quantity is a number from zero up to what is still open on its row. */
  readonly qtyValid = computed(() =>
    this.openLines().every((l) => {
      const qty = this.quantities()[l.row];
      return Number.isFinite(qty) && qty >= 0 && qty <= remainingQty(l);
    }),
  );
  readonly receivingNow = computed(() =>
    this.openLines().reduce((sum, l) => sum + (this.quantities()[l.row] || 0), 0),
  );
  readonly ready = computed(
    () =>
      !!this.order() &&
      !!this.warehouse() &&
      this.qtyValid() &&
      this.receivingNow() > 0 &&
      this.state() !== 'confirming',
  );
  /** A confirmation is running or its result is still open; leaving keeps the receipt. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  start(order: string): void {
    const draft = this.draft();
    // Only a draft a failed or unresolved confirmation left behind; a posted receipt stays.
    if (draft && this.state() !== 'confirmed' && !this.busy()) {
      void this.api.discardReceipt(draft).catch(() => undefined);
    }
    this.reference.set(newReference('REC'));
    this.orderName.set(order);
    this.order.set(null);
    this.warehouse.set(null);
    this.qtyInputs.set({});
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen receipt; else start over. */
  resume(order: string): void {
    const keep = this.busy() || (this.state() === 'confirmed' && !this.resultShown());
    if (!keep) {
      this.start(order);
    }
  }

  /** Loads the order and the warehouses, and suggests receiving everything still open. */
  async load(): Promise<void> {
    const name = this.orderName();
    const business = await this.business.ensure();
    if (!name || !business) {
      throw new Error('No order or business to receive into');
    }
    const reference = this.reference();
    const [order, warehouses] = await Promise.all([
      this.api.order(name),
      this.warehouseDirectory.list(business.name),
    ]);
    if (this.reference() !== reference) {
      return;
    }
    this.order.set(order);
    this.warehouses.set(warehouses);
    const expected = order.lines.find((l) => l.warehouse)?.warehouse;
    this.warehouse.set(warehouses.find((w) => w.id === expected)?.id ?? warehouses[0]?.id ?? null);
    this.qtyInputs.set(
      Object.fromEntries(
        order.lines.filter((l) => remainingQty(l) > 0).map((l) => [l.row, String(remainingQty(l))]),
      ),
    );
  }

  setWarehouse(warehouse: string | null): void {
    this.clearFailure();
    this.warehouse.set(warehouse);
  }

  setQty(row: string, input: string): void {
    this.clearFailure();
    this.qtyInputs.update((inputs) => ({ ...inputs, [row]: input }));
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not post the receipt twice.
    if (this.busy()) {
      return;
    }
    const request = this.request();
    if (!request) {
      return;
    }
    this.state.set('confirming');
    this.failure.set(null);
    this.sent.set(request);
    const current = () => this.reference() === request.reference;
    try {
      const receipt = await this.api.receive(request, this.draft(), (name) => {
        if (current()) {
          this.draft.set(name);
        }
      });
      if (current()) {
        this.finish(receipt);
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** After an unresolved confirmation: found shows the receipt, a draft or nothing returns to the form. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    // Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was posted.
    if (this.state() !== 'unresolved') {
      return 'pending';
    }
    const reference = this.reference();
    const current = () => this.reference() === reference;
    this.state.set('checking');
    try {
      const found = await this.api.findReceipt(reference);
      if (!current()) {
        return 'pending';
      }
      if (found === 'not-found' || 'draft' in found) {
        if (found !== 'not-found') {
          this.draft.set(found.draft);
        }
        this.state.set('idle');
        return 'not-found';
      }
      this.finish(found.receipt);
      return 'found';
    } catch {
      if (current()) {
        this.state.set('unresolved');
      }
      return 'pending';
    }
  }

  private finish(receipt: string): void {
    this.result.set(receipt);
    this.state.set('confirmed');
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof PostedEarlierError) {
      // The earlier receipt stands in ERPNext; the order has moved on, so its quantities must be reloaded.
      this.draft.set(null);
      this.reference.set(newReference('REC'));
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
          : 'error',
    );
    this.state.set('failed');
  }

  private clearFailure(): void {
    if (this.state() === 'failed') {
      this.state.set('idle');
      this.failure.set(null);
    }
  }

  private request(): ReceiptRequest | null {
    const order = this.order();
    const warehouse = this.warehouse();
    if (!order || !warehouse || !this.ready()) {
      return null;
    }
    return {
      reference: this.reference(),
      order: order.name,
      warehouse,
      lines: this.openLines()
        .map((l) => ({ row: l.row, qty: this.quantities()[l.row] }))
        .filter((l) => l.qty > 0),
    };
  }
}
