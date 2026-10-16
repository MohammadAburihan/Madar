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
import { ReturnChangedError, SalesReturnApiService } from './sales-return-api.service';
import {
  AS_SOLD,
  ReturnLine,
  ReturnRequest,
  ReturnResult,
  ReturnSource,
  creditFor,
} from './sales-return.models';

export type ReturnState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type ReturnFailure = 'permission' | 'offline' | 'changed' | 'error';

/** State of one "Return from sale" task, from the quantities to the posted credit note. */
@Injectable({ providedIn: 'root' })
export class SalesReturnStore {
  private readonly api = inject(SalesReturnApiService);
  private readonly business = inject(BusinessService);
  private readonly warehouseDirectory = inject(WarehouseDirectoryService);
  /** Drafts failed tries left, by invoice: selling roles can't delete them, so each is rebuilt on the next try. */
  private readonly leftDrafts = new Map<string, string>();

  readonly reference = signal(newReference('RET'));
  /** The invoice being returned against, by name; set before it has loaded. */
  readonly invoiceName = signal<string | null>(null);
  /** The invoice as it stood before this return. */
  readonly source = signal<ReturnSource | null>(null);
  readonly warehouses = signal<WarehouseOption[]>([]);
  readonly warehouse = signal<string | null>(null);
  readonly reason = signal('');
  /** What the user typed for each row that still has something to return. */
  readonly qtyInputs = signal<Record<string, string>>({});
  readonly draft = signal<string | null>(null);
  readonly state = signal<ReturnState>('idle');
  readonly failure = signal<ReturnFailure | null>(null);
  readonly result = signal<ReturnResult | null>(null);
  /** The done step has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  /** The request as confirmed, so the done and checking steps describe what was sent. */
  readonly sent = signal<ReturnRequest | null>(null);

  readonly openLines = computed(() => this.source()?.lines.filter((l) => l.returnable > 0) ?? []);
  readonly quantities = computed(() =>
    Object.fromEntries(
      this.openLines().map((l) => [l.row, parseNumber(this.qtyInputs()[l.row] ?? '')]),
    ),
  );
  readonly credit = computed(() => creditFor(this.openLines(), this.quantities()));
  /** Each quantity is a number from zero up to what is left to return on its row. */
  readonly qtyValid = computed(() => this.openLines().every((l) => this.qtyOk(l)));
  readonly returningNow = computed(() =>
    this.openLines().reduce((sum, l) => sum + (this.quantities()[l.row] || 0), 0),
  );
  /** Goods go back to a warehouse only when the sale took them from one. */
  readonly needsWarehouse = computed(() => !!this.source()?.movesStock);
  readonly ready = computed(
    () =>
      !!this.source() &&
      (!this.needsWarehouse() || this.warehouse() !== null) &&
      this.qtyValid() &&
      this.returningNow() > 0 &&
      // An earlier return went through elsewhere: the invoice must be reloaded first.
      this.failure() !== 'changed' &&
      this.state() !== 'confirming',
  );
  /** A confirmation is running or its result is still open; leaving keeps the return. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  qtyOk(line: ReturnLine): boolean {
    const qty = this.quantities()[line.row];
    return Number.isFinite(qty) && qty >= 0 && qty <= line.returnable + 1e-9;
  }

  start(invoice: string): void {
    this.reference.set(newReference('RET'));
    this.invoiceName.set(invoice);
    this.source.set(null);
    this.warehouse.set(null);
    this.reason.set('');
    this.qtyInputs.set({});
    this.draft.set(this.leftDrafts.get(invoice) ?? null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen return; else start over. */
  resume(invoice: string): void {
    const keep = this.busy() || (this.state() === 'confirmed' && !this.resultShown());
    if (!keep) {
      this.start(invoice);
    }
  }

  /** Loads the invoice and the warehouses; suggests returning one of the first row, to where it came from. */
  async load(): Promise<void> {
    const name = this.invoiceName();
    const business = await this.business.ensure();
    if (!name || !business) {
      throw new Error('No invoice or business to return against');
    }
    const reference = this.reference();
    const [source, warehouses] = await Promise.all([
      this.api.source(name, business.currency),
      this.warehouseDirectory.list(business.name),
    ]);
    if (this.reference() !== reference) {
      return;
    }
    this.source.set(source);
    this.warehouses.set(warehouses);
    // One warehouse the goods all came from is named; otherwise each row goes back where it was sold from.
    const from = new Set(source.lines.filter((l) => l.isStock).map((l) => l.warehouse));
    const only = from.size === 1 ? warehouses.find((w) => from.has(w.id)) : undefined;
    this.warehouse.set(source.movesStock ? (only?.id ?? AS_SOLD) : null);
    const open = source.lines.filter((l) => l.returnable > 0);
    this.qtyInputs.set(
      Object.fromEntries(
        open.map((l, i) => [l.row, i === 0 ? String(Math.min(1, l.returnable)) : '0']),
      ),
    );
  }

  setWarehouse(warehouse: string | null): void {
    this.clearFailure();
    this.warehouse.set(warehouse);
  }

  setReason(reason: string): void {
    this.reason.set(reason);
  }

  setQty(row: string, input: string): void {
    this.clearFailure();
    this.qtyInputs.update((inputs) => ({ ...inputs, [row]: input }));
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not post the return twice.
    if (this.busy() || !this.ready()) {
      return;
    }
    const source = this.source()!;
    this.state.set('confirming');
    this.failure.set(null);
    const reference = this.reference();
    const current = () => this.reference() === reference;
    try {
      const business = await this.business.ensure();
      const request: ReturnRequest = {
        reference,
        invoice: source.invoice,
        currency: business?.currency ?? '',
        warehouse: this.needsWarehouse() && this.warehouse() !== AS_SOLD ? this.warehouse() : null,
        reason: this.reason(),
        lines: this.openLines()
          .map((l) => ({ row: l.row, qty: this.quantities()[l.row] }))
          .filter((l) => l.qty > 0),
      };
      this.sent.set(request);
      const result = await this.api.confirm(request, this.draft(), (name) => {
        this.leftDrafts.set(source.invoice, name);
        if (current()) {
          this.draft.set(name);
        }
      });
      this.leftDrafts.delete(source.invoice);
      if (current()) {
        this.finish(result);
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** After an unresolved confirmation: found shows the return, a draft or nothing returns to the form. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    // Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was posted.
    const sent = this.sent();
    if (this.state() !== 'unresolved' || !sent) {
      return 'pending';
    }
    const reference = this.reference();
    const current = () => this.reference() === reference;
    this.state.set('checking');
    try {
      const found = await this.api.find(sent);
      if (!current()) {
        return 'pending';
      }
      if (found === 'not-found' || 'draft' in found) {
        if (found !== 'not-found') {
          this.leftDrafts.set(sent.invoice, found.draft);
          this.draft.set(found.draft);
        }
        this.state.set('idle');
        return 'not-found';
      }
      this.leftDrafts.delete(sent.invoice);
      this.finish(found.result);
      return 'found';
    } catch {
      if (current()) {
        this.state.set('unresolved');
      }
      return 'pending';
    }
  }

  private finish(result: ReturnResult): void {
    this.result.set(result);
    this.state.set('confirmed');
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof PostedEarlierError) {
      // The earlier return stands in ERPNext; the invoice has moved on, so it must be reloaded.
      this.draft.set(null);
      this.leftDrafts.delete(this.invoiceName() ?? '');
      this.reference.set(newReference('RET'));
      this.failure.set('changed');
      this.state.set('failed');
      return;
    }
    if (error instanceof ReturnChangedError) {
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
    // "Changed" stays until the invoice is reloaded: its returnable quantities are out of date.
    if (this.state() === 'failed' && this.failure() !== 'changed') {
      this.state.set('idle');
      this.failure.set(null);
    }
  }
}
