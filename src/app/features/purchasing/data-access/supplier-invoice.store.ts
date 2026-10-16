import { Injectable, computed, inject, signal } from '@angular/core';
import { OpenTasksService } from '../../../core/tasks/open-tasks.service';
import {
  PostedEarlierError,
  UnresolvedError,
  newReference,
} from '../../../core/erpnext/confirmation';
import { ErpnextError } from '../../../core/erpnext/erpnext-error';
import { PurchaseApiService } from './purchase-api.service';
import { InvoicePreview, InvoiceRequest, OrderDetail } from './purchase.models';
import { BillingChangedError, SupplierInvoiceApiService } from './supplier-invoice-api.service';

export type InvoiceState =
  'idle' | 'confirming' | 'unresolved' | 'checking' | 'confirmed' | 'failed';
export type InvoiceFailure = 'permission' | 'offline' | 'changed' | 'error';

/** State of one "Record supplier invoice" task for an order, from the supplier's number to the invoice. */
@Injectable({ providedIn: 'root' })
export class SupplierInvoiceStore {
  private readonly orders = inject(PurchaseApiService);
  private readonly api = inject(SupplierInvoiceApiService);

  readonly reference = signal(newReference('BILL'));
  /** The order being billed, by name; set before it has loaded. */
  readonly orderName = signal<string | null>(null);
  readonly order = signal<OrderDetail | null>(null);
  readonly preview = signal<InvoicePreview | null>(null);
  readonly billNo = signal('');
  readonly draft = signal<string | null>(null);
  readonly state = signal<InvoiceState>('idle');
  readonly failure = signal<InvoiceFailure | null>(null);
  /** The posted invoice's name. */
  readonly result = signal<string | null>(null);
  /** The recorded step has shown the result; until then, returning to the task must show it. */
  readonly resultShown = signal(false);
  readonly sent = signal<InvoiceRequest | null>(null);

  readonly ready = computed(
    () =>
      !!this.order() &&
      !!this.preview()?.lines.length &&
      !this.preview()?.blocked &&
      !!this.billNo().trim() &&
      this.state() !== 'confirming',
  );
  /** A confirmation is running or its result is still open; leaving keeps the invoice. */
  readonly busy = computed(() => ['confirming', 'unresolved', 'checking'].includes(this.state()));

  constructor() {
    inject(OpenTasksService).register(this.busy);
  }

  start(order: string): void {
    const draft = this.draft();
    // Only a draft a failed or unresolved confirmation left behind; a posted invoice stays.
    if (draft && this.state() !== 'confirmed' && !this.busy()) {
      void this.api.discard(draft).catch(() => undefined);
    }
    this.reference.set(newReference('BILL'));
    this.orderName.set(order);
    this.order.set(null);
    this.preview.set(null);
    this.billNo.set('');
    this.draft.set(null);
    this.state.set('idle');
    this.failure.set(null);
    this.result.set(null);
    this.resultShown.set(false);
    this.sent.set(null);
  }

  /** Entering the task from elsewhere: keep a running, unresolved or unseen invoice; else start over. */
  resume(order: string): void {
    const keep = this.busy() || (this.state() === 'confirmed' && !this.resultShown());
    if (!keep) {
      this.start(order);
    }
  }

  /** Loads the order and what an invoice recorded now would bill. */
  async load(): Promise<void> {
    const name = this.orderName();
    if (!name) {
      throw new Error('No order to bill');
    }
    const reference = this.reference();
    const [order, preview] = await Promise.all([this.orders.order(name), this.api.preview(name)]);
    if (this.reference() !== reference) {
      return;
    }
    this.order.set(order);
    this.preview.set(preview);
  }

  setBillNo(billNo: string): void {
    this.clearFailure();
    this.billNo.set(billNo);
  }

  async confirm(): Promise<void> {
    // Set before the first await: a double tap must not record the invoice twice.
    if (this.busy()) {
      return;
    }
    const order = this.order();
    const preview = this.preview();
    if (!order || !preview || !this.ready()) {
      return;
    }
    const request: InvoiceRequest = {
      reference: this.reference(),
      order: order.name,
      billNo: this.billNo().trim(),
      receipts: preview.receipts,
      total: preview.total,
    };
    this.state.set('confirming');
    this.failure.set(null);
    this.sent.set(request);
    const current = () => this.reference() === request.reference;
    try {
      const invoice = await this.api.record(request, this.draft(), (name) => {
        if (current()) {
          this.draft.set(name);
        }
      });
      if (current()) {
        this.finish(invoice);
      }
    } catch (error) {
      if (current()) {
        this.fail(error);
      }
    }
  }

  /** After an unresolved confirmation: found shows the invoice, a draft or nothing returns to the form. */
  async checkResult(): Promise<'found' | 'not-found' | 'pending'> {
    // Only once the confirmation gave up: while it still runs, finding nothing doesn't mean nothing was posted.
    if (this.state() !== 'unresolved') {
      return 'pending';
    }
    const reference = this.reference();
    const current = () => this.reference() === reference;
    this.state.set('checking');
    try {
      const found = await this.api.find(reference);
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
      this.finish(found.invoice);
      return 'found';
    } catch {
      if (current()) {
        this.state.set('unresolved');
      }
      return 'pending';
    }
  }

  private finish(invoice: string): void {
    this.result.set(invoice);
    this.state.set('confirmed');
  }

  private fail(error: unknown): void {
    if (error instanceof UnresolvedError) {
      this.state.set('unresolved');
      return;
    }
    if (error instanceof PostedEarlierError || error instanceof BillingChangedError) {
      // An invoice (earlier or from Desk) billed these receipts meanwhile; what is left must be reloaded.
      this.draft.set(null);
      this.reference.set(newReference('BILL'));
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
}
