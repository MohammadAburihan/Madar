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
import { SalesOrderApiService } from './sales-order-api.service';
import {
  DeliveryRequest,
  SalesOrderDetail,
  SalesOrderLine,
  orderOpen,
  toDeliver,
} from './sales-order.models';

export type DeliveryState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type DeliveryFailure = 'permission' | 'offline' | 'changed' | 'stock' | 'error';

/** State of one "Deliver order" task, from the quantities to the posted delivery note. */
@Injectable({ providedIn: 'root' })
export class DeliveryStore {
  private readonly api = inject(SalesOrderApiService);
  private readonly business = inject(BusinessService);
  private readonly warehouseDirectory = inject(WarehouseDirectoryService);

  readonly reference = signal(newReference('DEL'));
  /** The order being delivered, by name; set before it has loaded. */
  readonly orderName = signal<string | null>(null);
  /** The order as it stood before this delivery. */
  readonly order = signal<SalesOrderDetail | null>(null);
  readonly warehouses = signal<WarehouseOption[]>([]);
  readonly warehouse = signal<string | null>(null);
  /** Item code → warehouse → quantity in stock units. */
  readonly stock = signal<Record<string, Record<string, number>>>({});
  /** What the user typed for each order row still to deliver. */
  readonly qtyInputs = signal<Record<string, string>>({});
  readonly draft = signal<string | null>(null);
  readonly state = signal<DeliveryState>('idle');
  readonly failure = signal<DeliveryFailure | null>(null);
  /** The posted delivery note's name. */
  readonly result = signal<string | null>(null);
  /** The done step has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  /** The request as confirmed, so the done and checking steps describe what was sent. */
  readonly sent = signal<DeliveryRequest | null>(null);

  /** Rows with something still to deliver: goods, then services whose work can be marked done. */
  readonly openLines = computed(() => {
    const order = this.order();
    return order && orderOpen(order) ? order.lines.filter((l) => toDeliver(l) > 0) : [];
  });
  readonly quantities = computed(() =>
    Object.fromEntries(
      this.openLines().map((l) => [l.row, parseNumber(this.qtyInputs()[l.row] ?? '')]),
    ),
  );
  /** In the row's unit, in the chosen warehouse; services have no stock to run out of. */
  readonly available = (line: SalesOrderLine): number | null => {
    if (!line.isStock) {
      return null;
    }
    const warehouse = this.warehouse();
    const inStock = warehouse ? (this.stock()[line.code]?.[warehouse] ?? 0) : 0;
    return Math.floor((inStock / line.conversionFactor) * 1e6) / 1e6;
  };
  /** Each quantity is a number from zero up to what is still open on its row and, for goods, in stock. */
  readonly qtyValid = computed(() => this.openLines().every((l) => !this.qtyError(l)));
  readonly deliveringNow = computed(() =>
    this.openLines().reduce((sum, l) => sum + (this.quantities()[l.row] || 0), 0),
  );
  readonly ready = computed(
    () =>
      !!this.order() &&
      !!this.warehouse() &&
      this.qtyValid() &&
      this.deliveringNow() > 0 &&
      // An earlier delivery went through: the order must be reloaded before anything else is delivered.
      this.failure() !== 'changed' &&
      this.state() !== 'confirming',
  );
  /** A confirmation is running or its result is still open; leaving keeps the delivery. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  /** Why the row's quantity can't be delivered, or null when it can. */
  qtyError(line: SalesOrderLine): 'invalid' | 'tooMany' | 'noStock' | null {
    const qty = this.quantities()[line.row];
    if (!Number.isFinite(qty) || qty < 0) {
      return 'invalid';
    }
    if (qty > toDeliver(line) + 1e-9) {
      return 'tooMany';
    }
    const available = this.available(line);
    return available !== null && qty > available + 1e-9 ? 'noStock' : null;
  }

  start(order: string): void {
    const draft = this.draft();
    // Only a draft a failed or unresolved confirmation left behind; a posted delivery stays.
    if (draft && this.state() !== 'confirmed' && !this.busy()) {
      void this.api.discardDelivery(draft).catch(() => undefined);
    }
    this.reference.set(newReference('DEL'));
    this.orderName.set(order);
    this.order.set(null);
    this.warehouse.set(null);
    this.stock.set({});
    this.qtyInputs.set({});
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen delivery; else start over. */
  resume(order: string): void {
    const keep = this.busy() || (this.state() === 'confirmed' && !this.resultShown());
    if (!keep) {
      this.start(order);
    }
  }

  /** Loads the order, the warehouses and their stock; suggests delivering all goods still open. */
  async load(): Promise<void> {
    const name = this.orderName();
    const business = await this.business.ensure();
    if (!name || !business) {
      throw new Error('No order or business to deliver from');
    }
    const reference = this.reference();
    const [order, warehouses] = await Promise.all([
      this.api.order(name),
      this.warehouseDirectory.list(business.name),
    ]);
    const goods = order.lines.filter((l) => l.isStock).map((l) => l.code);
    const stock = await this.api.stock(
      goods,
      warehouses.map((w) => w.id),
    );
    if (this.reference() !== reference) {
      return;
    }
    this.order.set(order);
    this.warehouses.set(warehouses);
    this.stock.set(stock);
    // The warehouse holding the most of the order's goods, else the first.
    const best = [...warehouses].sort(
      (a, b) =>
        goods.reduce((sum, c) => sum + (stock[c]?.[b.id] ?? 0), 0) -
        goods.reduce((sum, c) => sum + (stock[c]?.[a.id] ?? 0), 0),
    )[0];
    this.warehouse.set(best?.id ?? null);
    this.qtyInputs.set(
      Object.fromEntries(
        order.lines
          .filter((l) => toDeliver(l) > 0)
          .map((l) => [l.row, l.isStock ? String(toDeliver(l)) : '0']),
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
    // Set before the first await: a double tap must not post the delivery twice.
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
      const delivery = await this.api.deliver(request, this.draft(), (name) => {
        if (current()) {
          this.draft.set(name);
        }
      });
      if (current()) {
        this.finish(delivery);
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** After an unresolved confirmation: found shows the delivery, a draft or nothing returns to the form. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    // Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was posted.
    if (this.state() !== 'unresolved') {
      return 'pending';
    }
    const reference = this.reference();
    const current = () => this.reference() === reference;
    this.state.set('checking');
    try {
      const found = await this.api.findDelivery(reference);
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
      this.finish(found.delivery);
      return 'found';
    } catch {
      if (current()) {
        this.state.set('unresolved');
      }
      return 'pending';
    }
  }

  private finish(delivery: string): void {
    this.result.set(delivery);
    this.state.set('confirmed');
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof PostedEarlierError) {
      // The earlier delivery stands in ERPNext; the order has moved on, so its quantities must be reloaded.
      this.draft.set(null);
      this.reference.set(newReference('DEL'));
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

  private clearFailure(): void {
    // "Changed" stays until the order is reloaded: its open quantities are out of date.
    if (this.state() === 'failed' && this.failure() !== 'changed') {
      this.state.set('idle');
      this.failure.set(null);
    }
  }

  private request(): DeliveryRequest | null {
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
